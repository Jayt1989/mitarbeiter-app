import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { Client } from "pg";
import type { AuthorizationContext } from "./authorization";
import type { RecipientSelection, SendMessageInput } from "./message-rules";

test("Private Nachrichten: Migration, Empfänger-Snapshots, IDOR, Rechte und Status", {
  skip: process.env.MESSAGES_DB_TESTS !== "1",
}, async (t) => {
  const originalUrl = process.env.DATABASE_URL;
  assert.ok(originalUrl, "DATABASE_URL ist für den lokalen Test erforderlich.");
  const url = new URL(originalUrl);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Nur lokale Datenbanken sind erlaubt.");
  const schema = `messages_test_${randomBytes(8).toString("hex")}`;
  const connection = new Client({ connectionString: originalUrl });
  await connection.connect();
  let created = false;
  let disconnect: (() => Promise<void>) | undefined;
  try {
    await connection.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await connection.query(`SET search_path TO "${schema}"`);
    const root = path.resolve("prisma/migrations");
    const migration = "20261010170000_private_messages";
    const migrations = (await readdir(root)).filter((name) => /^\d/.test(name)).sort();
    for (const name of migrations.filter((entry) => entry < migration)) {
      await connection.query(await readFile(path.join(root, name, "migration.sql"), "utf8"));
    }
    url.searchParams.set("schema", schema);
    process.env.DATABASE_URL = url.toString();
    const { prisma } = await import("./prisma");
    disconnect = () => prisma.$disconnect();
    const { loadUserAuthorization } = await import("./user-authorization");
    const roles = {
      ADMIN: await prisma.role.create({ data: { code: "ADMIN", name: "Admin" } }),
      EMPLOYEE: await prisma.role.create({ data: { code: "EMPLOYEE", name: "Mitarbeiter" } }),
      FOREMAN: await prisma.role.create({ data: { code: "FOREMAN", name: "Vorarbeiter" } }),
    };
    const groupA = await prisma.shiftGroup.create({
      data: { code: "A", name: "Gruppe A", startShift: "EARLY", anchorDate: new Date("2026-10-05") },
    });
    const groupB = await prisma.shiftGroup.create({
      data: { code: "B", name: "Gruppe B", startShift: "LATE", anchorDate: new Date("2026-10-05") },
    });
    const model = await prisma.shiftModel.create({
      data: { code: "nur-frueh", name: "Früh", rotationOrder: ["EARLY"], workingWeekdays: [1, 2, 3, 4, 5] },
    });
    const packaging = await prisma.department.create({ data: { code: "PACK", name: "Verpackung" } });
    const warehouse = await prisma.department.create({ data: { code: "WARE", name: "Lager" } });
    async function account(code: string, role: keyof typeof roles, groupId = groupA.id, departmentId = packaging.id) {
      const employee = await prisma.employee.create({
        data: {
          firstName: code, lastName: "Nachrichtentest", personnelNumber: `MSG-${code}`,
          shiftModelId: model.id, shiftGroupId: groupId,
          departments: { create: { departmentId, isPrimary: true } },
        },
      });
      const user = await prisma.user.create({
        data: { login: `MSG-${code}`, passwordHash: "not-a-login-hash", roleId: roles[role].id, employeeId: employee.id },
      });
      return { employee, user };
    }
    const admin = await account("Admin", "ADMIN", groupB.id, warehouse.id);
    const a = await account("A", "EMPLOYEE");
    const b = await account("B", "EMPLOYEE");
    const c = await account("C", "EMPLOYEE", groupB.id, warehouse.id);
    const foreman = await account("Vorarbeiter", "FOREMAN", groupB.id, warehouse.id);
    const inactive = await account("Inaktiv", "EMPLOYEE");
    await prisma.user.update({ where: { id: inactive.user.id }, data: { active: false } });
    const inactiveEmployee = await account("InaktivMA", "EMPLOYEE");
    await prisma.employee.update({ where: { id: inactiveEmployee.employee.id }, data: { isActive: false } });
    const noLogin = await prisma.employee.create({
      data: { firstName: "Ohne", lastName: "Login", personnelNumber: "MSG-NOLOGIN", shiftModelId: model.id, shiftGroupId: groupB.id },
    });
    await prisma.notification.create({
      data: { employeeId: a.employee.id, title: "Bestehend", message: "Bleibt erhalten", type: "VACATION_APPROVED" },
    });
    const notificationsBefore = await prisma.notification.findMany();
    const employeesBefore = await prisma.employee.findMany();
    const usersBefore = await prisma.user.findMany();
    await connection.query(await readFile(path.join(root, migration, "migration.sql"), "utf8"));
    assert.deepEqual(await prisma.notification.findMany(), notificationsBefore);
    assert.deepEqual(await prisma.employee.findMany(), employeesBefore);
    assert.deepEqual(await prisma.user.findMany(), usersBefore);

    const {
      sendMessage, resolveMessageRecipients, getMessageThread, listMessageThreads,
      replyToMessage, updateMessageThread, countUnreadMessageThreads, messageTransaction,
    } = await import("./messages");
    const { MessageError } = await import("./message-rules");
    async function context(userId: string): Promise<AuthorizationContext> {
      const value = await loadUserAuthorization(prisma, userId);
      assert.ok(value); return value;
    }
    const adminContext = await context(admin.user.id);
    const aContext = await context(a.user.id);
    const bContext = await context(b.user.id);
    const cContext = await context(c.user.id);
    async function input(selection: RecipientSelection): Promise<SendMessageInput> {
      const recipients = await resolveMessageRecipients(prisma, adminContext, selection);
      return {
        requestId: randomUUID(), recipients: selection, expectedRecipientIds: recipients.map((entry) => entry.id),
        subject: "Samstag Frühschicht", content: "Kannst du Samstag arbeiten?", important: true, replyRequired: true,
      };
    }
    async function send(selection: RecipientSelection) {
      const data = await input(selection);
      const sent = await messageTransaction((db) => sendMessage(db, adminContext, data));
      const threads = await prisma.messageThread.findMany({ where: { dispatchId: sent.dispatchId } });
      return { data, sent, threads };
    }
    let singleId = "";
    await t.test("Admin an A: nur A und Absender lesen; fremde IDs blockieren alle Funktionen", async () => {
      const single = await send({ type: "SINGLE", employeeIds: [a.employee.id] });
      singleId = single.threads[0].id;
      assert.equal(single.threads.length, 1);
      assert.equal((await getMessageThread(prisma, aContext, singleId)).status, "WARTET_AUF_ANTWORT");
      assert.equal(await countUnreadMessageThreads(aContext), 1);
      assert.equal((await listMessageThreads(prisma, bContext)).length, 0);
      for (const outsider of [bContext, { ...adminContext, userId: "foreign-admin", employeeId: null }]) {
        await assert.rejects(getMessageThread(prisma, outsider, singleId), (error: unknown) =>
          error instanceof MessageError && error.status === 404);
        await assert.rejects(messageTransaction((db) => replyToMessage(db, outsider, singleId, { requestId: randomUUID(), content: "IDOR" })), /nicht gefunden/);
        for (const action of ["archive", "complete", "archiveThread"] as const) {
          await assert.rejects(messageTransaction((db) => updateMessageThread(db, outsider, singleId, { action })), /nicht gefunden/);
        }
        await assert.rejects(messageTransaction((db) => updateMessageThread(db, outsider, singleId, { action: "read", version: 1 })), /nicht gefunden/);
      }
      await assert.rejects(messageTransaction((db) => updateMessageThread(db, aContext, singleId, { action: "complete" })), /Keine Berechtigung/);
    });
    await t.test("readAt, chronologische Antworten, Empfänger ungelesen und keine doppelten Antworten", async () => {
      const readAuditCount = await prisma.auditLog.count();
      await messageTransaction((db) => updateMessageThread(db, aContext, singleId, { action: "read", version: 1 }));
      const read = await getMessageThread(prisma, aContext, singleId);
      assert.equal(read.read, true); assert.ok(read.readAt);
      assert.equal(await countUnreadMessageThreads(aContext), 0);
      assert.equal(await prisma.auditLog.count(), readAuditCount);
      await messageTransaction((db) => updateMessageThread(db, aContext, singleId, { action: "read", version: 1 }));
      assert.equal((await getMessageThread(prisma, aContext, singleId)).readAt, read.readAt);
      const reply = { requestId: randomUUID(), content: "Ja, ich kann." };
      await messageTransaction((db) => replyToMessage(db, aContext, singleId, reply));
      assert.equal((await getMessageThread(prisma, aContext, singleId)).status, "BEANTWORTET");
      assert.equal(await countUnreadMessageThreads(adminContext), 1);
      const notifications = await prisma.notification.count({ where: { userId: admin.user.id, type: "MESSAGE_REPLY" } });
      assert.equal(notifications, 1);
      await messageTransaction((db) => replyToMessage(db, aContext, singleId, reply));
      assert.equal(await prisma.notification.count({ where: { userId: admin.user.id, type: "MESSAGE_REPLY" } }), 1);
      await messageTransaction((db) => replyToMessage(db, adminContext, singleId, { requestId: randomUUID(), content: "Danke, ich plane dich ein." }));
      const thread = await getMessageThread(prisma, aContext, singleId);
      assert.equal(thread.read, false); assert.equal(thread.readAt, null);
      assert.equal(thread.status, "BEANTWORTET");
      assert.deepEqual(thread.messages.map((message) => message.content), ["Kannst du Samstag arbeiten?", "Ja, ich kann.", "Danke, ich plane dich ein."]);
      await assert.rejects(messageTransaction((db) => updateMessageThread(db, aContext, singleId, { action: "read", version: 1 })), /neue Antworten/);
    });
    await t.test("Mehrfachversand erzeugt getrennte private Verläufe; Retry erzeugt keine Duplikate", async () => {
      const multiple = await send({ type: "MULTIPLE", employeeIds: [a.employee.id, b.employee.id] });
      assert.equal(multiple.threads.length, 2);
      const ownA = (await listMessageThreads(prisma, aContext)).find((entry) => entry.dispatchId === multiple.sent.dispatchId);
      const ownB = (await listMessageThreads(prisma, bContext)).find((entry) => entry.dispatchId === multiple.sent.dispatchId);
      assert.ok(ownA); assert.ok(ownB); assert.notEqual(ownA.id, ownB.id);
      await messageTransaction((db) => replyToMessage(db, aContext, ownA.id, { requestId: randomUUID(), content: "Privat nur A" }));
      assert.equal((await getMessageThread(prisma, bContext, ownB.id)).messages.length, 1);
      await assert.rejects(getMessageThread(prisma, bContext, ownA.id), /nicht gefunden/);
      const count = await prisma.notification.count();
      await messageTransaction((db) => sendMessage(db, adminContext, multiple.data));
      assert.equal(await prisma.notification.count(), count);
      assert.equal(await prisma.messageThread.count({ where: { dispatchId: multiple.sent.dispatchId } }), 2);
    });
    await t.test("Bereich und Schichtgruppe: nur aktuelle aktive Mitarbeiter; alte Teilnehmer eingefroren", async () => {
      const department = await send({ type: "DEPARTMENT", departmentId: packaging.id });
      assert.deepEqual(department.data.expectedRecipientIds.sort(), [a.employee.id, b.employee.id].sort());
      const before = await prisma.messageParticipant.findMany({ where: { thread: { dispatchId: department.sent.dispatchId } } });
      await prisma.employeeDepartment.update({
        where: { employeeId_departmentId: { employeeId: a.employee.id, departmentId: packaging.id } },
        data: { departmentId: warehouse.id },
      });
      await prisma.employee.update({ where: { id: a.employee.id }, data: { shiftGroupId: groupB.id } });
      assert.deepEqual(await prisma.messageParticipant.findMany({ where: { thread: { dispatchId: department.sent.dispatchId } } }), before);
      assert.ok((await listMessageThreads(prisma, aContext)).some((entry) => entry.dispatchId === department.sent.dispatchId));
      const group = await send({ type: "SHIFT_GROUP", shiftGroupId: groupA.id });
      assert.deepEqual(group.data.expectedRecipientIds, [b.employee.id]);
      const recipients = await prisma.messageParticipant.findMany({ where: { thread: { dispatchId: group.sent.dispatchId }, employeeId: { not: null } } });
      assert.equal(recipients.length, 1); assert.equal(recipients[0].employeeId, b.employee.id);
      await prisma.employee.update({ where: { id: b.employee.id }, data: { shiftGroupId: groupB.id } });
      assert.equal((await prisma.messageParticipant.findMany({
        where: { thread: { dispatchId: group.sent.dispatchId }, employeeId: { not: null } },
      }))[0].employeeId, b.employee.id);
    });
    await t.test("Alle: aktive Mitarbeiter inklusive ohne Login; deaktivierte Konten und Rechte ausgeschlossen", async () => {
      const all = await send({ type: "ALL" });
      assert.deepEqual(all.data.expectedRecipientIds.sort(), [a.employee.id, b.employee.id, c.employee.id, foreman.employee.id, noLogin.id].sort());
      const stale = await input({ type: "ALL" });
      await prisma.user.update({ where: { id: c.user.id }, data: { active: false } });
      await assert.rejects(messageTransaction((db) => sendMessage(db, adminContext, stale)), /Empfängerauswahl hat sich geändert/);
      assert.equal(await prisma.messageDispatch.count({ where: { id: stale.requestId } }), 0);
      const next = await send({ type: "ALL" });
      assert.ok(!next.data.expectedRecipientIds.includes(c.employee.id));
      assert.equal(await loadUserAuthorization(prisma, c.user.id), null);
      await prisma.user.update({ where: { id: c.user.id }, data: { active: true } });
    });
    await t.test("Vorarbeiterrechte und Rechteentzug gelten bei der nächsten serverseitigen Prüfung", async () => {
      const foremanContext = await context(foreman.user.id);
      await assert.rejects(resolveMessageRecipients(prisma, foremanContext, { type: "ALL" }), /Keine Berechtigung/);
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key: "sendMessageSingle" } });
      const view = await prisma.permission.findUniqueOrThrow({ where: { key: "viewSentMessages" } });
      for (const entry of [permission, view]) await prisma.employeePermission.create({
        data: { employeeId: foreman.employee.id, permissionId: entry.id, allowed: true },
      });
      assert.equal((await resolveMessageRecipients(prisma, await context(foreman.user.id), { type: "SINGLE", employeeIds: [a.employee.id] })).length, 1);
      await prisma.employeePermission.update({
        where: { employeeId_permissionId: { employeeId: foreman.employee.id, permissionId: permission.id } }, data: { allowed: false },
      });
      await assert.rejects(resolveMessageRecipients(prisma, await context(foreman.user.id), { type: "SINGLE", employeeIds: [a.employee.id] }), /Keine Berechtigung/);
      const receive = await prisma.permission.findUniqueOrThrow({ where: { key: "receiveMessages" } });
      await prisma.employeePermission.create({ data: { employeeId: a.employee.id, permissionId: receive.id, allowed: false } });
      const revoked = await context(a.user.id);
      await assert.rejects(getMessageThread(prisma, revoked, singleId), /Keine Berechtigung/);
      const all = await resolveMessageRecipients(prisma, adminContext, { type: "ALL" });
      assert.ok(!all.some((entry) => entry.id === a.employee.id));
      await prisma.employeePermission.delete({ where: { employeeId_permissionId: { employeeId: a.employee.id, permissionId: receive.id } } });
      const replyPermission = await prisma.permission.findUniqueOrThrow({ where: { key: "replyMessages" } });
      await prisma.employeePermission.create({ data: { employeeId: a.employee.id, permissionId: replyPermission.id, allowed: false } });
      await assert.rejects(messageTransaction(async (db) => replyToMessage(db, await context(a.user.id), singleId, { requestId: randomUUID(), content: "Entzogen" })), /Keine Berechtigung zum Antworten/);
      await prisma.employeePermission.delete({ where: { employeeId_permissionId: { employeeId: a.employee.id, permissionId: replyPermission.id } } });
    });
    await t.test("Entzogene Absenderrechte verhindern Lesen und weitere Antwort-Benachrichtigungen", async () => {
      const view = await prisma.permission.findUniqueOrThrow({ where: { key: "viewSentMessages" } });
      await prisma.employeePermission.create({
        data: { employeeId: admin.employee.id, permissionId: view.id, allowed: false },
      });
      const revoked = await context(admin.user.id);
      await assert.rejects(getMessageThread(prisma, revoked, singleId), /nicht gefunden/);
      const count = await prisma.notification.count({ where: { userId: admin.user.id, type: "MESSAGE_REPLY" } });
      await messageTransaction((db) => replyToMessage(db, aContext, singleId, { requestId: randomUUID(), content: "Antwort nach Rechteentzug" }));
      assert.equal(await prisma.notification.count({ where: { userId: admin.user.id, type: "MESSAGE_REPLY" } }), count);
      await prisma.employeePermission.delete({
        where: { employeeId_permissionId: { employeeId: admin.employee.id, permissionId: view.id } },
      });
    });
    await t.test("Persönliches Archiv, erledigt und global archiviert erhalten alle Daten", async () => {
      const messageCount = await prisma.message.count();
      await messageTransaction((db) => updateMessageThread(db, aContext, singleId, { action: "archive" }));
      assert.equal((await getMessageThread(prisma, aContext, singleId)).archived, true);
      await messageTransaction((db) => replyToMessage(db, adminContext, singleId, { requestId: randomUUID(), content: "Noch eine Information" }));
      assert.equal((await getMessageThread(prisma, aContext, singleId)).archived, false);
      await messageTransaction((db) => updateMessageThread(db, adminContext, singleId, { action: "complete" }));
      await assert.rejects(messageTransaction((db) => replyToMessage(db, aContext, singleId, { requestId: randomUUID(), content: "Zu spät" })), /Erledigte/);
      await messageTransaction((db) => updateMessageThread(db, adminContext, singleId, { action: "archiveThread" }));
      assert.equal((await getMessageThread(prisma, aContext, singleId)).status, "ARCHIVIERT");
      assert.equal(await prisma.message.count(), messageCount + 1);
      assert.equal(await prisma.messageThread.count({ where: { id: singleId } }), 1);
      assert.equal(await prisma.auditLog.count({ where: { entityId: singleId, action: "message.complete" } }), 1);
      const logs = await prisma.auditLog.findMany({ where: { action: { startsWith: "message." } } });
      for (const log of logs) assert.ok(!JSON.stringify(log.newValues).includes("Kannst du Samstag"));
    });
    await t.test("Paralleler Versand mit derselben Kennung bleibt genau einmal persistent", async () => {
      const data = await input({ type: "SINGLE", employeeIds: [b.employee.id] });
      const results = await Promise.allSettled([
        messageTransaction((db) => sendMessage(db, adminContext, data)),
        messageTransaction((db) => sendMessage(db, adminContext, data)),
      ]);
      assert.ok(results.some((result) => result.status === "fulfilled"));
      await messageTransaction((db) => sendMessage(db, adminContext, data));
      assert.equal(await prisma.messageThread.count({ where: { dispatchId: data.requestId } }), 1);
      assert.equal(await prisma.notification.count({
        where: { type: "MESSAGE_RECEIVED", link: { in: (await prisma.messageThread.findMany({ where: { dispatchId: data.requestId } })).map((entry) => `/nachrichten/${entry.id}`) } },
      }), 1);
    });
    await t.test("Gleichzeitige Antworten bleiben einmalig und stabil in Verlaufsreihenfolge", async () => {
      const sent = await send({ type: "SINGLE", employeeIds: [b.employee.id] });
      const id = sent.threads[0].id;
      const replies = [
        { requestId: randomUUID(), content: "Antwort eins" },
        { requestId: randomUUID(), content: "Antwort zwei" },
      ];
      const results = await Promise.allSettled(replies.map((reply) =>
        messageTransaction((db) => replyToMessage(db, bContext, id, reply))));
      for (const [index, result] of results.entries()) {
        if (result.status === "rejected") {
          assert.ok(result.reason instanceof MessageError && result.reason.status === 409);
          await messageTransaction((db) => replyToMessage(db, bContext, id, replies[index]));
        }
      }
      const messages = await prisma.message.findMany({ where: { threadId: id }, orderBy: { sequence: "asc" } });
      assert.deepEqual(messages.map((entry) => entry.sequence), [1, 2, 3]);
      assert.equal(new Set(messages.map((entry) => entry.requestId)).size, 3);
      assert.equal((await getMessageThread(prisma, bContext, id)).messages.length, 3);
      assert.equal(await prisma.notification.count({ where: { userId: admin.user.id, type: "MESSAGE_REPLY", link: `/nachrichten/${id}` } }), 2);
    });
    await t.test("Bestehende Mitarbeiterlöschung erhält Nachrichten und Namens-Snapshots", async () => {
      const { analyzeEmployeeDeletion, deleteEmployeePermanently } = await import("./employee-deletion");
      await prisma.user.update({ where: { id: c.user.id }, data: { active: false } });
      await prisma.employee.update({ where: { id: c.employee.id }, data: { isActive: false } });
      const participant = await prisma.messageParticipant.findFirstOrThrow({
        where: { employeeId: c.employee.id },
      });
      const messagesBefore = await prisma.message.findMany({ where: { threadId: participant.threadId } });
      const preview = await analyzeEmployeeDeletion(prisma, c.employee.id, adminContext);
      assert.ok(preview); assert.ok(preview.canDelete);
      assert.ok(preview.retained.some((entry) => entry.key === "messageThreads"));
      await deleteEmployeePermanently(prisma, adminContext, c.employee.id, {
        confirmation: c.employee.personnelNumber, confirmHistory: false, fingerprint: preview.fingerprint,
      });
      const retained = await prisma.messageParticipant.findUniqueOrThrow({ where: { id: participant.id } });
      assert.equal(retained.employeeId, null); assert.equal(retained.name, participant.name);
      assert.deepEqual(await prisma.message.findMany({ where: { threadId: participant.threadId } }), messagesBefore);
      assert.equal(await prisma.messageThread.count({ where: { id: participant.threadId } }), 1);
    });
    assert.equal((await listMessageThreads(prisma, cContext)).every((thread) => !thread.sent), true);
  } finally {
    process.env.DATABASE_URL = originalUrl;
    try { await disconnect?.(); } finally {
      try { if (created) await connection.query(`DROP SCHEMA "${schema}" CASCADE`); }
      finally { await connection.end(); }
    }
  }
});
