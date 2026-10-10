import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { Client } from "pg";
import { PrismaClient, type Employee, type User, type VacationRequest, type Absence,
  type TemporaryAssignment, type Notification, type PerformanceEntry } from "@prisma/client";
import { hash } from "bcryptjs";
import ExcelJS from "exceljs";
import { permissionOptions } from "@/app/mitarbeiter/data";
import { addDaysToKey, berlinTodayKey, dateKeyToUtc } from "@/lib/calendar";

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

test("HTTP-Benutzertrennung: Mitarbeiter A/B, fremde IDs, Server Actions und aktuelle Adminrechte", {
  skip: process.env.ISOLATION_DB_TESTS !== "1", timeout: 120_000,
}, async (t) => {
  assert.ok(process.env.DATABASE_URL);
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Nur lokale PostgreSQL-Testumgebungen erlaubt.");
  const schema = `isolation_test_${randomBytes(8).toString("hex")}`;
  const connection = new Client({ connectionString: process.env.DATABASE_URL });
  await connection.connect();
  let schemaCreated = false;
  let db: PrismaClient | undefined;
  let server: ChildProcess | undefined;
  try {
    await connection.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await connection.query(`SET search_path TO "${schema}"`);
    for (const migration of (await readdir("prisma/migrations")).filter((entry) => /^\d/.test(entry)).sort()) {
      await connection.query(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"));
    }
    url.searchParams.set("schema", schema);
    db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    const database = db;
    const employeeRole = await database.role.create({ data: { code: "EMPLOYEE", name: "Mitarbeiter" } });
    const adminRole = await database.role.create({ data: { code: "ADMIN", name: "Admin" } });
    const foremanRole = await database.role.create({ data: { code: "FOREMAN", name: "Vorarbeiter" } });
    for (const permission of permissionOptions) {
      const record = await database.permission.upsert({
        where: { key: permission.id }, update: {}, create: { key: permission.id, label: permission.label },
      });
      for (const role of [employeeRole, adminRole, foremanRole]) {
        await database.rolePermission.create({
          data: { roleId: role.id, permissionId: record.id, allowed: role.code !== "ADMIN" },
        });
      }
    }
    const model = await database.shiftModel.create({
      data: { code: "nur-frueh", name: "Nur Früh", rotationOrder: ["EARLY"], workingWeekdays: [1, 2, 3, 4, 5] },
    });
    const group = await database.shiftGroup.create({
      data: { code: "NONE", name: "Keine Gruppe", startShift: "EARLY", anchorDate: new Date("2026-10-05") },
    });
    const department = await database.department.create({ data: { code: "TEST", name: "Testbereich" } });
    const qualification = await database.qualification.create({ data: { code: "TEST", name: "Testqualifikation" } });
    const password = `Test-${randomBytes(16).toString("hex")}!`;
    const passwordHash = await hash(password, 4);
    const today = berlinTodayKey();
    const fixtures: { employee: Employee; user: User; vacation: VacationRequest; absence: Absence;
      assignment: TemporaryAssignment; notification: Notification; performance: PerformanceEntry }[] = [];
    for (const [label, roleId] of [["A", employeeRole.id], ["B", employeeRole.id],
      ["ADMIN", adminRole.id], ["FOREMAN", foremanRole.id]]) {
      const employee = await database.employee.create({
        data: { firstName: `Isolation${label}`, lastName: `Privat${label}`, personnelNumber: `ISO-${label}`,
          email: `iso-${label.toLowerCase()}@example.invalid`, shiftModelId: model.id, shiftGroupId: group.id },
      });
      const user = await database.user.create({
        data: { login: employee.personnelNumber, passwordHash, roleId, employeeId: employee.id },
      });
      await database.shiftAssignment.create({ data: { employeeId: employee.id, date: dateKeyToUtc(today), shift: "EARLY", source: "MANUAL" } });
      const vacation = await database.vacationRequest.create({
        data: { employeeId: employee.id, startDate: dateKeyToUtc(addDaysToKey(today, -10)),
          endDate: dateKeyToUtc(addDaysToKey(today, -10)), daysRequested: 1, comment: `PrivatUrlaub${label}` },
      });
      await database.vacationAccount.create({ data: { employeeId: employee.id, year: Number(today.slice(0, 4)), annualAllowance: 20 } });
      const absence = await database.absence.create({
        data: { employeeId: employee.id, type: "SICK", startDate: dateKeyToUtc(addDaysToKey(today, -5)),
          endDate: dateKeyToUtc(addDaysToKey(today, -5)) },
      });
      const assignment = await database.temporaryAssignment.create({
        data: { employeeId: employee.id, departmentId: department.id, startDate: dateKeyToUtc(addDaysToKey(today, 5)),
          endDate: dateKeyToUtc(addDaysToKey(today, 5)), note: `PrivatEinsatz${label}` },
      });
      await database.employeeQualification.create({ data: { employeeId: employee.id, qualificationId: qualification.id, level: 2 } });
      const notification = await database.notification.create({
        data: { employeeId: employee.id, title: `PrivatNachricht${label}`, message: `PrivatNachricht${label}`, type: "SHIFT_CHANGED" },
      });
      const performance = await database.performanceEntry.create({
        data: { employeeId: employee.id, workDate: dateKeyToUtc(today), shift: "EARLY", area: "PICKING",
          workstation: "K01", quantity: 100, durationMinutes: 30, targetPerHour: 500, note: `PrivatLeistung${label}` },
      });
      fixtures.push({ employee, user, vacation, absence, assignment, notification, performance });
    }
    const [a, b, admin, foreman] = fixtures;
    const ownSwap = await database.shiftSwapRequest.create({
      data: { requesterId: a.employee.id, partnerId: b.employee.id, date: dateKeyToUtc(today),
        requesterOriginalShift: "EARLY", partnerOriginalShift: "LATE" },
    });
    const foreignSwap = await database.shiftSwapRequest.create({
      data: { requesterId: b.employee.id, partnerId: admin.employee.id, date: dateKeyToUtc(today),
        requesterOriginalShift: "EARLY", partnerOriginalShift: "LATE", status: "PARTNER_BESTAETIGT", comment: "PrivatTauschB" },
    });
    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    let serverOutput = "";
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port), "-H", "127.0.0.1"], {
      env: { ...process.env, DATABASE_URL: url.toString(), AUTH_SECRET: randomBytes(32).toString("hex"),
        AUTH_URL: base, AUTH_TRUST_HOST: "true", PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout?.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-4000); });
    server.stderr?.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-4000); });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error(`Testserver beendet: ${serverOutput}`);
      try {
        ready = (await fetch(`${base}/api/auth/csrf`)).ok;
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
      }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, "Testserver ist nicht erreichbar.");

    type Session = { cookie: string };
    async function login(loginName: string): Promise<Session> {
      const csrf = await fetch(`${base}/api/auth/csrf`);
      const csrfBody = await csrf.json() as { csrfToken: string };
      const cookie = csrf.headers.getSetCookie().map((entry) => entry.split(";")[0]).join("; ");
      const response = await fetch(`${base}/api/auth/callback/credentials`, {
        method: "POST", redirect: "manual",
        headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
        body: new URLSearchParams({ csrfToken: csrfBody.csrfToken, login: loginName, password, callbackUrl: `${base}/` }),
      });
      const cookies = response.headers.getSetCookie().map((entry) => entry.split(";")[0]);
      assert.ok(cookies.some((entry) => entry.startsWith("authjs.session-token=")), `Anmeldung ${loginName} fehlgeschlagen`);
      return { cookie: [...cookie.split("; "), ...cookies].join("; ") };
    }
    const sessions = await Promise.all(fixtures.map((fixture) => login(fixture.user.login)));
    async function request(session: Session, path: string, method = "GET", body?: object) {
      return fetch(`${base}${path}`, {
        method, redirect: "manual", headers: { Cookie: session.cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    }

    await t.test("Startseite und URLs: Mitarbeiter mit wenigen Rechten, Vorarbeiter mit Teilrechten und eingeschränkter Admin", async () => {
      const employeePermissions = await database.permission.findMany();
      await database.employeePermission.createMany({
        data: employeePermissions.map((permission) => ({
          employeeId: a.employee.id, permissionId: permission.id, allowed: permission.key === "ownShiftPlan",
        })),
      });
      try {
        const home = await request(sessions[0], "/");
        assert.equal(home.status, 200);
        const html = await home.text();
        assert.ok(html.includes('href="/schichtplan"'));
        const plan = await (await request(sessions[0], "/api/shift-plan")).json() as { employees: { qualifications: Record<string, number> }[] };
        assert.deepEqual(plan.employees[0].qualifications, {}, "Eigene Qualifikationen benötigen ein eigenes Recht");
        for (const path of ["/mitarbeiter", "/admin", "/urlaub", "/leistung", "/nachrichten", "/schichttausch",
          "/admin/leistung", "/admin/qualifikationen", "/admin/einsatzplanung"]) {
          assert.ok(!html.includes(`href="${path}"`), path);
          const denied = await request(sessions[0], path);
          assert.ok([302, 303, 307].includes(denied.status), path);
          assert.equal(new URL(denied.headers.get("location")!, base).pathname, "/", path);
        }
        await database.employeePermission.updateMany({ where: { employeeId: a.employee.id }, data: { allowed: false } });
        const revokedHome = await request(sessions[0], "/");
        assert.ok(!(await revokedHome.text()).includes('href="/schichtplan"'));
        assert.notEqual((await request(sessions[0], "/dashboard")).status, 200);
        assert.equal((await request(sessions[0], "/api/shift-plan")).status, 403);
      } finally {
        await database.employeePermission.deleteMany({ where: { employeeId: a.employee.id } });
      }

      await database.rolePermission.updateMany({ where: { roleId: foremanRole.id }, data: { allowed: false } });
      try {
        await database.rolePermission.updateMany({
          where: { roleId: foremanRole.id, permission: { key: { in: ["teamShiftPlan", "approveShiftSwap", "viewPerformance"] } } },
          data: { allowed: true },
        });
        const html = await (await request(sessions[3], "/")).text();
        for (const path of ["/schichtplan", "/admin/schichttausch", "/admin/leistung"]) {
          assert.ok(html.includes(`href="${path}"`), path);
          assert.equal((await request(sessions[3], path)).status, 200, path);
        }
        for (const path of ["/admin", "/mitarbeiter", "/admin/urlaub", "/admin/qualifikationen",
          "/admin/leistung/arbeitsplaetze", "/admin/einsatzplanung", "/dashboard"]) {
          assert.ok(!html.includes(`href="${path}"`), path);
          assert.notEqual((await request(sessions[3], path)).status, 200, path);
        }
        assert.equal((await request(sessions[3], "/api/shift-plan?scope=staffing")).status, 403);
        const plan = await (await request(sessions[3], "/api/shift-plan")).json() as { employees: { qualifications: Record<string, number> }[] };
        for (const employee of plan.employees) {
          assert.deepEqual(employee.qualifications, {}, "Teamplanrecht schaltet fremde Qualifikationen nicht frei");
        }
        const release = await database.permission.findUniqueOrThrow({ where: { key: "releaseAdditionalShifts" } });
        await database.rolePermission.update({
          where: { roleId_permissionId: { roleId: foremanRole.id, permissionId: release.id } }, data: { allowed: true },
        });
        assert.equal((await request(sessions[3], "/admin/zusatzschichten")).status, 200);
        assert.equal((await request(sessions[3], "/api/additional-shifts")).status, 200);
        assert.ok((await (await request(sessions[3], "/")).text()).includes('href="/admin/zusatzschichten"'));
      } finally {
        await database.rolePermission.updateMany({ where: { roleId: foremanRole.id }, data: { allowed: true } });
      }

      const html = await (await request(sessions[2], "/")).text();
      for (const path of ["/admin", "/admin/leistung", "/mitarbeiter", "/schichtplan", "/urlaub", "/nachrichten"]) {
        assert.ok(!html.includes(`href="${path}"`), path);
      }
      const openAdmin = await database.permission.findUniqueOrThrow({ where: { key: "openAdmin" } });
      await database.rolePermission.update({
        where: { roleId_permissionId: { roleId: adminRole.id, permissionId: openAdmin.id } }, data: { allowed: true },
      });
      try {
        const response = await request(sessions[2], "/admin");
        assert.equal(response.status, 200);
        const adminHtml = await response.text();
        assert.ok(adminHtml.includes("Administration"));
        assert.ok(!adminHtml.includes("Datum auswählen"));
        assert.equal((await request(sessions[2], "/api/shift-plan?scope=staffing")).status, 403);
        assert.notEqual((await request(sessions[2], "/admin/mitarbeiter")).status, 200);
      } finally {
        await database.rolePermission.update({
          where: { roleId_permissionId: { roleId: adminRole.id, permissionId: openAdmin.id } }, data: { allowed: false },
        });
      }
    });
    const manifest = JSON.parse(await readFile(".next/server/server-reference-manifest.json", "utf8")) as {
      node: Record<string, { exportedName: string }>;
    };
    async function action(session: Session, path: string, name: string, state: object, fields: Record<string, string>) {
      const id = Object.entries(manifest.node).find(([, entry]) => entry.exportedName === name)?.[0];
      assert.ok(id, `Server Action ${name} fehlt im Build.`);
      const body = new FormData();
      for (const [key, value] of Object.entries(fields)) body.set(`_1_${key}`, value);
      body.set("0", JSON.stringify([state, "$K1"]));
      return fetch(`${base}${path}`, { method: "POST", redirect: "manual", body,
        headers: { Cookie: session.cookie, Origin: base, "Next-Action": id, Accept: "text/x-component" } });
    }

    await t.test("A und B sehen in allen Meine-APIs ausschließlich eigene Daten, auch mit fremder employeeId", async () => {
      for (const index of [0, 1]) {
        const self = fixtures[index], other = fixtures[1 - index], session = sessions[index];
        for (const path of ["/api/session", "/api/shift-plan", "/api/vacation-requests",
          `/api/vacation-accounts?year=${today.slice(0, 4)}`, "/api/temporary-assignments", "/api/notifications"]) {
          const separator = path.includes("?") ? "&" : "?";
          const response = await request(session, `${path}${separator}employeeId=${other.employee.id}&userId=${other.user.id}&absenceId=${other.absence.id}&vacationRequestId=${other.vacation.id}&notificationId=${other.notification.id}&performanceEntryId=${other.performance.id}`);
          assert.equal(response.status, 200, path);
          const text = await response.text();
          assert.ok(text.includes(self.employee.id), path);
          assert.ok(!text.includes(other.employee.id), path);
          assert.ok(!text.includes(other.employee.email!), path);
        }
        const swapResponse = await request(session, `/api/shift-swaps?employeeId=${other.employee.id}`);
        const swaps = await swapResponse.json() as { id: string; requesterId: string; partnerId: string }[];
        assert.equal(swapResponse.status, 200);
        assert.ok(swaps.every((swap) => swap.requesterId === self.employee.id || swap.partnerId === self.employee.id));
        if (index === 0) assert.ok(!swaps.some((swap) => swap.id === foreignSwap.id));
        for (const path of ["/profil", "/urlaub", "/leistung"]) {
          const response = await request(session, `${path}?employeeId=${other.employee.id}&userId=${other.user.id}`);
          assert.equal(response.status, 200, path);
          const html = await response.text();
          assert.ok(!html.includes(other.employee.email!), path);
          assert.ok(!html.includes(other.employee.firstName), path);
          assert.ok(!html.includes(`PrivatLeistung${index === 0 ? "B" : "A"}`), path);
          if (path === "/urlaub") assert.ok(html.includes(self.employee.firstName));
          if (path === "/leistung") assert.ok(!html.includes("In dieser Schicht erfasst"));
        }
      }
    });

    await t.test("Tauschpartner bleiben auswählbar, fremde Urlaubs-/Abwesenheitsdetails auch in Fehlerantworten privat", async () => {
      const date = addDaysToKey(today, 4);
      await database.vacationRequest.create({
        data: { employeeId: b.employee.id, startDate: dateKeyToUtc(date),
          endDate: dateKeyToUtc(date), daysRequested: 1, comment: "GeheimerUrlaubsgrundB" },
      });
      await database.absence.create({
        data: { employeeId: b.employee.id, type: "SICK", startDate: dateKeyToUtc(date), endDate: dateKeyToUtc(date) },
      });
      const partners = await request(sessions[0], `/api/shift-swaps/partners?date=${date}`);
      assert.equal(partners.status, 200);
      const text = await partners.text();
      assert.ok(text.includes(b.employee.firstName));
      assert.ok(!text.includes(b.employee.email!) && !text.includes(b.user.login));
      assert.doesNotMatch(text, /Urlaubsantrag|Abwesenheit|SICK|GeheimerUrlaubsgrundB/);
      const responses = [
        await request(sessions[0], `/api/shift-swaps/staffing?date=${date}&partnerId=${b.employee.id}`),
        await request(sessions[0], "/api/shift-swaps", "POST", { date, partnerId: b.employee.id }),
      ];
      for (const response of responses) {
        assert.equal(response.status, 409);
        const body = await response.text();
        assert.match(body, /Planungskonflikt/);
        assert.doesNotMatch(body, /Urlaubsantrag|Abwesenheit|SICK|GeheimerUrlaubsgrundB/);
      }
    });

    await t.test("Mitarbeiter können Adminseiten und Team-/Export-APIs nicht direkt öffnen", async () => {
      for (const path of ["/api/session", "/api/shift-plan", "/api/vacation-requests",
        "/api/vacation-accounts", "/api/temporary-assignments", "/api/notifications", "/api/employees",
        "/api/qualifications", "/api/areas", "/api/calendar", "/api/vacation-years", "/api/shift-swaps",
        "/api/shift-swaps/partners", "/api/shift-swaps/staffing", "/api/export/excel", "/api/additional-shifts"]) {
        assert.equal((await fetch(`${base}${path}`, { redirect: "manual" })).status, 401, path);
      }
      for (const path of ["/admin", "/admin/mitarbeiter", "/mitarbeiter", "/admin/urlaub", "/admin/leistung",
        "/admin/leistung/arbeitsplaetze", "/admin/qualifikationen", "/admin/schichttausch",
        "/admin/einsatzplanung", "/admin/export", "/admin/wochenplan", "/admin/einstellungen",
        "/admin/jahreswechsel", "/admin/mindestbesetzung", "/admin/zusatzschichten"]) {
        const response = await request(sessions[0], path);
        assert.notEqual(response.status, 200, path);
      }
      for (const path of ["/api/employees", "/api/qualifications", "/api/areas",
        `/api/vacation-years?year=${today.slice(0, 4)}`, "/api/shift-swaps?review=true",
        `/api/shift-swaps/staffing?id=${foreignSwap.id}`, `/api/employees/${b.employee.id}`,
        `/api/export/excel?type=year&year=${today.slice(0, 4)}&employeeId=${b.employee.id}`,
        `/api/export/excel?type=vacation&year=${today.slice(0, 4)}`, "/api/export/excel?type=performance",
        "/api/shift-plan?scope=staffing", "/api/additional-shifts"]) {
        assert.equal((await request(sessions[0], path)).status, 403, path);
      }
      for (const scope of ["vacation", "qualifications", "assignments", "export"]) {
        assert.equal((await request(sessions[0], `/api/employees?scope=${scope}`)).status, 403);
      }
      assert.equal((await request(sessions[0], "/api/shift-plan?scope=assignments")).status, 403);
      assert.equal((await request(sessions[0], "/api/qualifications?scope=assignments")).status, 403);
    });

    await t.test("Manipulierte IDs ändern keine fremden Daten; Erfassung und Urlaub verwenden die Session", async () => {
      const before = {
        user: await database.user.findUniqueOrThrow({ where: { id: b.user.id } }),
        vacation: await database.vacationRequest.findUniqueOrThrow({ where: { id: b.vacation.id } }),
        notification: await database.notification.findUniqueOrThrow({ where: { id: b.notification.id } }),
        assignment: await database.temporaryAssignment.findUniqueOrThrow({ where: { id: b.assignment.id } }),
        swap: await database.shiftSwapRequest.findUniqueOrThrow({ where: { id: foreignSwap.id } }),
      };
      for (const [path, method, body] of [
        ["/api/vacation-requests", "PATCH", { id: b.vacation.id, status: "Genehmigt" }],
        ["/api/employee-qualifications", "PUT", { employeeId: b.employee.id, qualificationId: qualification.id, level: 3 }],
        ["/api/temporary-assignments", "PATCH", { id: b.assignment.id, action: "cancel" }],
        ["/api/employees", "PUT", []],
        [`/api/employees/${b.employee.id}/password`, "POST", { password }],
        [`/api/employees/${b.employee.id}`, "PATCH", { isActive: false }],
        [`/api/employees/${b.employee.id}`, "DELETE", { confirmation: b.employee.personnelNumber, fingerprint: "foreign" }],
        ["/api/shift-swaps", "PATCH", { id: foreignSwap.id, action: "approve" }],
        ["/api/shift-swaps", "PATCH", { id: foreignSwap.id, action: "confirm" }],
        ["/api/calendar", "PUT", { state: "BY" }],
        ["/api/company-days", "POST", { name: "Unauthorized", date: today, type: "OTHER" }],
        ["/api/areas", "PUT", { areas: [], minimums: {} }],
        ["/api/qualifications", "POST", { name: "Unauthorized" }],
        ["/api/qualifications", "PATCH", { id: qualification.id, name: "Unauthorized" }],
        ["/api/qualifications", "DELETE", { id: qualification.id }],
        ["/api/employees", "POST", { employee: {}, startPassword: password }],
        ["/api/vacation-years", "POST", { targetYear: Number(today.slice(0, 4)) + 1 }],
        ["/api/temporary-assignments", "POST", { employeeId: b.employee.id }],
        ["/api/company-days", "PATCH", { id: "foreign", name: "Unauthorized" }],
        ["/api/additional-shifts", "POST", { action: "create", employeeIds: [b.employee.id], date: today, shift: "EARLY", departmentId: department.id }],
      ] as const) assert.equal((await request(sessions[0], path, method, body)).status, 403, path);
      assert.equal((await request(sessions[0], "/api/notifications", "PATCH", { action: "read", id: b.notification.id })).status, 404);
      const deletion = await action(sessions[0], "/leistung", "deletePerformanceAction",
        { error: null }, { entryId: b.performance.id });
      assert.equal(deletion.status, 200);
      assert.match(await deletion.text(), /nicht gefunden/);
      assert.ok(await database.performanceEntry.findUnique({ where: { id: b.performance.id } }));
      const targetBefore = await database.performanceWorkstation.findUniqueOrThrow({ where: { code: "K01" } });
      for (const session of [sessions[0], sessions[2]]) {
        await action(session, "/", "saveTargetAction", { error: null, saved: false }, { code: "K01", targetPerHour: "900" });
        assert.deepEqual(await database.performanceWorkstation.findUniqueOrThrow({ where: { code: "K01" } }), targetBefore);
      }
      const save = await action(sessions[0], "/leistung", "savePerformanceAction",
        { error: null, savedAt: null }, {
          employeeId: b.employee.id, userId: b.user.id, area: "PICKING", workstation: "K01",
          quantity: "321", hours: "0", minutes: "15", note: "Manipulated employeeId",
        });
      assert.equal(save.status, 200);
      const recorded = await database.performanceEntry.findFirst({ where: { note: "Manipulated employeeId" } });
      assert.ok(recorded, await save.text());
      assert.equal(recorded.employeeId, a.employee.id);
      let workday = addDaysToKey(today, 20);
      while ([0, 6].includes(dateKeyToUtc(workday).getUTCDay())) workday = addDaysToKey(workday, 1);
      const vacation = await request(sessions[0], "/api/vacation-requests", "POST", {
        employeeId: b.employee.id, startDate: workday, endDate: workday, comment: "Session only",
      });
      assert.equal(vacation.status, 201);
      assert.equal((await vacation.json() as { employeeId: string }).employeeId, a.employee.id);
      assert.deepEqual(await database.user.findUniqueOrThrow({ where: { id: b.user.id } }), before.user);
      assert.deepEqual(await database.vacationRequest.findUniqueOrThrow({ where: { id: b.vacation.id } }), before.vacation);
      assert.deepEqual(await database.notification.findUniqueOrThrow({ where: { id: b.notification.id } }), before.notification);
      assert.deepEqual(await database.temporaryAssignment.findUniqueOrThrow({ where: { id: b.assignment.id } }), before.assignment);
      assert.deepEqual(await database.shiftSwapRequest.findUniqueOrThrow({ where: { id: foreignSwap.id } }), before.swap);
      assert.equal(ownSwap.requesterId, a.employee.id);
      const exportResponse = await request(sessions[0], `/api/export/excel?type=year&year=${today.slice(0, 4)}&employeeId=${a.employee.id}`);
      assert.equal(exportResponse.status, 200);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await exportResponse.arrayBuffer());
      const exported = JSON.stringify(workbook.model);
      assert.ok(exported.includes(a.employee.firstName));
      assert.ok(!exported.includes(b.employee.firstName));
    });

    await t.test("Adminrechtentzug und Rollenwechsel wirken sofort auf bestehende Sitzungen", async () => {
      for (const path of ["/admin", "/admin/leistung", "/admin/leistung/arbeitsplaetze", "/admin/qualifikationen",
        "/admin/schichttausch", "/admin/urlaub", "/admin/export"]) {
        assert.notEqual((await request(sessions[2], path)).status, 200, path);
      }
      assert.equal((await request(sessions[2], "/api/employees")).status, 403);
      for (const [permissionKey, scope] of [["approveVacation", "vacation"], ["viewQualifications", "qualifications"],
        ["editAssignments", "assignments"], ["exportReports", "export"]]) {
        const permission = await database.permission.findUniqueOrThrow({ where: { key: permissionKey } });
        await database.rolePermission.update({
          where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } }, data: { allowed: true },
        });
        const response = await request(sessions[2], `/api/employees?scope=${scope}`);
        assert.equal(response.status, 200);
        const text = await response.text();
        assert.ok(text.includes(a.employee.firstName) && text.includes(b.employee.firstName));
        assert.ok(!text.includes(a.employee.email!) && !text.includes(b.employee.email!));
        assert.ok(!text.includes(a.user.login) && !text.includes(b.user.login));
        assert.equal((await request(sessions[2], "/api/employees")).status, 403);
      }
      const assignmentData = await request(sessions[2], "/api/shift-plan?scope=assignments");
      assert.equal(assignmentData.status, 200);
      assert.ok(!(await assignmentData.text()).includes("PrivatUrlaubB"));
      assert.equal((await request(sessions[2], `/api/employees/${a.employee.id}/password`, "POST", { password })).status, 403);
      const permission = await database.permission.findUniqueOrThrow({ where: { key: "viewEmployees" } });
      await database.rolePermission.update({
        where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } }, data: { allowed: true },
      });
      assert.equal((await request(sessions[2], "/api/employees")).status, 200);
      await database.rolePermission.update({
        where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } }, data: { allowed: false },
      });
      assert.equal((await request(sessions[2], "/api/employees")).status, 403);
      for (const key of ["viewPerformance", "managePerformanceTargets", "approveShiftSwap"]) {
        const permission = await database.permission.findUniqueOrThrow({ where: { key } });
        await database.rolePermission.update({
          where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } }, data: { allowed: true },
        });
      }
      assert.equal((await request(sessions[2], "/admin/leistung")).status, 200);
      assert.equal((await request(sessions[2], "/admin/leistung/arbeitsplaetze")).status, 200);
      assert.equal((await request(sessions[2], "/admin/schichttausch")).status, 200);
      await database.rolePermission.updateMany({ where: { roleId: adminRole.id }, data: { allowed: true } });
      const fullAdminHome = await (await request(sessions[2], "/")).text();
      for (const path of ["/admin", "/mitarbeiter", "/admin/leistung", "/admin/qualifikationen", "/admin/zusatzschichten", "/nachrichten"]) {
        assert.ok(fullAdminHome.includes(`href="${path}"`), path);
      }
      for (const path of ["/admin", "/mitarbeiter", "/admin/urlaub", "/admin/qualifikationen",
        "/admin/einsatzplanung", "/admin/wochenplan", "/admin/mindestbesetzung",
        "/admin/einstellungen", "/admin/jahreswechsel", "/admin/export", "/admin/zusatzschichten"]) {
        assert.equal((await request(sessions[2], path)).status, 200, path);
      }
      for (const path of ["/api/employees", "/api/shift-plan", "/api/vacation-requests",
        "/api/temporary-assignments", "/api/shift-swaps?review=true"]) {
        const response = await request(sessions[2], path);
        assert.equal(response.status, 200, path);
        const text = await response.text();
        assert.ok(text.includes(a.employee.id) && text.includes(b.employee.id), path);
      }
      const notifications = await request(sessions[2], `/api/notifications?employeeId=${a.employee.id}`);
      const notificationText = await notifications.text();
      assert.ok(notificationText.includes("PrivatNachrichtADMIN"));
      assert.ok(!notificationText.includes("PrivatNachrichtA\"") && !notificationText.includes("PrivatNachrichtB"));
      const target = await action(sessions[2], "/admin/leistung/arbeitsplaetze", "saveTargetAction",
        { error: null, saved: false }, { code: "K01", targetPerHour: "600" });
      assert.equal(target.status, 200);
      assert.equal((await database.performanceWorkstation.findUniqueOrThrow({ where: { code: "K01" } })).targetPerHour, 600);
      assert.equal((await database.performanceEntry.findUniqueOrThrow({ where: { id: a.performance.id } })).targetPerHour, 500);
      let saturday = addDaysToKey(today, 7);
      while (dateKeyToUtc(saturday).getUTCDay() !== 6) saturday = addDaysToKey(saturday, 1);
      const extras = await request(sessions[2], "/api/additional-shifts", "POST", {
        action: "create", date: saturday, shift: "NIGHT", departmentId: department.id,
        employeeIds: [a.employee.id, b.employee.id], note: "HTTP Wochenende",
      });
      assert.equal(extras.status, 201);
      const created = await extras.json() as { entries: { id: string; employeeId: string; updatedAt: string }[] };
      assert.equal(created.entries.length, 2);
      const ownExtra = created.entries.find((entry) => entry.employeeId === a.employee.id)!;
      const releasePermission = await database.permission.findUniqueOrThrow({ where: { key: "releaseAdditionalShifts" } });
      await database.rolePermission.update({
        where: { roleId_permissionId: { roleId: adminRole.id, permissionId: releasePermission.id } }, data: { allowed: false },
      });
      assert.equal((await request(sessions[2], "/api/additional-shifts", "PATCH", {
        action: "release", id: ownExtra.id, updatedAt: ownExtra.updatedAt,
      })).status, 403);
      await database.rolePermission.update({
        where: { roleId_permissionId: { roleId: adminRole.id, permissionId: releasePermission.id } }, data: { allowed: true },
      });
      const releaseResponse = await request(sessions[2], "/api/additional-shifts", "PATCH", {
        action: "release", id: ownExtra.id, updatedAt: ownExtra.updatedAt,
      });
      assert.equal(releaseResponse.status, 200);
      const releasedExtra = await releaseResponse.json() as { entry: { id: string; updatedAt: string } };
      const ownPlan = await request(sessions[0], "/api/shift-plan");
      assert.ok((await ownPlan.text()).includes(ownExtra.id));
      const foreignPlan = await request(sessions[1], "/api/shift-plan");
      assert.ok(!(await foreignPlan.text()).includes(ownExtra.id));
      const calendar = await request(sessions[0], "/schichtplan");
      assert.match(await calendar.text(), /Zusatzschicht/);
      const dashboard = await request(sessions[0], "/dashboard");
      assert.match(await dashboard.text(), /Bevorstehende Zusatzschicht/);
      assert.equal((await request(sessions[0], "/api/additional-shifts", "PATCH", {
        action: "cancel", id: ownExtra.id, updatedAt: releasedExtra.entry.updatedAt,
      })).status, 403);
      assert.equal((await request(sessions[0], "/api/vacation-requests", "POST", {
        startDate: addDaysToKey(saturday, 1), endDate: addDaysToKey(saturday, 2), comment: "Kollision mit Nacht",
      })).status, 409);
      assert.equal((await request(sessions[2], "/api/additional-shifts", "PATCH", {
        action: "cancel", id: ownExtra.id, updatedAt: releasedExtra.entry.updatedAt,
      })).status, 200);
      assert.ok(!(await (await request(sessions[0], "/api/shift-plan")).text()).includes(ownExtra.id));
      await database.user.update({ where: { id: admin.user.id }, data: { roleId: employeeRole.id } });
      assert.equal((await request(sessions[2], "/api/employees")).status, 403);
      assert.notEqual((await request(sessions[2], "/admin/leistung")).status, 200);
      assert.equal((await request(sessions[3], "/api/employees")).status, 200);
      assert.equal((await request(sessions[3], `/api/employees/${b.employee.id}/password`, "POST", { password })).status, 403);
      assert.ok(foreman.employee.id);
    });

    await t.test("Eine geänderte User-Employee-Zuordnung wird in bestehenden Sitzungen aktuell aufgelöst", async () => {
      await database.$transaction([
        database.user.update({ where: { id: b.user.id }, data: { employeeId: null } }),
        database.user.update({ where: { id: a.user.id }, data: { employeeId: b.employee.id } }),
      ]);
      const response = await request(sessions[0], "/api/session");
      assert.equal(response.status, 200);
      const body = await response.json() as { employeeId: string; employee: { firstName: string } };
      assert.equal(body.employeeId, b.employee.id);
      assert.equal(body.employee.firstName, b.employee.firstName);
      for (const path of ["/api/vacation-requests", `/api/vacation-accounts?year=${today.slice(0, 4)}`,
        "/api/temporary-assignments", "/api/shift-plan"]) {
        assert.equal((await request(sessions[1], path)).status, 403, "Fehlende Mitarbeiterzuordnung");
      }
      const notifications = await request(sessions[0], "/api/notifications");
      const text = await notifications.text();
      assert.ok(text.includes("PrivatNachrichtB") && !text.includes("PrivatNachrichtA"));
      await database.$transaction([
        database.user.update({ where: { id: a.user.id }, data: { employeeId: null } }),
        database.user.update({ where: { id: b.user.id }, data: { employeeId: b.employee.id } }),
        database.user.update({ where: { id: a.user.id }, data: { employeeId: a.employee.id } }),
      ]);
    });

    await t.test("Passwortänderung manipuliert keine fremden Benutzerkonten; deaktivierte Konten verlieren Zugriff", async () => {
      const beforeB = await database.user.findUniqueOrThrow({ where: { id: b.user.id } });
      const response = await action(sessions[0], "/profil", "changePasswordAction",
        { error: null, success: false }, {
          userId: b.user.id, employeeId: b.employee.id, currentPassword: password,
          newPassword: `${password}-New`, confirmPassword: `${password}-New`,
        });
      assert.ok([200, 303].includes(response.status));
      assert.ok((await database.user.findUniqueOrThrow({ where: { id: a.user.id } })).passwordHash !== passwordHash, await response.text());
      assert.deepEqual(await database.user.findUniqueOrThrow({ where: { id: b.user.id } }), beforeB);
      assert.equal((await request(sessions[0], "/api/session")).status, 401, "Alte Sitzung nach Passwortwechsel");
      await database.user.update({ where: { id: b.user.id }, data: { active: false } });
      assert.equal((await request(sessions[1], "/api/session")).status, 401);
    });
  } finally {
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await once(server, "exit");
    }
    try {
      await db?.$disconnect();
    } finally {
      try {
        if (schemaCreated) await connection.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await connection.end();
      }
    }
  }
});
