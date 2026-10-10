import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { analyzeEmployeeDeletion, deleteEmployeePermanently, isProtectedPersonnelNumber } from "./employee-deletion";

type Counts = Partial<Record<string, number>>;

function fakeDb(options: {
  employee: { id: string; personnelNumber: string; isActive: boolean; role?: string; userActive?: boolean };
  counts?: Counts;
}) {
  const calls: string[] = [];
  const { employee } = options;
  const counts = options.counts ?? {};
  const counter = (model: string) => ({
    count: async ({ where }: { where: Record<string, unknown> }) => {
      const key = model === "shiftAssignment"
        ? `${model}:${where.source}`
        : model === "shiftSwapRequest" && "status" in where
          ? `${model}:${typeof where.status === "string" ? "approved" : "other"}`
          : model === "vacationRequest" && "status" in where
            ? `${model}:approved`
            : "approvedById" in where || "recordedById" in where || "createdById" in where
              ? `${model}:byUser`
              : "actorUserId" in where ? `${model}:actor` : model;
      return counts[key] ?? 0;
    },
    deleteMany: async () => { calls.push(`${model}.deleteMany`); return { count: 0 }; },
    delete: async () => { calls.push(`${model}.delete`); return {}; },
    create: async () => { calls.push(`${model}.create`); return {}; },
  });
  const models = [
    "vacationRequest", "absence", "temporaryAssignment", "shiftAssignment", "shiftSwapRequest", "vacationAccount",
    "employeeQualification", "employeePermission", "employeeDepartment", "notification", "auditLog", "companyDay", "user", "performanceEntry", "additionalShift", "messageParticipant",
  ];
  const db: Record<string, unknown> = Object.fromEntries(models.map((model) => [model, counter(model)]));
  db.employee = {
    findUnique: async () => ({
      id: employee.id,
      firstName: "Test",
      lastName: "Person",
      personnelNumber: employee.personnelNumber,
      isActive: employee.isActive,
      user: employee.role
        ? { id: `user-${employee.id}`, login: employee.personnelNumber, active: employee.userActive ?? employee.isActive, role: { code: employee.role } }
        : null,
    }),
    delete: async () => { calls.push("employee.delete"); return {}; },
  };
  db.$transaction = async (fn: (tx: unknown) => unknown) => fn(db);
  return { db: db as unknown as PrismaClient, calls };
}

const admin = { userId: "admin-user", employeeId: "admin-employee" };

test("Nachrichtenverläufe werden als erhaltene Historie ausgewiesen und nicht zur Löschung angeboten", async () => {
  const { db, calls } = fakeDb({
    employee: { id: "messages", personnelNumber: "MSG-DELETION", isActive: false, role: "EMPLOYEE" },
    counts: { messageParticipant: 2 },
  });
  const preview = (await analyzeEmployeeDeletion(db, "messages", admin))!;
  assert.ok(preview.retained.some((entry) => entry.key === "messageThreads" && entry.count === 2));
  assert.ok(!preview.historical.some((entry) => entry.key === "messageThreads"));
  await deleteEmployeePermanently(db, admin, "messages", {
    confirmation: "MSG-DELETION", confirmHistory: false, fingerprint: preview.fingerprint,
  });
  assert.ok(!calls.some((entry) => entry.startsWith("messageParticipant.")));
});

test("Zusatzschichten bleiben historisch erhalten und verhindern eine endgültige Mitarbeiterlöschung", async () => {
  const { db } = fakeDb({ employee: { id: "extra", personnelNumber: "EXTRA-1", isActive: false },
    counts: { additionalShift: 1 } });
  const preview = (await analyzeEmployeeDeletion(db, "extra", admin))!;
  assert.equal(preview.canDelete, false);
  assert.ok(preview.blockers.some((entry) => entry.code === "additionalShifts"));
  assert.ok(preview.retained.some((entry) => entry.key === "additionalShifts"));
});

test("MA-1001 ist unabhängig von Groß-/Kleinschreibung geschützt", async () => {
  assert.equal(isProtectedPersonnelNumber(" ma-1001 "), true);
  assert.equal(isProtectedPersonnelNumber("MA-1002"), false);
  const { db } = fakeDb({ employee: { id: "e1", personnelNumber: "MA-1001", isActive: false, role: "EMPLOYEE" } });
  const preview = (await analyzeEmployeeDeletion(db, "e1", admin))!;
  assert.equal(preview.canDelete, false);
  assert.equal(preview.canDeactivate, false);
  assert.ok(preview.blockers.some((blocker) => blocker.code === "protected"));
});

test("aktive Mitarbeiter, Admins und das eigene Konto sind gesperrt", async () => {
  const active = fakeDb({ employee: { id: "e2", personnelNumber: "MA-2002", isActive: true, role: "EMPLOYEE" } });
  const activePreview = (await analyzeEmployeeDeletion(active.db, "e2", admin))!;
  assert.deepEqual(activePreview.blockers.map((blocker) => blocker.code), ["active"]);
  assert.equal(activePreview.canDeactivate, true);

  const adminAccount = fakeDb({ employee: { id: "e3", personnelNumber: "MA-2003", isActive: false, role: "ADMIN" } });
  assert.ok((await analyzeEmployeeDeletion(adminAccount.db, "e3", admin))!.blockers.some((blocker) => blocker.code === "admin"));

  const self = fakeDb({ employee: { id: "admin-employee", personnelNumber: "MA-2004", isActive: false, role: "EMPLOYEE" } });
  assert.ok((await analyzeEmployeeDeletion(self.db, "admin-employee", admin))!.blockers.some((blocker) => blocker.code === "self"));
});

test("genehmigte Tausche und Aktionen für andere erlauben nur Deaktivieren", async () => {
  const { db } = fakeDb({
    employee: { id: "e4", personnelNumber: "MA-2005", isActive: false, role: "FOREMAN" },
    counts: { "shiftSwapRequest:approved": 1, "vacationRequest:byUser": 3 },
  });
  const codes = (await analyzeEmployeeDeletion(db, "e4", admin))!.blockers.map((blocker) => blocker.code);
  assert.deepEqual(codes, ["approvedSwaps", "actionsForOthers"]);
});

test("historische Daten werden getrennt aufgeführt und verlangen eine Bestätigung", async () => {
  const { db, calls } = fakeDb({
    employee: { id: "e5", personnelNumber: "MA-2006", isActive: false, role: "EMPLOYEE" },
    counts: { vacationRequest: 2, absence: 1, "shiftAssignment:ROTATION": 200, "shiftAssignment:MANUAL": 1, notification: 4, performanceEntry: 3 },
  });
  const preview = (await analyzeEmployeeDeletion(db, "e5", admin))!;
  assert.equal(preview.canDelete, true);
  assert.deepEqual(preview.historical.map((item) => item.key), ["vacationRequests", "absences", "manualAssignments", "performanceEntries"]);
  assert.deepEqual(preview.removed.map((item) => item.key), ["user", "rotationAssignments", "notifications"]);

  const base = { confirmation: "MA-2006", confirmHistory: true, fingerprint: preview.fingerprint };
  await assert.rejects(deleteEmployeePermanently(db, admin, "e5", { ...base, confirmation: "ma-2006" }), /Personalnummer/);
  await assert.rejects(deleteEmployeePermanently(db, admin, "e5", { ...base, confirmHistory: false }), /historischen Daten/);
  await assert.rejects(deleteEmployeePermanently(db, admin, "e5", { ...base, fingerprint: "alt" }), /geändert/);
  assert.equal(calls.length, 0);

  await deleteEmployeePermanently(db, admin, "e5", base);
  assert.deepEqual(calls, ["shiftSwapRequest.deleteMany", "user.deleteMany", "employee.delete", "auditLog.create"]);
});
