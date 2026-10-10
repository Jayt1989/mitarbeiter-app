import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Client } from "pg";
import type { AuthorizationContext } from "./authorization";
import { dateKeyToUtc, addDaysToKey, berlinTodayKey } from "./calendar";
import { getDailyStaffing } from "@/app/admin/staffing";
import { getShiftForDate } from "@/app/schichtplan/rotation";
import { toEmployeeShiftPlan } from "@/app/mitarbeiter/schedule";

test("Zusatzschichten: Migration, Samstag/ Sonntag, Konflikte, Freigabe, Dashboard, Benachrichtigung, Stornierung", {
  skip: process.env.ADDITIONAL_SHIFT_DB_TESTS !== "1", timeout: 120_000,
}, async (t) => {
  const original = process.env.DATABASE_URL;
  assert.ok(original);
  const url = new URL(original);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Nur lokale Testdatenbanken erlaubt.");
  const schema = `additional_shift_test_${randomBytes(8).toString("hex")}`;
  const connection = new Client({ connectionString: original });
  await connection.connect();
  let created = false;
  let disconnect: (() => Promise<void>) | undefined;
  try {
    await connection.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await connection.query(`SET search_path TO "${schema}"`);
    const migrations = (await readdir("prisma/migrations")).filter((name) => /^\d/.test(name)).sort();
    const migration = "20261010110000_additional_shifts";
    for (const name of migrations.filter((name) => name < migration)) {
      await connection.query(await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"));
    }
    url.searchParams.set("schema", schema);
    process.env.DATABASE_URL = url.toString();
    const { prisma } = await import("./prisma");
    disconnect = () => prisma.$disconnect();
    const adminRole = await prisma.role.create({ data: { code: "ADMIN", name: "Admin" } });
    await prisma.role.create({ data: { code: "FOREMAN", name: "Vorarbeiter" } });
    await prisma.role.create({ data: { code: "EMPLOYEE", name: "Mitarbeiter" } });
    const model = await prisma.shiftModel.create({ data: { code: "nur-frueh", name: "Früh", rotationOrder: ["EARLY"], workingWeekdays: [1, 2, 3, 4, 5] } });
    const group = await prisma.shiftGroup.create({ data: { code: "NONE", name: "Keine", startShift: "EARLY", anchorDate: new Date("2025-12-29") } });
    const department = await prisma.department.create({ data: { code: "TARGET", name: "Zielbereich" } });
    const employee = await prisma.employee.create({
      data: { firstName: "Zusatz", lastName: "Test", personnelNumber: "EXTRA-A", shiftModelId: model.id, shiftGroupId: group.id },
    });
    const other = await prisma.employee.create({
      data: { firstName: "Zweiter", lastName: "Test", personnelNumber: "EXTRA-B", shiftModelId: model.id, shiftGroupId: group.id },
    });
    const user = await prisma.user.create({ data: { login: "EXTRA-ADMIN", passwordHash: "not-a-login-hash", roleId: adminRole.id } });
    const oldAssignment = await prisma.shiftAssignment.create({
      data: { employeeId: employee.id, date: new Date("2026-10-09"), shift: "LATE", source: "MANUAL" },
    });
    const oldEmployee = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } });
    await connection.query(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"));
    assert.deepEqual(await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } }), oldEmployee);
    assert.deepEqual(await prisma.shiftAssignment.findUniqueOrThrow({ where: { id: oldAssignment.id } }), oldAssignment);
    const defaults = await prisma.rolePermission.findMany({ where: { permission: { key: { endsWith: "AdditionalShifts" } } }, include: { role: true } });
    assert.equal(defaults.length, 12);
    assert.ok(defaults.every((entry) => entry.allowed === (entry.role.code !== "EMPLOYEE")));
    const context: AuthorizationContext = { userId: user.id, employeeId: null, login: user.login, role: "ADMIN",
      permissions: { viewAdditionalShifts: true, planAdditionalShifts: true, releaseAdditionalShifts: true, cancelAdditionalShifts: true, teamShiftPlan: true } };
    const { createAdditionalShifts, changeAdditionalShift, checkAdditionalShifts } = await import("./additional-shifts");
    const { AdditionalShiftError } = await import("./additional-shift-rules");
    const { loadShiftPlan } = await import("./shift-plan");
    const { loadPersonalDashboard } = await import("./personal-dashboard");
    const { createPerformanceEntry } = await import("./performance");
    const { assertAdditionalRotation, assertNoAdditionalPeriod } = await import("./additional-shift-conflicts");
    let saturday = addDaysToKey(berlinTodayKey(), 7);
    while (dateKeyToUtc(saturday).getUTCDay() !== 6) saturday = addDaysToKey(saturday, 1);
    const input = { date: saturday, shift: "EARLY" as const, departmentId: department.id, employeeIds: [employee.id], note: "Wochenendarbeit" };

    await t.test("Alle Samstag-/Sonntagsschichten und persönliche Anzeige nach Freigabe", async () => {
      for (const [offset, shift] of [[0, "EARLY"], [7, "LATE"], [14, "NIGHT"], [1, "EARLY"], [8, "LATE"], [15, "NIGHT"]] as const) {
        const values = { ...input, date: addDaysToKey(saturday, offset), shift };
        const draft = (await createAdditionalShifts(context, values)).entries[0];
        assert.equal(draft.status, "ENTWURF");
        const own = { ...context, role: "EMPLOYEE", employeeId: employee.id, permissions: { ownShiftPlan: true, recordPerformance: true } };
        assert.equal((await loadShiftPlan(own)).employees[0].additionalShifts?.[values.date], undefined);
        const released = (await changeAdditionalShift(context, draft.id, draft.updatedAt, "release")).entry;
        const plan = await loadShiftPlan(own);
        const dayEmployee = plan.employees[0];
        const expected = shift === "EARLY" ? "Früh" : shift === "LATE" ? "Spät" : "Nacht";
        assert.equal(getShiftForDate(dateKeyToUtc(values.date), toEmployeeShiftPlan(dayEmployee)), expected);
        assert.equal(dayEmployee.additionalShifts?.[values.date]?.departmentId, department.id);
        const staffing = getDailyStaffing(dateKeyToUtc(values.date), [dayEmployee], [], { areas: [{ id: department.id, name: department.name, active: true }], minimums: {} });
        assert.equal(staffing.shifts[expected].available, 1);
        assert.equal(staffing.shifts[expected].areas[0].available, 1);
        const notification = await prisma.notification.findFirstOrThrow({ where: { employeeId: employee.id, type: "ADDITIONAL_SHIFT_RELEASED", message: { contains: department.name } }, orderBy: { createdAt: "desc" } });
        assert.match(notification.message, /Zusatzschicht/);
        if (shift === "NIGHT") assert.match(notification.message, /Folgetag/);
        if (offset === 0) {
          const dashboard = await loadPersonalDashboard(own);
          assert.equal(dashboard?.upcomingAdditionalShift?.date, values.date);
          assert.equal(dashboard?.upcomingAdditionalShift?.additionalShift?.id, draft.id);
        }
        const now = new Date(`${shift === "NIGHT" ? addDaysToKey(values.date, 1) : values.date}T${shift === "NIGHT" ? "02" : "10"}:00:00Z`);
        const performance = await createPerformanceEntry(own, { area: "PICKING", workstation: "K01", quantity: 100, durationMinutes: 30, note: "Zusatzschicht" }, now);
        assert.equal(performance.workDate, values.date);
        assert.equal(performance.shift, expected);
        assert.equal(getShiftForDate(dateKeyToUtc(addDaysToKey(saturday, 2)), toEmployeeShiftPlan(dayEmployee)), "Früh");
        assert.equal(released.status, "FREIGEGEBEN");
      }
      assert.equal(await prisma.notification.count({ where: { employeeId: employee.id, type: "ADDITIONAL_SHIFT_RELEASED" } }), 6);
      assert.deepEqual(await prisma.shiftAssignment.findUniqueOrThrow({ where: { id: oldAssignment.id } }), oldAssignment);
    });

    await t.test("Urlaub, Krankheit, Abwesenheit am Nacht-Folgetag, bestehende Schichten, Overrides, Einsätze und Tausche blockieren", async () => {
      const date = addDaysToKey(saturday, 21);
      const values = { ...input, date };
      async function blocking(message: RegExp) {
        const issues = await checkAdditionalShifts(prisma, values);
        assert.ok(issues.some((issue) => issue.blocking && message.test(issue.message)));
        await assert.rejects(createAdditionalShifts(context, values), (error: unknown) => error instanceof AdditionalShiftError && error.status === 409);
      }
      const vacation = await prisma.vacationRequest.create({ data: { employeeId: employee.id, startDate: dateKeyToUtc(date), endDate: dateKeyToUtc(date), daysRequested: 1 } });
      await blocking(/Urlaub/);
      await prisma.vacationRequest.update({ where: { id: vacation.id }, data: { status: "CANCELLED" } });
      const absence = await prisma.absence.create({ data: { employeeId: employee.id, type: "SICK", startDate: dateKeyToUtc(date), endDate: dateKeyToUtc(date) } });
      await blocking(/Abwesenheit/);
      await prisma.absence.delete({ where: { id: absence.id } });
      const nightAbsence = await prisma.absence.create({ data: { employeeId: employee.id, type: "TRAINING", startDate: dateKeyToUtc(addDaysToKey(date, 1)), endDate: dateKeyToUtc(addDaysToKey(date, 1)) } });
      await assert.rejects(createAdditionalShifts(context, { ...values, shift: "NIGHT" }), /Planungskonflikten/);
      await prisma.absence.delete({ where: { id: nightAbsence.id } });
      const override = await prisma.shiftAssignment.create({ data: { employeeId: employee.id, date: dateKeyToUtc(date), shift: "LATE", source: "MANUAL" } });
      await blocking(/Schichtzuweisung|normale Schicht/);
      await prisma.shiftAssignment.update({ where: { id: override.id }, data: { shift: "OFF" } });
      await blocking(/ShiftOverride/);
      await prisma.shiftAssignment.delete({ where: { id: override.id } });
      const assignment = await prisma.temporaryAssignment.create({ data: { employeeId: employee.id, departmentId: department.id, startDate: dateKeyToUtc(date), endDate: dateKeyToUtc(date) } });
      await blocking(/Temporärer Einsatz/);
      await prisma.temporaryAssignment.update({ where: { id: assignment.id }, data: { cancelledAt: new Date() } });
      const swap = await prisma.shiftSwapRequest.create({ data: { requesterId: employee.id, partnerId: other.id, date: dateKeyToUtc(date), requesterOriginalShift: "EARLY", partnerOriginalShift: "LATE" } });
      await blocking(/Schichttausch/);
      await prisma.shiftSwapRequest.update({ where: { id: swap.id }, data: { status: "STORNIERT" } });
      const draft = (await createAdditionalShifts(context, values)).entries[0];
      await blocking(/Zusatzschicht/);
      const newAbsence = await prisma.absence.create({ data: { employeeId: employee.id, type: "SICK", startDate: dateKeyToUtc(date), endDate: dateKeyToUtc(date) } });
      await assert.rejects(changeAdditionalShift(context, draft.id, draft.updatedAt, "release"), /Planungskonflikten/);
      assert.equal(await prisma.notification.count({ where: { employeeId: employee.id, type: "ADDITIONAL_SHIFT_RELEASED" } }), 6);
      await prisma.absence.delete({ where: { id: newAbsence.id } });
    });

    await t.test("Qualifikation warnt, Freigabe und Änderung benachrichtigen atomar, Stornierung entfernt nur Overlay", async () => {
      const date = addDaysToKey(saturday, 28);
      const qualification = await prisma.qualification.create({ data: { code: "EXTRA", name: "Wochenend-Qualifikation" } });
      await prisma.minimumStaffing.create({ data: { departmentId: department.id, shift: "EARLY", minimum: 1, qualificationId: qualification.id, minimumQualified: 1 } });
      const result = await createAdditionalShifts(context, { ...input, date });
      assert.ok(result.issues.some((issue) => !issue.blocking && /Nicht qualifiziert/.test(issue.message)));
      const draft = result.entries[0];
      await assert.rejects(changeAdditionalShift({ ...context, permissions: { planAdditionalShifts: true } }, draft.id, draft.updatedAt, "release"), /Berechtigung/);
      const released = (await changeAdditionalShift(context, draft.id, draft.updatedAt, "release")).entry;
      const updated = (await changeAdditionalShift(context, released.id, released.updatedAt, "update", { date, shift: "LATE", departmentId: department.id, note: "Geändert" })).entry;
      assert.equal(await prisma.notification.count({ where: { employeeId: employee.id, type: "ADDITIONAL_SHIFT_UPDATED" } }), 1);
      const own = { ...context, role: "EMPLOYEE", employeeId: employee.id, permissions: { ownShiftPlan: true } };
      const plan = (await loadShiftPlan(own)).employees[0];
      await assert.rejects(assertAdditionalRotation(prisma, { ...plan, individualAssignments: { [date]: "Früh" } }), /kollidiert/);
      await assert.rejects(assertNoAdditionalPeriod(prisma, employee.id, date, date), /kollidiert/);
      await assert.rejects(changeAdditionalShift(context, released.id, released.updatedAt, "cancel"), /inzwischen geändert/);
      const cancelled = (await changeAdditionalShift(context, updated.id, updated.updatedAt, "cancel")).entry;
      assert.equal(cancelled.status, "STORNIERT");
      assert.equal((await loadShiftPlan(own)).employees[0].additionalShifts?.[date], undefined);
      assert.equal(getShiftForDate(dateKeyToUtc(date), toEmployeeShiftPlan((await loadShiftPlan(own)).employees[0])), "Frei");
      assert.equal(await prisma.notification.count({ where: { employeeId: employee.id, type: "ADDITIONAL_SHIFT_CANCELLED" } }), 1);
      await assert.rejects(changeAdditionalShift(context, cancelled.id, cancelled.updatedAt, "release"), /Stornierte/);
      const audit = await prisma.auditLog.findMany({ where: { entityId: draft.id }, orderBy: { occurredAt: "asc" } });
      assert.deepEqual(audit.map((entry) => entry.action), ["additional_shift.create", "additional_shift.release", "additional_shift.update", "additional_shift.cancel"]);
      assert.ok(audit.every((entry) => entry.actorUserId === user.id));
      await createAdditionalShifts(context, { ...input, date });
    });

    await t.test("Mehrfachauswahl ist atomar, Doppelbelegung auch bei parallelen Anfragen ausgeschlossen", async () => {
      const values = { ...input, date: addDaysToKey(saturday, 35), employeeIds: [employee.id, other.id] };
      const absence = await prisma.absence.create({ data: { employeeId: other.id, type: "SICK", startDate: dateKeyToUtc(values.date), endDate: dateKeyToUtc(values.date) } });
      await assert.rejects(createAdditionalShifts(context, values), /Planungskonflikten/);
      assert.equal(await prisma.additionalShift.count({ where: { date: dateKeyToUtc(values.date) } }), 0);
      await prisma.absence.delete({ where: { id: absence.id } });
      const concurrent = await Promise.allSettled([createAdditionalShifts(context, values), createAdditionalShifts(context, values)]);
      assert.equal(concurrent.filter((entry) => entry.status === "fulfilled").length, 1);
      assert.equal(await prisma.additionalShift.count({ where: { date: dateKeyToUtc(values.date), status: "ENTWURF" } }), 2);
      await assert.rejects(createAdditionalShifts({ ...context, role: "EMPLOYEE", employeeId: employee.id }, { ...input, date: addDaysToKey(saturday, 42) }), /Berechtigung/);
    });
  } finally {
    try { await disconnect?.(); }
    finally {
      try { if (created) await connection.query(`DROP SCHEMA "${schema}" CASCADE`); }
      finally { await connection.end(); process.env.DATABASE_URL = original; }
    }
  }
});
