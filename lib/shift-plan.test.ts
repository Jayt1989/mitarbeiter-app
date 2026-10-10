import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { AuthorizationContext } from "./authorization";
import { loadShiftPlan } from "./shift-plan";

afterEach(() => mock.restoreAll());
const context: AuthorizationContext = {
  userId: "user-a", employeeId: "employee-a", login: "a", role: "EMPLOYEE",
  permissions: { ownShiftPlan: true, requestShiftSwap: true },
};

function fixture() {
  const db = {
    employee: { ...prisma.employee, findMany: prisma.employee.findMany },
    vacationRequest: { ...prisma.vacationRequest, findMany: prisma.vacationRequest.findMany },
    absence: { ...prisma.absence, findMany: prisma.absence.findMany },
    temporaryAssignment: { ...prisma.temporaryAssignment, findMany: prisma.temporaryAssignment.findMany },
  };
  mock.method(db.employee, "findMany", async () => []);
  mock.method(db.vacationRequest, "findMany", async () => []);
  mock.method(db.absence, "findMany", async () => []);
  mock.method(db.temporaryAssignment, "findMany", async () => []);
  return db;
}

test("own-only shift plan filters by the real employee ID, not the selected employee or demo user", async () => {
  const db = fixture();
  mock.method(db.employee, "findMany", async (args: Prisma.EmployeeFindManyArgs) => {
    assert.deepEqual(args.where, { isActive: true, id: { in: ["employee-a"] } });
    return [];
  });
  const result = await loadShiftPlan(context, false, db);
  assert.deepEqual(result, { employees: [], vacations: [], absences: [], assignments: [] });
});

test("team shift plan permission allows selecting all active employees", async () => {
  const db = fixture();
  mock.method(db.employee, "findMany", async (args: Prisma.EmployeeFindManyArgs) => {
    assert.deepEqual(args.where, { isActive: true });
    return [];
  });
  await loadShiftPlan({ ...context, role: "FOREMAN", permissions: { teamShiftPlan: true } }, false, db);
});

test("staffing preserves existing admin employee-view access without granting team-plan rights", async () => {
  const db = fixture();
  const admin = {
    ...context, role: "ADMIN", permissions: { ownShiftPlan: true, openAdmin: true, viewEmployees: true },
  };
  const filters: unknown[] = [];
  mock.method(db.employee, "findMany", async (args: Prisma.EmployeeFindManyArgs) => {
    filters.push(args.where);
    return [];
  });
  await loadShiftPlan(admin, true, db);
  await loadShiftPlan(admin, false, db);
  assert.deepEqual(filters, [{ isActive: true }, { isActive: true, id: { in: ["employee-a"] } }]);
});

test("own-plan rights alone do not authorize reading team staffing", async () => {
  await assert.rejects(loadShiftPlan(context, true, fixture()), /Keine Berechtigung/);
});

test("requesting shift swaps does not implicitly grant plan-reading rights", async () => {
  await assert.rejects(loadShiftPlan({ ...context, permissions: { requestShiftSwap: true } }, false, fixture()), /Keine Berechtigung/);
});

test("all related planning queries stay limited to the authorized employees", async () => {
  const db = fixture();
  mock.method(db.vacationRequest, "findMany", async (args: Prisma.VacationRequestFindManyArgs) => {
    assert.deepEqual(args.where, { employeeId: { in: [] }, status: { not: "CANCELLED" } });
    return [];
  });
  mock.method(db.absence, "findMany", async (args: Prisma.AbsenceFindManyArgs) => {
    assert.deepEqual(args.where, { employeeId: { in: [] } });
    return [];
  });
  mock.method(db.temporaryAssignment, "findMany", async (args: Prisma.TemporaryAssignmentFindManyArgs) => {
    assert.deepEqual(args.where, { employeeId: { in: [] }, cancelledAt: null });
    return [];
  });
  await loadShiftPlan(context, false, db);
});
