import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import type { AuthorizationContext } from "./authorization";

test("Migration und Leistungsmodul erhalten historische Snapshots und prüfen Pflege-Rechte", {
  skip: process.env.PERFORMANCE_DB_TESTS !== "1",
}, async () => {
  const originalUrl = process.env.DATABASE_URL;
  assert.ok(originalUrl, "DATABASE_URL ist für den Integrationstest erforderlich.");
  const url = new URL(originalUrl);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Nur eine lokale Testdatenbank ist erlaubt.");
  const schema = `performance_test_${randomBytes(8).toString("hex")}`;
  const connection = new Client({ connectionString: originalUrl });
  await connection.connect();
  let disconnect: (() => Promise<void>) | undefined;
  let schemaCreated = false;
  try {
    await connection.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await connection.query(`SET search_path TO "${schema}"`);
    const migrationRoot = path.resolve("prisma/migrations");
    const migrations = (await readdir(migrationRoot)).filter((name) => /^\d/.test(name)).sort();
    const lastMigration = "20261010080000_performance_workstations";
    for (const migration of migrations.filter((name) => name < lastMigration)) {
      await connection.query(await readFile(path.join(migrationRoot, migration, "migration.sql"), "utf8"));
    }

    url.searchParams.set("schema", schema);
    process.env.DATABASE_URL = url.toString();
    const { prisma } = await import("./prisma");
    disconnect = () => prisma.$disconnect();
    const role = await prisma.role.create({ data: { code: "ADMIN", name: "Admin" } });
    await prisma.role.create({ data: { code: "FOREMAN", name: "Vorarbeiter" } });
    await prisma.role.create({ data: { code: "EMPLOYEE", name: "Mitarbeiter" } });
    const model = await prisma.shiftModel.create({
      data: { code: "nur-frueh", name: "Nur Früh", rotationOrder: ["EARLY"], workingWeekdays: [1, 2, 3, 4, 5] },
    });
    const group = await prisma.shiftGroup.create({
      data: { code: "NONE", name: "Keine Gruppe", startShift: "EARLY", anchorDate: new Date("2026-10-05") },
    });
    const employee = await prisma.employee.create({
      data: { firstName: "Test", lastName: "Leistung", personnelNumber: "PERFORMANCE-TEST",
        shiftModelId: model.id, shiftGroupId: group.id },
    });
    const user = await prisma.user.create({
      data: { login: "PERFORMANCE-TEST", passwordHash: "not-a-login-hash", roleId: role.id, employeeId: employee.id },
    });
    const base = {
      employeeId: employee.id, workDate: new Date("2026-10-09"), shift: "EARLY" as const,
      area: "PICKING" as const, workstation: "K01", quantity: 350, durationMinutes: 45,
      targetPerHour: 500, createdById: user.id,
    };
    await prisma.performanceEntry.create({ data: base });
    const beforeMigration = await prisma.performanceEntry.findMany();
    await connection.query(await readFile(path.join(migrationRoot, lastMigration, "migration.sql"), "utf8"));
    assert.deepEqual(await prisma.performanceEntry.findMany(), beforeMigration);
    for (const migration of migrations.filter((name) => name > lastMigration)) {
      await connection.query(await readFile(path.join(migrationRoot, migration, "migration.sql"), "utf8"));
    }
    assert.equal(await prisma.performanceWorkstation.count(), 6);
    assert.equal((await prisma.performanceWorkstation.findUniqueOrThrow({ where: { code: "K01" } })).targetPerHour, 500);
    assert.equal((await prisma.performanceWorkstation.findUniqueOrThrow({ where: { code: "VP1" } })).targetPerHour, null);
    const permissions = await prisma.rolePermission.findMany({ include: { role: true, permission: true } });
    assert.deepEqual(permissions.filter((entry) => entry.permission.key === "managePerformanceTargets")
      .map((entry) => [entry.role.code, entry.allowed]).sort(),
    [["ADMIN", true], ["EMPLOYEE", false], ["FOREMAN", false]]);

    const { createPerformanceEntry, updatePerformanceTarget, listPerformance, loadRecordingOverview } = await import("./performance");
    const context: AuthorizationContext = {
      userId: user.id, employeeId: employee.id, login: user.login, role: "ADMIN", permissions: { recordPerformance: true, managePerformanceTargets: true },
    };
    const now = new Date("2026-10-09T10:00:00.000Z");
    const input = { area: "PICKING" as const, workstation: "K01", quantity: 350, durationMinutes: 45, note: "Snapshot" };
    const oldEntry = await createPerformanceEntry(context, input, now);
    assert.equal(oldEntry.targetPerHour, 500);
    assert.equal(oldEntry.achievement, 93.3);
    await updatePerformanceTarget(context, "K01", "600");
    const newEntry = await createPerformanceEntry(context, input, now);
    assert.equal(newEntry.targetPerHour, 600);
    assert.equal(newEntry.achievement, 77.8);
    const noTarget = await createPerformanceEntry(context, { ...input, area: "PACKING", workstation: "VP1" }, now);
    await updatePerformanceTarget(context, "VP1", "300");
    const report = await listPerformance({ from: "2026-10-09", to: "2026-10-09", area: null, shift: null });
    assert.equal(report.find((entry) => entry.id === oldEntry.id)?.targetPerHour, 500);
    assert.equal(report.find((entry) => entry.id === oldEntry.id)?.achievement, 93.3);
    assert.equal(report.find((entry) => entry.id === noTarget.id)?.targetPerHour, null);
    assert.equal(report.find((entry) => entry.id === noTarget.id)?.achievement, null);
    const employeeContext = {
      ...context, role: "EMPLOYEE",
      permissions: { recordPerformance: true, viewPerformance: true, managePerformanceTargets: true },
    };
    const employeeOverview = await loadRecordingOverview(employeeContext, now);
    assert.equal(employeeOverview.resolved.ok, true);
    assert.deepEqual(employeeOverview.entries, []);
    assert.deepEqual(employeeOverview.workstations, []);
    const adminOverview = await loadRecordingOverview({
      ...context, permissions: { recordPerformance: true, viewPerformance: true },
    }, now);
    assert.equal(adminOverview.entries.length, 4);
    assert.equal(adminOverview.workstations.length, 6);
    await assert.rejects(createPerformanceEntry(context, input, new Date("2026-10-10T10:00:00Z")), /keine Schicht/);
    await assert.rejects(loadRecordingOverview({ ...employeeContext, permissions: {} }, now), /keine Berechtigung/);
    const unauthorized = { ...context, role: "FOREMAN", permissions: {} };
    await assert.rejects(updatePerformanceTarget(unauthorized, "K01", "700"), /keine Berechtigung/);
    await updatePerformanceTarget({
      ...unauthorized, permissions: { managePerformanceTargets: true },
    }, "K01", "700");
    assert.equal(await prisma.auditLog.count({ where: { action: "performance.target.update" } }), 3);
    await assert.rejects(updatePerformanceTarget(context, "K01", "0"), /Sollwert/);
    const { buildExport } = await import("./export/build");
    await assert.rejects(buildExport({
      ...employeeContext, permissions: { viewPerformance: true, exportReports: true },
    }, new URLSearchParams({ type: "performance" })), /Berechtigung/);
    await assert.rejects(buildExport({
      ...context, permissions: { viewPerformance: true },
    }, new URLSearchParams({ type: "performance" })), /Berechtigung/);
    const exported = await buildExport({
      ...context, permissions: { viewPerformance: true, exportReports: true },
    }, new URLSearchParams({ type: "performance", von: "2026-10-09", bis: "2026-10-09" }));
    assert.equal(exported.type, "performance");
    assert.equal(exported.data.rows.length, 4);
  } finally {
    process.env.DATABASE_URL = originalUrl;
    try {
      await disconnect?.();
    } finally {
      try {
        if (schemaCreated) await connection.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await connection.end();
      }
    }
  }
});
