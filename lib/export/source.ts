import { AbsenceStatus, AbsenceType, VacationStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { employeeRelations, toEmployeeDto } from "@/lib/employee-mapper";
import { toAreaConfiguration } from "@/lib/area-mapper";
import { temporaryAssignmentRelations, toTemporaryAssignmentDto } from "@/lib/assignment-mapper";
import { toVacationRequestDto } from "@/lib/vacation-mapper";
import { loadCalendarData } from "@/lib/calendar-server";
import { dateKeyToUtc, type CalendarData } from "@/lib/calendar";
import type { Employee } from "@/app/mitarbeiter/data";
import type { AreaConfiguration } from "@/app/admin/areas-data";
import type { TemporaryAssignment } from "@/app/admin/assignments-data";
import type { VacationRequest } from "@/app/urlaub/vacation-data";

export type ExportAbsenceKind = "Krank" | "Schulung" | "Sonderurlaub" | "Freizeitausgleich" | "Sonstige Abwesenheit";

export type ExportAbsence = {
  id: string;
  employeeId: string;
  kind: ExportAbsenceKind;
  status: "Erfasst" | "Genehmigt" | "Beantragt";
  startDate: string;
  endDate: string;
};

export type ExportSource = {
  from: string;
  to: string;
  employees: Employee[];
  areaConfiguration: AreaConfiguration;
  vacations: VacationRequest[];
  absences: ExportAbsence[];
  assignments: TemporaryAssignment[];
  calendar: CalendarData;
  qualificationNames: Map<string, string>;
};

/** Nur Art und Zeitraum – keine Diagnosen oder Freitexte. */
const absenceKinds: Record<AbsenceType, ExportAbsenceKind> = {
  [AbsenceType.SICK]: "Krank",
  [AbsenceType.TRAINING]: "Schulung",
  [AbsenceType.SPECIAL_LEAVE]: "Sonderurlaub",
  [AbsenceType.TIME_OFF]: "Freizeitausgleich",
  [AbsenceType.OTHER]: "Sonstige Abwesenheit",
};

const absenceStatuses: Record<AbsenceStatus, ExportAbsence["status"]> = {
  [AbsenceStatus.RECORDED]: "Erfasst",
  [AbsenceStatus.APPROVED]: "Genehmigt",
  [AbsenceStatus.REQUESTED]: "Beantragt",
};

/**
 * Lädt alle Exportdaten für einen Zeitraum mit einer festen Anzahl gebündelter Abfragen –
 * unabhängig von der Anzahl der Mitarbeiter.
 */
export async function loadExportSource(options: {
  from: string;
  to: string;
  employeeIds?: string[];
  includeInactive?: boolean;
}): Promise<ExportSource> {
  const from = dateKeyToUtc(options.from);
  const to = dateKeyToUtc(options.to);
  const employeeFilter: Prisma.EmployeeWhereInput = {
    ...(options.employeeIds ? { id: { in: options.employeeIds } } : {}),
    ...(options.includeInactive ? {} : { isActive: true }),
  };
  const overlapping = { startDate: { lte: to }, endDate: { gte: from } };
  const relatedEmployee = options.employeeIds ? { employeeId: { in: options.employeeIds } } : {};

  const [employeeRecords, departments, vacationRecords, absenceRecords, assignmentRecords, calendar, qualifications] =
    await Promise.all([
      prisma.employee.findMany({
        where: employeeFilter,
        include: {
          ...employeeRelations,
          shiftAssignments: { where: { date: { gte: from, lte: to } } },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),
      prisma.department.findMany({ include: { minimumStaffing: true }, orderBy: { name: "asc" } }),
      prisma.vacationRequest.findMany({
        where: {
          ...relatedEmployee,
          ...overlapping,
          status: { in: [VacationStatus.REQUESTED, VacationStatus.APPROVED] },
        },
        orderBy: { startDate: "asc" },
      }),
      prisma.absence.findMany({
        where: { ...relatedEmployee, ...overlapping },
        select: { id: true, employeeId: true, type: true, status: true, startDate: true, endDate: true },
        orderBy: { startDate: "asc" },
      }),
      prisma.temporaryAssignment.findMany({
        where: { ...relatedEmployee, ...overlapping, cancelledAt: null },
        include: temporaryAssignmentRelations,
      }),
      loadCalendarData(),
      prisma.qualification.findMany({ select: { id: true, name: true } }),
    ]);

  return {
    from: options.from,
    to: options.to,
    employees: employeeRecords.map(toEmployeeDto),
    areaConfiguration: toAreaConfiguration(departments),
    vacations: vacationRecords.map(toVacationRequestDto),
    absences: absenceRecords.map((entry) => ({
      id: entry.id,
      employeeId: entry.employeeId,
      kind: absenceKinds[entry.type],
      status: absenceStatuses[entry.status],
      startDate: entry.startDate.toISOString().slice(0, 10),
      endDate: entry.endDate.toISOString().slice(0, 10),
    })),
    assignments: assignmentRecords.map(toTemporaryAssignmentDto),
    calendar,
    qualificationNames: new Map(qualifications.map((entry) => [entry.id, entry.name])),
  };
}
