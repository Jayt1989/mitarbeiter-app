import { AbsenceType, type Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { hasPermission, type AuthorizationContext } from "./authorization";
import { employeeRelations, toEmployeeDto } from "./employee-mapper";
import { toVacationRequestDto } from "./vacation-mapper";
import { temporaryAssignmentRelations, toTemporaryAssignmentDto } from "./assignment-mapper";
import { ShiftSwapError } from "./shift-swap-rules";
import type { AbsenceEntry } from "@/app/admin/staffing-data";
import { toOverviewEmployee } from "./employee-overview";

const absenceLabels: Record<AbsenceType, AbsenceEntry["type"]> = {
  SICK: "Krank", TRAINING: "Schulung", SPECIAL_LEAVE: "Sonderurlaub",
  TIME_OFF: "Sonstige Abwesenheit", OTHER: "Sonstige Abwesenheit",
};

type PlanningDatabase = Pick<Prisma.TransactionClient,
  "employee" | "vacationRequest" | "absence" | "temporaryAssignment"
>;

export async function loadShiftPlan(
  context: AuthorizationContext, staffing = false, db: PlanningDatabase = prisma, assignmentOverview = false,
) {
  if (assignmentOverview && !hasPermission(context, "editAssignments")) {
    throw new ShiftSwapError("Keine Berechtigung für die Einsatzplanung.", 403);
  }
  const staffingAccess = staffing && context.role === "ADMIN" && context.permissions.openAdmin === true &&
    (context.permissions.viewEmployees === true || context.permissions.editEmployees === true);
  const team = hasPermission(context, "teamShiftPlan") || staffingAccess || assignmentOverview;
  if (!team && (staffing || !hasPermission(context, "ownShiftPlan") || !context.employeeId)) {
    throw new ShiftSwapError("Keine Berechtigung für den Schichtplan.", 403);
  }
  const employees = await db.employee.findMany({
    where: {
      isActive: true,
      ...(team ? {} : { id: { in: context.employeeId ? [context.employeeId] : [] } }),
    },
    include: employeeRelations,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const employeeId = { in: employees.map((employee) => employee.id) };
  const [vacations, absences, assignments] = await Promise.all([
    db.vacationRequest.findMany({ where: { employeeId, status: { not: "CANCELLED" } } }),
    db.absence.findMany({ where: { employeeId } }),
    db.temporaryAssignment.findMany({
      where: { employeeId, cancelledAt: null }, include: temporaryAssignmentRelations,
    }),
  ]);
  return {
    employees: employees.map((record) => {
      const employee = toEmployeeDto(record);
      return assignmentOverview ? toOverviewEmployee(employee, "assignments") : employee;
    }),
    vacations: vacations.map((record) => {
      const showDetails = record.employeeId === context.employeeId
        ? context.permissions.ownVacation === true : context.permissions.otherVacations === true;
      return { ...toVacationRequestDto(record), comment: showDetails && !assignmentOverview ? record.comment ?? "" : "" };
    }),
    absences: absences.map((record): AbsenceEntry => ({
      employeeId: record.employeeId,
      type: assignmentOverview ? "Sonstige Abwesenheit" : absenceLabels[record.type],
      startDate: record.startDate.toISOString().slice(0, 10),
      endDate: record.endDate.toISOString().slice(0, 10),
      approval: record.status === "REQUESTED" ? "Beantragt" : record.status === "APPROVED" ? "Genehmigt" : "Erfasst",
    })),
    assignments: assignments.map(toTemporaryAssignmentDto),
  };
}
export type ShiftPlanData = Awaited<ReturnType<typeof loadShiftPlan>>;
