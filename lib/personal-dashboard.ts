import { AbsenceStatus, AbsenceType as PrismaAbsenceType, VacationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuthorizationContext } from "@/lib/authorization";
import { employeeRelations, toEmployeeDto } from "@/lib/employee-mapper";
import { temporaryAssignmentRelations, toTemporaryAssignmentDto } from "@/lib/assignment-mapper";
import { toVacationRequestDto } from "@/lib/vacation-mapper";
import type { Employee } from "@/app/mitarbeiter/data";
import { toEmployeeShiftPlan } from "@/app/mitarbeiter/schedule";
import { getShiftForDate, shiftModelLabels, type Shift } from "@/app/schichtplan/rotation";
import { countVacationDaysInYear, type VacationRequest } from "@/app/urlaub/vacation-data";
import { getAssignmentForDay, type TemporaryAssignment } from "@/app/admin/assignments-data";
import type { AbsenceType } from "@/app/admin/staffing-data";
import { addDaysToKey, berlinNowParts, dateKeyToUtc, getCalendarMarks, type CalendarMarks } from "@/lib/calendar";
import { loadCalendarData } from "@/lib/calendar-server";
import { performanceVisibility } from "@/lib/performance-rules";
import { canAdditionalShift } from "@/lib/additional-shift-rules";

/** Anzeige ohne medizinische Details: Krankheit erscheint nur als „Krank / abwesend“. */
const absenceLabels: Record<PrismaAbsenceType, string> = {
  [PrismaAbsenceType.SICK]: "Krank / abwesend",
  [PrismaAbsenceType.TRAINING]: "Schulung",
  [PrismaAbsenceType.SPECIAL_LEAVE]: "Sonderurlaub",
  [PrismaAbsenceType.TIME_OFF]: "Freizeitausgleich",
  [PrismaAbsenceType.OTHER]: "Sonstige Abwesenheit",
};

/** Zuordnung zu den Farben des Jahresplans. */
const absenceStyleKeys: Record<PrismaAbsenceType, AbsenceType> = {
  [PrismaAbsenceType.SICK]: "Krank",
  [PrismaAbsenceType.TRAINING]: "Schulung",
  [PrismaAbsenceType.SPECIAL_LEAVE]: "Sonderurlaub",
  [PrismaAbsenceType.TIME_OFF]: "Sonstige Abwesenheit",
  [PrismaAbsenceType.OTHER]: "Sonstige Abwesenheit",
};

export type DashboardAbsence = {
  id: string;
  label: string;
  styleKey: AbsenceType;
  startDate: string;
  endDate: string;
  requested: boolean;
};

export type DashboardDay = {
  date: string;
  kind: "shift" | "free" | "unplanned" | "vacation" | "absence";
  shift: Shift | null;
  absence: DashboardAbsence | null;
  areaName: string | null;
  assignment: TemporaryAssignment | null;
  marks: CalendarMarks;
  additionalShift?: NonNullable<Employee["additionalShifts"]>[string] | null;
};

export type PersonalDashboardData = {
  greeting: string;
  todayKey: string;
  employee: Employee;
  areaName: string | null;
  shiftModelLabel: string;
  permissions: {
    shiftPlan: boolean;
    yearPlan: boolean;
    ownVacation: boolean;
    requestVacation: boolean;
    qualifications: boolean;
    shiftSwap: boolean;
    performance: boolean;
    performanceReport: boolean;
    performanceTargets: boolean;
    additionalShifts?: boolean;
  };
  today: DashboardDay | null;
  nextShift: DashboardDay | null;
  upcomingAdditionalShift?: DashboardDay | null;
  week: DashboardDay[];
  vacation: {
    year: number;
    annualAllowance: number;
    carryOverDays: number;
    approvedDays: number;
    requestedDays: number;
    openRequests: number;
    availableDays: number;
    nextVacation: VacationRequest | null;
  } | null;
  absences: DashboardAbsence[];
  upcomingAssignment: TemporaryAssignment | null;
  qualifications: { id: string; name: string; level: number }[] | null;
};

function greetingFor(hour: number) {
  if (hour >= 5 && hour < 11) return "Guten Morgen";
  if (hour >= 11 && hour < 18) return "Guten Tag";
  return "Guten Abend";
}

const toDate = dateKeyToUtc;
const addDays = addDaysToKey;

function mondayOf(dateKey: string) {
  const weekday = (toDate(dateKey).getUTCDay() + 6) % 7;
  return addDays(dateKey, -weekday);
}

/**
 * Lädt ausschließlich Daten des angemeldeten Mitarbeiters. Die Mitarbeiter-ID stammt aus der
 * serverseitigen Sitzung, nie aus URL oder Request.
 */
export async function loadPersonalDashboard(
  context: AuthorizationContext,
): Promise<PersonalDashboardData | null> {
  if (!context.employeeId) return null;
  const employeeId = context.employeeId;
  const permissions = {
    shiftPlan: context.permissions.ownShiftPlan === true,
    yearPlan: context.permissions.ownShiftPlan === true || context.permissions.teamShiftPlan === true,
    ownVacation: context.permissions.ownVacation === true,
    requestVacation: context.permissions.requestVacation === true,
    qualifications:
      context.permissions.ownQualifications === true || context.permissions.viewQualifications === true,
    shiftSwap: context.permissions.requestShiftSwap === true,
    additionalShifts: canAdditionalShift(context, "viewAdditionalShifts"),
    ...performanceVisibility(context),
  };

  const { dateKey: todayKey, hour } = berlinNowParts();
  const year = Number(todayKey.slice(0, 4));
  const weekStart = mondayOf(todayKey);
  const lookaheadEnd = addDays(todayKey, 60);

  const record = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: employeeRelations,
  });
  if (!record) return null;
  const employee = toEmployeeDto(record);
  const areaName = record.departments.find((entry) => entry.isPrimary)?.department.name ?? null;

  const [vacationRecords, vacationAccount, absenceRecords, assignmentRecords, qualificationRecords, calendar] =
    await Promise.all([
      permissions.ownVacation || permissions.shiftPlan
        ? prisma.vacationRequest.findMany({
            where: { employeeId, status: { in: [VacationStatus.REQUESTED, VacationStatus.APPROVED] } },
            orderBy: { startDate: "asc" },
          })
        : Promise.resolve([]),
      permissions.ownVacation
        ? prisma.vacationAccount.findUnique({ where: { employeeId_year: { employeeId, year } } })
        : Promise.resolve(null),
      permissions.shiftPlan
        ? prisma.absence.findMany({
            where: { employeeId, endDate: { gte: toDate(weekStart) } },
            orderBy: { startDate: "asc" },
          })
        : Promise.resolve([]),
      permissions.shiftPlan
        ? prisma.temporaryAssignment.findMany({
            where: { employeeId, cancelledAt: null, endDate: { gte: toDate(weekStart) } },
            include: temporaryAssignmentRelations,
            orderBy: { startDate: "asc" },
          })
        : Promise.resolve([]),
      permissions.qualifications
        ? prisma.employeeQualification.findMany({
            where: { employeeId, level: { gt: 0 }, qualification: { active: true } },
            include: { qualification: true },
            orderBy: { qualification: { name: "asc" } },
          })
        : Promise.resolve(null),
      loadCalendarData(),
    ]);

  const vacations = vacationRecords.map(toVacationRequestDto);
  const approvedVacations = vacations.filter((entry) => entry.status === "Genehmigt");
  const assignments = assignmentRecords.map(toTemporaryAssignmentDto);
  const absences: DashboardAbsence[] = absenceRecords.map((entry) => ({
    id: entry.id,
    label: absenceLabels[entry.type],
    styleKey: absenceStyleKeys[entry.type],
    startDate: entry.startDate.toISOString().slice(0, 10),
    endDate: entry.endDate.toISOString().slice(0, 10),
    requested: entry.status === AbsenceStatus.REQUESTED,
  }));
  const plan = toEmployeeShiftPlan(employee);

  function dayInfo(dateKey: string): DashboardDay {
    const shift = getShiftForDate(toDate(dateKey), plan);
    const marks = getCalendarMarks(dateKey, calendar);
    const additionalShift = employee.additionalShifts?.[dateKey] ?? null;
    const base = { date: dateKey, shift, marks, absence: null, areaName: null, assignment: null, additionalShift };
    const covers = (entry: { startDate: string; endDate: string }) =>
      entry.startDate <= dateKey && entry.endDate >= dateKey;

    // Genehmigter Urlaub und erfasste Abwesenheiten haben Vorrang vor Schicht und Einsatz.
    if (approvedVacations.some(covers)) return { ...base, kind: "vacation" };
    const absence = absences.find((entry) => !entry.requested && covers(entry)) ?? null;
    if (absence) return { ...base, kind: "absence", absence };
    if (shift === null) return { ...base, kind: "unplanned" };
    if (shift === "Frei") return { ...base, kind: "free" };

    // Ein Feiertag ändert die geplante Schicht nicht, er wird nur markiert.
    const assignment = getAssignmentForDay(employeeId, dateKey, shift, assignments);
    return {
      ...base,
      kind: "shift",
      areaName: additionalShift?.departmentName ?? assignment?.areaName ?? areaName,
      assignment,
    };
  }

  let nextShift: DashboardDay | null = null;
  if (permissions.shiftPlan) {
    for (let dateKey = addDays(todayKey, 1); dateKey <= lookaheadEnd; dateKey = addDays(dateKey, 1)) {
      const info = dayInfo(dateKey);
      if (info.kind === "shift") {
        nextShift = info;
        break;
      }
    }
  }

  let vacation: PersonalDashboardData["vacation"] = null;
  if (permissions.ownVacation) {
    const annualAllowance = vacationAccount?.annualAllowance ?? employee.annualLeaveAllowance;
    const carryOverDays = vacationAccount?.carryOverDays ?? employee.carryOverLeaveDays;
    const daysInYear = (status: VacationRequest["status"]) =>
      vacations
        .filter((entry) => entry.status === status)
        .reduce((sum, entry) => sum + countVacationDaysInYear(employee, entry, year, calendar.state), 0);
    const approvedDays = daysInYear("Genehmigt");
    const requestedDays = daysInYear("Beantragt");

    vacation = {
      year,
      annualAllowance,
      carryOverDays,
      approvedDays,
      requestedDays,
      openRequests: vacations.filter((entry) => entry.status === "Beantragt").length,
      availableDays: annualAllowance + carryOverDays - approvedDays - requestedDays,
      nextVacation: approvedVacations.find((entry) => entry.startDate > todayKey) ?? null,
    };
  }

  return {
    greeting: greetingFor(hour),
    todayKey,
    employee,
    areaName,
    shiftModelLabel: shiftModelLabels[employee.shiftModel],
    permissions,
    today: permissions.shiftPlan ? dayInfo(todayKey) : null,
    nextShift,
    upcomingAdditionalShift: permissions.shiftPlan
      ? Object.keys(employee.additionalShifts ?? {}).sort().filter((date) => date >= todayKey)
        .map(dayInfo).find((day) => day.kind === "shift") ?? null : null,
    week: permissions.shiftPlan
      ? Array.from({ length: 7 }, (_, index) => dayInfo(addDays(weekStart, index)))
      : [],
    vacation,
    absences: absences.filter((entry) => entry.endDate >= todayKey).slice(0, 5),
    upcomingAssignment: assignments.find((entry) => entry.endDate >= todayKey) ?? null,
    qualifications: qualificationRecords
      ? qualificationRecords.map((entry) => ({
          id: entry.qualificationId,
          name: entry.qualification.name,
          level: entry.level,
        }))
      : null,
  };
}
