import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { EmployeeRecord } from "./employee-mapper";
import type { AuthorizationContext } from "./authorization";
import {
  checkSwap, createSwap, decideSwap, listSwaps, loadSwapDays, swapRelations, swapTransaction,
} from "./shift-swaps";
import { ShiftSwapError } from "./shift-swap-rules";

afterEach(() => mock.restoreAll());
function required<T>(value: T | undefined): T {
  assert.ok(value);
  return value;
}
const date = new Date("2099-06-15T00:00:00Z");
const now = new Date("2026-10-02T00:00:00Z");
const requester: AuthorizationContext = {
  userId: "user-a", employeeId: "a", login: "a", role: "EMPLOYEE",
  permissions: { requestShiftSwap: true },
};
const partner = { ...requester, userId: "user-b", employeeId: "b" };
const reviewer = { ...requester, role: "FOREMAN", permissions: { approveShiftSwap: true } };

function employee(id: string, model: string): EmployeeRecord {
  return {
    id, firstName: id === "a" ? "Anna" : "Ben", lastName: "Test",
    personnelNumber: id, email: `${id}@example.com`, isActive: true,
    annualLeaveAllowance: 30, carryOverLeaveDays: 0,
    shiftModelId: model, shiftGroupId: "group-a", createdAt: now, updatedAt: now,
    shiftModel: { id: model, code: model, name: model, active: true, rotationOrder: [], workingWeekdays: [1, 2, 3, 4, 5] },
    shiftGroup: { id: "group-a", code: "A", name: "Gruppe A", startShift: "EARLY", anchorDate: now, active: true },
    departments: [], permissions: [], shiftAssignments: [], qualifications: [], user: null,
  };
}

function record(status: "ANGEFRAGT" | "PARTNER_BESTAETIGT" = "ANGEFRAGT"): Prisma.ShiftSwapRequestGetPayload<{ include: typeof swapRelations }> {
  return {
    id: "swap-1", requesterId: "a", partnerId: "b", date,
    requesterOriginalShift: "EARLY", partnerOriginalShift: "LATE",
    requesterArea: "Verpackung", partnerArea: "Autosort",
    status, comment: "Bitte tauschen", partnerDecidedAt: null, approvedById: null,
    approvedAt: null, rejectedAt: null, cancelledAt: null, createdAt: now, updatedAt: now,
    requester: { firstName: "Anna", lastName: "Test" }, partner: { firstName: "Ben", lastName: "Test" },
  };
}

function fixture(status: "ANGEFRAGT" | "PARTNER_BESTAETIGT" = "ANGEFRAGT") {
  const db = {
    employee: { ...prisma.employee, findMany: prisma.employee.findMany },
    vacationRequest: { ...prisma.vacationRequest, findMany: prisma.vacationRequest.findMany },
    absence: { ...prisma.absence, findMany: prisma.absence.findMany },
    temporaryAssignment: { ...prisma.temporaryAssignment, findMany: prisma.temporaryAssignment.findMany },
    shiftSwapRequest: {
      ...prisma.shiftSwapRequest,
      findMany: prisma.shiftSwapRequest.findMany, findUnique: prisma.shiftSwapRequest.findUnique,
      findUniqueOrThrow: prisma.shiftSwapRequest.findUniqueOrThrow, create: prisma.shiftSwapRequest.create,
      updateMany: prisma.shiftSwapRequest.updateMany,
    },
    shiftAssignment: { ...prisma.shiftAssignment, upsert: prisma.shiftAssignment.upsert },
    notification: { ...prisma.notification, create: prisma.notification.create },
    auditLog: { ...prisma.auditLog, create: prisma.auditLog.create },
  };
  const state = { employees: [employee("a", "nur-frueh"), employee("b", "nur-spaet")], swap: record(status) };
  mock.method(db.employee, "findMany", async () => state.employees);
  mock.method(db.vacationRequest, "findMany", async () => []);
  mock.method(db.absence, "findMany", async () => []);
  mock.method(db.temporaryAssignment, "findMany", async () => []);
  mock.method(db.shiftSwapRequest, "findMany", async () => []);
  mock.method(db.shiftSwapRequest, "findUnique", async () => state.swap);
  mock.method(db.shiftSwapRequest, "findUniqueOrThrow", async () => state.swap);
  const create = mock.method(db.shiftSwapRequest, "create", async () => state.swap);
  const update = mock.method(db.shiftSwapRequest, "updateMany", async (args: Prisma.ShiftSwapRequestUpdateManyArgs) => {
    const statusValue = args.data.status;
    if (typeof statusValue === "string") state.swap.status = statusValue;
    return { count: 1 };
  });
  const shifts = mock.method(db.shiftAssignment, "upsert", async () => ({}));
  const notifications = mock.method(db.notification, "create", async () => ({}));
  const audit = mock.method(db.auditLog, "create", async () => ({}));
  return { db, state, create, update, shifts, notifications, audit };
}

test("creation captures both original shifts and notifies only the partner without altering shifts", async () => {
  const f = fixture();
  const result = await createSwap(f.db, requester, { partnerId: "b", date: "2099-06-15", comment: "Bitte tauschen" });
  assert.equal(result.status, "ANGEFRAGT");
  const args = required(f.create.mock.calls[0].arguments[0]);
  assert.equal(args.data.requesterId, "a");
  assert.equal(args.data.requesterOriginalShift, "EARLY");
  assert.equal(args.data.partnerOriginalShift, "LATE");
  assert.equal(f.shifts.mock.callCount(), 0);
  assert.equal(required(f.notifications.mock.calls[0].arguments[0]).data.employeeId, "b");
  assert.equal(required(f.notifications.mock.calls[0].arguments[0]).data.type, "SWAP_REQUESTED");
  assert.equal(required(f.audit.mock.calls[0].arguments[0]).data.action, "shift_swap.request");
});

test("partner consent updates state and audit but never writes either shift", async () => {
  const f = fixture();
  const result = await decideSwap(f.db, partner, "swap-1", "confirm");
  assert.equal(result.status, "PARTNER_BESTAETIGT");
  assert.equal(f.shifts.mock.callCount(), 0);
  assert.equal(required(f.notifications.mock.calls[0].arguments[0]).data.type, "SWAP_PARTNER_CONFIRMED");
  assert.equal(required(f.notifications.mock.calls[0].arguments[0]).data.employeeId, "a");
  assert.ok(f.update.mock.calls[0].arguments[0].data.partnerDecidedAt instanceof Date);
});

test("approval writes exactly two opposite MANUAL assignments for just the requested date", async () => {
  const f = fixture("PARTNER_BESTAETIGT");
  const result = await decideSwap(f.db, reviewer, "swap-1", "approve");
  assert.equal(result.status, "GENEHMIGT");
  assert.equal(f.shifts.mock.callCount(), 2);
  for (const [index, id, shift] of [[0, "a", "LATE"], [1, "b", "EARLY"]] as const) {
    const args = required(f.shifts.mock.calls[index].arguments[0]);
    assert.deepEqual(args.where, { employeeId_date: { employeeId: id, date } });
    assert.equal(args.create.shift, shift);
    assert.equal(args.create.source, "MANUAL");
    assert.equal(args.update.shift, shift);
    assert.match(String(args.update.note), /swap-1/);
  }
  assert.equal(f.notifications.mock.callCount(), 2);
  assert.deepEqual(f.notifications.mock.calls.map((call) => required(call.arguments[0]).data.employeeId), ["a", "b"]);
  assert.equal(required(f.audit.mock.calls[0].arguments[0]).data.action, "shift_swap.approve");
  assert.equal(f.update.mock.calls[0].arguments[0].data.approvedById, reviewer.userId);
});

for (const [action, status, actor, notificationType] of [
  ["decline", "ANGEFRAGT", partner, "SWAP_PARTNER_REJECTED"],
  ["reject", "PARTNER_BESTAETIGT", reviewer, "SWAP_REJECTED"],
  ["cancel", "ANGEFRAGT", requester, "SWAP_CANCELLED"],
] as const) {
  test(`${action} never applies shifts and creates the matching audit and notification`, async () => {
    const f = fixture(status);
    await decideSwap(f.db, actor, "swap-1", action);
    assert.equal(f.shifts.mock.callCount(), 0);
    assert.equal(required(f.notifications.mock.calls[0].arguments[0]).data.type, notificationType);
    assert.equal(required(f.audit.mock.calls[0].arguments[0]).data.action, `shift_swap.${action}`);
  });
}

test("new absences block approval before any status, assignment or notification writes", async () => {
  const f = fixture("PARTNER_BESTAETIGT");
  mock.method(f.db.absence, "findMany", async () => [{ employeeId: "b" }]);
  await assert.rejects(decideSwap(f.db, reviewer, "swap-1", "approve"), (error: unknown) =>
    error instanceof ShiftSwapError && error.warnings.some((warning) => warning.includes("Abwesenheit")));
  assert.equal(f.update.mock.callCount(), 0);
  assert.equal(f.shifts.mock.callCount(), 0);
  assert.equal(f.notifications.mock.callCount(), 0);
});

test("changed rotation, inactive employees, same shifts, self-swaps and past dates are blocked", async () => {
  const f = fixture("PARTNER_BESTAETIGT");
  f.state.employees[0].shiftModel.code = "nur-spaet";
  await assert.rejects(checkSwap(f.db, "a", "b", date, f.state.swap), (error: unknown) =>
    error instanceof ShiftSwapError && error.warnings.some((warning) => warning.includes("seit der Anfrage")));
  await assert.rejects(checkSwap(f.db, "a", "b", date), (error: unknown) =>
    error instanceof ShiftSwapError && error.warnings.some((warning) => warning.includes("dieselbe Schicht")));
  f.state.employees[0].isActive = false;
  await assert.rejects(checkSwap(f.db, "a", "b", date), (error: unknown) =>
    error instanceof ShiftSwapError && error.warnings.some((warning) => warning.includes("inaktiv")));
  await assert.rejects(checkSwap(f.db, "a", "a", date), /nicht mit dir selbst/);
  await assert.rejects(checkSwap(f.db, "a", "b", new Date("2020-01-01")), /zukünftige/);
});

test("manual assignments block even when they have the same shift as the rotation", async () => {
  const f = fixture();
  f.state.employees[0].shiftAssignments.push({
    id: "manual-1", employeeId: "a", date, shift: "EARLY", source: "MANUAL",
    note: null, createdAt: now, updatedAt: now,
  });
  await assert.rejects(checkSwap(f.db, "a", "b", date), (error: unknown) =>
    error instanceof ShiftSwapError && error.warnings.some((warning) => warning.includes("manuelle")));
});

test("overlapping vacation, temporary assignment and open swaps on either side block submission", async () => {
  const f = fixture();
  mock.method(f.db.vacationRequest, "findMany", async () => [{ employeeId: "a" }]);
  mock.method(f.db.temporaryAssignment, "findMany", async () => [{ employeeId: "b" }]);
  mock.method(f.db.shiftSwapRequest, "findMany", async () => [{ requesterId: "c", partnerId: "a" }]);
  await assert.rejects(createSwap(f.db, requester, { partnerId: "b", date: "2099-06-15" }), (error: unknown) =>
    error instanceof ShiftSwapError && error.warnings.length === 3);
  assert.equal(f.create.mock.callCount(), 0);
});

test("conflict queries cover both participants, inclusive day ranges and both open states", async () => {
  const f = fixture();
  const vacations = mock.method(f.db.vacationRequest, "findMany", async (args: Prisma.VacationRequestFindManyArgs) => {
    assert.deepEqual(args.where, {
      employeeId: { in: ["a", "b"] }, startDate: { lte: date }, endDate: { gte: date },
      status: { in: ["REQUESTED", "APPROVED"] },
    });
    return [];
  });
  mock.method(f.db.shiftSwapRequest, "findMany", async (args: Prisma.ShiftSwapRequestFindManyArgs) => {
    assert.deepEqual(args.where, {
      date, status: { in: ["ANGEFRAGT", "PARTNER_BESTAETIGT"] },
      OR: [{ requesterId: { in: ["a", "b"] } }, { partnerId: { in: ["a", "b"] } }],
      id: { not: "swap-1" },
    });
    return [];
  });
  await checkSwap(f.db, "a", "b", date, f.state.swap);
  assert.equal(vacations.mock.callCount(), 1);
});

test("partner directory requests only active employees", async () => {
  const f = fixture();
  mock.method(f.db.employee, "findMany", async (args: Prisma.EmployeeFindManyArgs) => {
    assert.deepEqual(args.where, { isActive: true });
    return f.state.employees;
  });
  await loadSwapDays(f.db, date);
});

test("simultaneous decisions fail without applying assignments or generating duplicate notifications", async () => {
  const f = fixture("PARTNER_BESTAETIGT");
  mock.method(f.db.shiftSwapRequest, "updateMany", async () => ({ count: 0 }));
  await assert.rejects(decideSwap(f.db, reviewer, "swap-1", "approve"), /inzwischen geändert/);
  assert.equal(f.shifts.mock.callCount(), 0);
  assert.equal(f.notifications.mock.callCount(), 0);
});

test("notification or second-assignment failures propagate to the transaction boundary", async () => {
  const f = fixture("PARTNER_BESTAETIGT");
  mock.method(f.db.notification, "create", async () => { throw new Error("Notification storage failure"); });
  await assert.rejects(decideSwap(f.db, reviewer, "swap-1", "approve"), /Notification storage/);
  assert.equal(f.audit.mock.callCount(), 0);
  const g = fixture("PARTNER_BESTAETIGT");
  let writes = 0;
  mock.method(g.db.shiftAssignment, "upsert", async () => {
    if (++writes === 2) throw new Error("Second assignment failure");
    return {};
  });
  await assert.rejects(decideSwap(g.db, reviewer, "swap-1", "approve"), /Second assignment/);
  assert.equal(g.notifications.mock.callCount(), 0);
});

test("transaction isolation is serializable to prevent concurrent overlapping requests", async () => {
  const runner = { $transaction: prisma.$transaction };
  mock.method(runner, "$transaction", async (_work: unknown, options: unknown) => {
    assert.deepEqual(options, { isolationLevel: "Serializable" });
    return "verified";
  });
  assert.equal(await swapTransaction(async () => "verified", runner), "verified");
});

test("personal listing is scoped even for admins; all-listing requires a reviewer", async () => {
  const f = fixture();
  mock.method(f.db.shiftSwapRequest, "findMany", async (args: Prisma.ShiftSwapRequestFindManyArgs) => {
    assert.deepEqual(args.where, { OR: [{ requesterId: "a" }, { partnerId: "a" }] });
    return [];
  });
  assert.deepEqual(await listSwaps({ ...requester, role: "ADMIN" }, false, f.db), []);
  await assert.rejects(listSwaps(requester, true, f.db), /Keine Berechtigung/);
  await assert.rejects(listSwaps({ ...requester, employeeId: null }, false, f.db), /Keine Berechtigung/);
});
