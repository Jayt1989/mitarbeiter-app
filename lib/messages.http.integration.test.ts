import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { test } from "node:test";
import { PrismaClient, type Employee, type User } from "@prisma/client";
import { hash } from "bcryptjs";
import { Client } from "pg";
import { upsertPermissions, upsertRoles, syncRolePermissions } from "@/prisma/permission-sync";

test("Nachrichten HTTP: echte Sitzungen, IDOR, Rechteentzug, Badge und private Seiten", {
  skip: process.env.MESSAGES_HTTP_TESTS !== "1", timeout: 120000,
}, async (t) => {
  assert.ok(process.env.DATABASE_URL);
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Nur lokale Testdatenbanken erlaubt.");
  const schema = `messages_http_${randomBytes(8).toString("hex")}`;
  const connection = new Client({ connectionString: url.toString() });
  await connection.connect();
  let schemaCreated = false;
  let db: PrismaClient | undefined;
  let server: ChildProcess | undefined;
  try {
    await connection.query(`CREATE SCHEMA "${schema}"`); schemaCreated = true;
    await connection.query(`SET search_path TO "${schema}"`);
    for (const migration of (await readdir("prisma/migrations")).filter((entry) => /^\d/.test(entry)).sort()) {
      await connection.query(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"));
    }
    url.searchParams.set("schema", schema);
    db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    const database = db;
    const roles = await upsertRoles(database);
    const permissions = await upsertPermissions(database);
    await syncRolePermissions(database, roles, permissions);
    const model = await database.shiftModel.create({
      data: { code: "nur-frueh", name: "Früh", rotationOrder: ["EARLY"], workingWeekdays: [1, 2, 3, 4, 5] },
    });
    const group = await database.shiftGroup.create({
      data: { code: "A", name: "Gruppe A", startShift: "EARLY", anchorDate: new Date("2026-10-05") },
    });
    const password = `Test-${randomBytes(16).toString("hex")}!`;
    const passwordHash = await hash(password, 4);
    const accounts: { employee: Employee; user: User }[] = [];
    for (const [label, role] of [["Admin", "ADMIN"], ["A", "EMPLOYEE"], ["B", "EMPLOYEE"], ["Vorarbeiter", "FOREMAN"]] as const) {
      const roleId = roles.get(role)?.id; assert.ok(roleId);
      const employee = await database.employee.create({
        data: { firstName: label, lastName: "HTTP", personnelNumber: `MSG-HTTP-${label}`,
          shiftModelId: model.id, shiftGroupId: group.id },
      });
      const user = await database.user.create({
        data: { login: employee.personnelNumber, passwordHash, roleId, employeeId: employee.id },
      });
      accounts.push({ employee, user });
    }
    const listener = createServer();
    await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
    const address = listener.address(); assert.ok(address && typeof address !== "string");
    await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
    const base = `http://127.0.0.1:${address.port}`;
    let output = "";
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(address.port)], {
      env: { ...process.env, DATABASE_URL: url.toString(), AUTH_SECRET: randomBytes(32).toString("hex"),
        AUTH_URL: base, AUTH_TRUST_HOST: "true" }, stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout?.on("data", (chunk) => { output = `${output}${chunk}`.slice(-4000); });
    server.stderr?.on("data", (chunk) => { output = `${output}${chunk}`.slice(-4000); });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error(`Testserver beendet: ${output}`);
      try { ready = (await fetch(`${base}/api/auth/csrf`)).ok; }
      catch (error) { if (!(error instanceof TypeError)) throw error; }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, "Lokaler Testserver ist nicht erreichbar.");
    async function login(loginName: string) {
      const csrf = await fetch(`${base}/api/auth/csrf`);
      const csrfBody = await csrf.json() as { csrfToken: string };
      const cookie = csrf.headers.getSetCookie().map((entry) => entry.split(";")[0]).join("; ");
      const result = await fetch(`${base}/api/auth/callback/credentials`, {
        method: "POST", redirect: "manual",
        headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
        body: new URLSearchParams({ csrfToken: csrfBody.csrfToken, login: loginName, password, callbackUrl: `${base}/` }),
      });
      const cookies = result.headers.getSetCookie().map((entry) => entry.split(";")[0]);
      assert.ok(cookies.some((entry) => entry.startsWith("authjs.session-token=")), "Testanmeldung fehlgeschlagen.");
      return [cookie, ...cookies].join("; ");
    }
    const sessions = await Promise.all(accounts.map((account) => login(account.user.login)));
    function request(index: number, endpoint: string, method = "GET", body?: unknown, origin = base) {
      return fetch(`${base}${endpoint}`, {
        method, redirect: "manual",
        headers: { Cookie: sessions[index], Origin: origin, ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    }
    let threadId = "";
    await t.test("Admin sendet, A liest, B bekommt weder Liste noch direkten ID-Zugriff", async () => {
      const recipientSelection = { type: "SINGLE", employeeIds: [accounts[1].employee.id] };
      const previewResponse = await request(0, "/api/messages/recipients", "POST", recipientSelection);
      assert.equal(previewResponse.status, 200, previewResponse.status === 200 ? undefined : await previewResponse.text());
      const preview = await previewResponse.json() as { count: number; recipientIds: string[] };
      assert.equal(preview.count, 1);
      const sendResponse = await request(0, "/api/messages", "POST", {
        requestId: randomUUID(), recipients: recipientSelection, expectedRecipientIds: preview.recipientIds,
        subject: "Privater HTTP-Betreff", content: "Nur Mitarbeiter A", important: true, replyRequired: true,
      });
      assert.equal(sendResponse.status, 201, await sendResponse.text());
      const list = await request(1, "/api/messages");
      const entries = await list.json() as { id: string }[];
      assert.equal(entries.length, 1); threadId = entries[0].id;
      assert.equal((await request(1, `/api/messages/${threadId}`)).status, 200);
      assert.deepEqual(await (await request(2, "/api/messages")).json(), []);
      assert.equal((await request(2, `/api/messages/${threadId}`)).status, 404);
      assert.equal((await request(2, `/api/messages/${threadId}`, "POST", { requestId: randomUUID(), content: "Fremd" })).status, 404);
      for (const body of [{ action: "read", version: 1 }, { action: "archive" }, { action: "complete" }]) {
        assert.equal((await request(2, `/api/messages/${threadId}`, "PATCH", body)).status, 404);
      }
      assert.deepEqual(await (await request(1, "/api/messages/unread")).json(), { unreadCount: 1 });
      const inbox = await (await request(1, "/nachrichten")).text();
      assert.ok(inbox.includes("Privater HTTP-Betreff"));
      assert.ok(!inbox.includes("Nachricht erstellen"));
      const foreignPage = await request(2, `/nachrichten/${threadId}`);
      const foreignHtml = await foreignPage.text();
      assert.ok(!foreignHtml.includes("Nur Mitarbeiter A"));
      assert.ok(!foreignHtml.includes("Privater HTTP-Betreff"));
    });
    await t.test("Antwort, Benachrichtigung und readAt werden über die echten APIs gespeichert", async () => {
      assert.equal((await request(1, `/api/messages/${threadId}`, "PATCH", { action: "read", version: 1 })).status, 200);
      assert.deepEqual(await (await request(1, "/api/messages/unread")).json(), { unreadCount: 0 });
      const reply = { requestId: randomUUID(), content: "Ja, ich kann." };
      assert.equal((await request(1, `/api/messages/${threadId}`, "POST", reply)).status, 201);
      assert.equal((await request(1, `/api/messages/${threadId}`, "POST", reply)).status, 201);
      const feed = await (await request(0, "/api/notifications")).json() as { unreadCount: number; notifications: { type: string; link: string }[] };
      assert.equal(feed.notifications.filter((entry) => entry.type === "MESSAGE_REPLY").length, 1);
      assert.equal(feed.notifications[0].link, `/nachrichten/${threadId}`);
      assert.deepEqual(await (await request(0, "/api/messages/unread")).json(), { unreadCount: 1 });
      const participant = await database.messageParticipant.findFirstOrThrow({ where: { employeeId: accounts[1].employee.id, threadId } });
      assert.ok(participant.readAt);
    });
    await t.test("Vorarbeiter ohne Senderecht, fremde Herkunft und Rechteentzug blockieren sofort", async () => {
      assert.equal((await request(3, "/api/messages/recipients")).status, 403);
      assert.equal((await request(3, "/api/messages", "POST", {
        requestId: randomUUID(), recipients: { type: "ALL" }, expectedRecipientIds: [accounts[1].employee.id],
        subject: "Unberechtigt", content: "Darf nicht versenden", important: false, replyRequired: false,
      })).status, 403);
      assert.equal((await request(1, `/api/messages/${threadId}`, "POST", { requestId: randomUUID(), content: "CSRF" }, "https://example.invalid")).status, 403);
      const permissionId = permissions.get("receiveMessages")?.id; assert.ok(permissionId);
      await database.employeePermission.create({ data: { employeeId: accounts[1].employee.id, permissionId, allowed: false } });
      assert.equal((await request(1, `/api/messages/${threadId}`)).status, 403);
      assert.equal((await request(1, `/api/messages/${threadId}`, "POST", { requestId: randomUUID(), content: "Trotz Entzug" })).status, 403);
      await database.user.update({ where: { id: accounts[2].user.id }, data: { active: false } });
      assert.equal((await request(2, "/api/messages")).status, 401);
    });
  } finally {
    if (server && server.exitCode === null) { server.kill("SIGTERM"); await once(server, "exit"); }
    try { await db?.$disconnect(); } finally {
      try { if (schemaCreated) await connection.query(`DROP SCHEMA "${schema}" CASCADE`); }
      finally { await connection.end(); }
    }
  }
});
