import { AbsenceType, type Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { AuthorizationContext } from "./authorization";
import { employeeRelations, toEmployeeDto } from "./employee-mapper";
import { toVacationRequestDto } from "./vacation-mapper";
import { temporaryAssignmentRelations, toTemporaryAssignmentDto } from "./assignment-mapper";
import { ShiftSwapError } from "./shift-swap-rules";
import type { AbsenceEntry } from "@/app/admin/staffing-data";

const absenceLabels: Record<AbsenceType, AbsenceEntry["type"]> = {
  SICK: "Krank", TRAINING: "Schulung", SPECIAL_LEAVE: "Sonderurlaub",
  TIME_OFF: "Sonstige Abwesenheit", OTHER: "Sonstige Abwesenheit",
};

type PlanningDatabase = Pick<Prisma.TransactionClient,
  "employee" | "vacationRequest" | "absence" | "temporaryAssignment"
>;

export async function loadShiftPlan(
  context: AuthorizationContext, staffing = false, db: PlanningDatabase = prisma,
) {
  const staffingAccess = staffing && context.role === "ADMIN" && context.permissions.openAdmin === true &&
    (context.permissions.viewEmployees === true || context.permissions.editEmployees === true);
  const team = context.permissions.teamShiftPlan === true || staffingAccess;
  if (!team && (staffing || context.permissions.ownShiftPlan !== true)) {
    throw new ShiftSwapError("Keine Berechtigung für den Schichtplan.", 403);
  }
  const employees = await db.employee.findMany({
    where: {
      isActive: true,
      ...(team ? {} : { id: context.employeeId ?? "__none__" }),
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
    employees: employees.map(toEmployeeDto),
    vacations: vacations.map((record) => {
      const showDetails = record.employeeId === context.employeeId
        ? context.permissions.ownVacation === true : context.permissions.otherVacations === true;
      return { ...toVacationRequestDto(record), comment: showDetails ? record.comment ?? "" : "" };
    }),
    absences: absences.map((record): AbsenceEntry => ({
      employeeId: record.employeeId, type: absenceLabels[record.type],
      startDate: record.startDate.toISOString().slice(0, 10),
      endDate: record.endDate.toISOString().slice(0, 10),
      approval: record.status === "REQUESTED" ? "Beantragt" : record.status === "APPROVED" ? "Genehmigt" : "Erfasst",
    })),
    assignments: assignments.map(toTemporaryAssignmentDto),
  };
}
export type ShiftPlanData = Awaited<ReturnType<typeof loadShiftPlan>>;
