import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { permitted, effectivePermissions } from "./access-policy";
import type { AuthorizationContext } from "./authorization";
import { createNotification } from "./notifications";
import { recordAuditLog } from "./audit";
import { loadUserAuthorization } from "./user-authorization";
import {
  allowedRecipientTypes, canManageMessages, canSendMessage, canUseMessages, MessageError,
  type MessageAction, type RecipientSelection, type SendMessageInput,
} from "./message-rules";

type MessageDatabase = Prisma.TransactionClient;
const recipientRelations = {
  permissions: { include: { permission: true } },
  user: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
} satisfies Prisma.EmployeeInclude;
const threadRelations = {
  participants: { orderBy: { createdAt: "asc" } },
  messages: { orderBy: { sequence: "asc" } },
} satisfies Prisma.MessageThreadInclude;
type ThreadRecord = Prisma.MessageThreadGetPayload<{ include: typeof threadRelations }>;

export function participantScope(context: AuthorizationContext): Prisma.MessageParticipantWhereInput {
  return { OR: [
    { userId: context.userId },
    ...(context.employeeId ? [{ employeeId: context.employeeId }] : []),
  ] };
}
function accessScope(context: AuthorizationContext): Prisma.MessageThreadWhereInput {
  const branches: Prisma.MessageThreadWhereInput[] = [];
  if (permitted(context, "receiveMessages") && context.employeeId) {
    branches.push({ participants: { some: { employeeId: context.employeeId } } });
  }
  if (canManageMessages(context, "viewSentMessages")) {
    branches.push({ createdById: context.userId, participants: { some: { userId: context.userId } } });
  }
  return { OR: branches };
}
function requireModule(context: AuthorizationContext) {
  if (!canUseMessages(context)) throw new MessageError("Keine Berechtigung für Nachrichten.");
}
function ownParticipant(record: ThreadRecord, context: AuthorizationContext) {
  const participant = record.participants.find((entry) => entry.userId === context.userId ||
    (!!context.employeeId && entry.employeeId === context.employeeId));
  if (!participant) throw new MessageError("Nachrichtenverlauf nicht gefunden.", 404);
  return participant;
}
function toThreadDto(record: ThreadRecord, context: AuthorizationContext) {
  const own = ownParticipant(record, context);
  const sent = record.createdById === context.userId;
  return {
    id: record.id, dispatchId: record.dispatchId, subject: record.subject,
    creatorName: record.creatorName, important: record.important, replyRequired: record.replyRequired,
    status: record.status, version: record.version,
    createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(),
    read: own.read, readAt: own.readAt?.toISOString() ?? null,
    archived: own.archivedAt !== null, sent,
    recipientName: record.participants.find((entry) => entry.userId !== record.createdById)?.name ?? "Ehemaliger Mitarbeiter",
    participants: record.participants.map((entry) => ({
      id: entry.id, name: entry.name,
      ...(sent ? { read: entry.read, readAt: entry.readAt?.toISOString() ?? null } : {}),
    })),
    messages: record.messages.map((entry) => ({
      id: entry.id, senderName: entry.senderName, content: entry.content,
      createdAt: entry.createdAt.toISOString(), own: entry.senderId === context.userId,
    })),
    canReply: permitted(context, "replyMessages") &&
      record.status !== "ERLEDIGT" && record.status !== "ARCHIVIERT",
    canComplete: sent && canManageMessages(context, "completeMessages"),
  };
}
export type MessageThreadDto = ReturnType<typeof toThreadDto>;

export async function getMessageThread(db: MessageDatabase, context: AuthorizationContext, id: string) {
  requireModule(context);
  const record = await db.messageThread.findFirst({
    where: { id, ...accessScope(context) }, include: threadRelations,
  });
  if (!record) throw new MessageError("Nachrichtenverlauf nicht gefunden.", 404);
  return toThreadDto(record, context);
}
export async function listMessageThreads(db: MessageDatabase, context: AuthorizationContext) {
  requireModule(context);
  const records = await db.messageThread.findMany({
    where: accessScope(context), include: threadRelations,
    orderBy: [{ important: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
  });
  return records.map((record) => toThreadDto(record, context));
}
export async function countUnreadMessageThreads(
  context: AuthorizationContext, db: MessageDatabase = prisma,
) {
  if (!canUseMessages(context)) return 0;
  return db.messageThread.count({
    where: {
      ...accessScope(context), status: { not: "ARCHIVIERT" },
      participants: { some: { ...participantScope(context), read: false, archivedAt: null } },
    },
  });
}

function acceptsMessages(employee: Prisma.EmployeeGetPayload<{ include: typeof recipientRelations }>) {
  if (!employee.isActive || employee.user?.active === false) return false;
  const permissions = Object.fromEntries(
    employee.user?.role.permissions.map((entry) => [entry.permission.key, entry.allowed]) ??
      [["receiveMessages", true]],
  );
  for (const entry of employee.permissions) permissions[entry.permission.key] = entry.allowed;
  return effectivePermissions(employee.user?.role.code ?? "EMPLOYEE", permissions).receiveMessages === true;
}

export async function resolveMessageRecipients(
  db: MessageDatabase, context: AuthorizationContext, selection: RecipientSelection,
) {
  if (!canSendMessage(context, selection.type)) throw new MessageError("Keine Berechtigung für diese Empfängerart.");
  let filter: Prisma.EmployeeWhereInput = {};
  if (selection.type === "SINGLE" || selection.type === "MULTIPLE") {
    filter = { id: { in: [...new Set(selection.employeeIds)] } };
  } else if (selection.type === "DEPARTMENT") {
    const department = await db.department.findFirst({ where: { id: selection.departmentId, active: true } });
    if (!department) throw new MessageError("Aktiver Bereich nicht gefunden.", 400);
    filter = { departments: { some: { departmentId: department.id } } };
  } else if (selection.type === "SHIFT_GROUP") {
    const group = await db.shiftGroup.findFirst({ where: { id: selection.shiftGroupId, active: true } });
    if (!group) throw new MessageError("Aktive Schichtgruppe nicht gefunden.", 400);
    filter = { shiftGroupId: group.id };
  }
  const employees = await db.employee.findMany({
    where: { ...filter, isActive: true, ...(context.employeeId ? { NOT: { id: context.employeeId } } : {}) },
    include: recipientRelations, orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const recipients = employees.filter(acceptsMessages).map((employee) => ({
    id: employee.id, name: `${employee.firstName} ${employee.lastName}`,
  }));
  if (selection.type === "SINGLE" || selection.type === "MULTIPLE") {
    if (recipients.length !== new Set(selection.employeeIds).size) {
      throw new MessageError("Die Auswahl enthält inaktive, nicht berechtigte oder eigene Mitarbeiterkonten.", 400);
    }
  }
  if (!recipients.length) throw new MessageError("Keine aktiven, empfangsberechtigten Mitarbeiter gefunden.", 400);
  return recipients;
}
export async function messageRecipientOptions(db: MessageDatabase, context: AuthorizationContext) {
  const types = allowedRecipientTypes(context);
  if (!types.length) throw new MessageError("Keine Berechtigung zum Senden.");
  const [employees, departments, shiftGroups] = await Promise.all([
    types.some((type) => type === "SINGLE" || type === "MULTIPLE") ? db.employee.findMany({
      where: { isActive: true, ...(context.employeeId ? { NOT: { id: context.employeeId } } : {}) },
      include: recipientRelations, orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }) : Promise.resolve([]),
    types.includes("DEPARTMENT") ? db.department.findMany({
      where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" },
    }) : Promise.resolve([]),
    types.includes("SHIFT_GROUP") ? db.shiftGroup.findMany({
      where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" },
    }) : Promise.resolve([]),
  ]);
  return {
    types, employees: employees.filter(acceptsMessages).map((entry) => ({
      id: entry.id, name: `${entry.firstName} ${entry.lastName}`,
    })), departments, shiftGroups,
  };
}
export type MessageRecipientOptions = Awaited<ReturnType<typeof messageRecipientOptions>>;

async function senderName(db: MessageDatabase, userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId }, select: { login: true, employee: { select: { firstName: true, lastName: true } } },
  });
  return user.employee ? `${user.employee.firstName} ${user.employee.lastName}` : user.login;
}
function inputHash(input: SendMessageInput) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
export async function sendMessage(db: MessageDatabase, context: AuthorizationContext, input: SendMessageInput) {
  if (!canSendMessage(context, input.recipients.type)) throw new MessageError("Keine Berechtigung zum Senden.");
  const hash = inputHash(input);
  const existing = await db.messageDispatch.findUnique({ where: { id: input.requestId } });
  if (existing) {
    if (existing.createdById !== context.userId || existing.requestHash !== hash) {
      throw new MessageError("Die Versandkennung wurde bereits für einen anderen Vorgang verwendet.", 409);
    }
    return { dispatchId: existing.id, recipientCount: existing.recipientCount };
  }
  const recipients = await resolveMessageRecipients(db, context, input.recipients);
  if (JSON.stringify(recipients.map((entry) => entry.id).sort()) !==
    JSON.stringify([...new Set(input.expectedRecipientIds)].sort())) {
    throw new MessageError("Die Empfängerauswahl hat sich geändert. Bitte die Vorschau erneut laden und bestätigen.", 409);
  }
  const name = await senderName(db, context.userId);
  await db.messageDispatch.create({
    data: {
      id: input.requestId, createdById: context.userId, recipientType: input.recipients.type,
      recipientSelection: input.recipients, recipientCount: recipients.length, requestHash: hash,
    },
  });
  for (const recipient of recipients) {
    const thread = await db.messageThread.create({
      data: {
        dispatchId: input.requestId, subject: input.subject, createdById: context.userId,
        creatorName: name, important: input.important, replyRequired: input.replyRequired,
        status: input.replyRequired ? "WARTET_AUF_ANTWORT" : "OFFEN",
        participants: { create: [
          { userId: context.userId, name, read: true, readAt: new Date() },
          { employeeId: recipient.id, name: recipient.name },
        ] },
        messages: { create: {
          senderId: context.userId, senderName: name, content: input.content, sequence: 1,
          requestId: `${input.requestId}:${recipient.id}`,
        } },
      },
    });
    await createNotification(db, {
      employeeId: recipient.id, title: input.important ? "Wichtige Nachricht" : "Neue Nachricht",
      message: `Neue Nachricht von ${name}: ${input.subject}`, type: "MESSAGE_RECEIVED",
      link: `/nachrichten/${thread.id}`,
    });
  }
  const auditValues = { recipientType: input.recipients.type, recipientCount: recipients.length };
  await recordAuditLog({
    actorUserId: context.userId, action: "message.thread.create",
    entityType: "MessageDispatch", entityId: input.requestId, newValues: auditValues,
  }, db);
  await recordAuditLog({
    actorUserId: context.userId, action: `message.send.${input.recipients.type.toLowerCase()}`,
    entityType: "MessageDispatch", entityId: input.requestId, newValues: auditValues,
  }, db);
  return { dispatchId: input.requestId, recipientCount: recipients.length };
}

export async function replyToMessage(
  db: MessageDatabase, context: AuthorizationContext, threadId: string,
  input: { requestId: string; content: string },
) {
  const thread = await getMessageThread(db, context, threadId);
  if (!permitted(context, "replyMessages")) throw new MessageError("Keine Berechtigung zum Antworten.");
  const duplicate = await db.message.findUnique({ where: { requestId: input.requestId } });
  if (duplicate) {
    if (duplicate.senderId !== context.userId || duplicate.threadId !== threadId || duplicate.content !== input.content) {
      throw new MessageError("Diese Antwortkennung wurde bereits verwendet.", 409);
    }
    return thread;
  }
  if (!thread.canReply) throw new MessageError("Erledigte oder archivierte Verläufe können nicht beantwortet werden.", 409);
  const changed = await db.messageThread.updateMany({
    where: { id: threadId, version: thread.version },
    data: { version: { increment: 1 }, status: "BEANTWORTET" },
  });
  if (!changed.count) throw new MessageError("Der Verlauf wurde gleichzeitig geändert. Bitte neu laden.", 409);
  const name = await senderName(db, context.userId);
  await db.message.create({
    data: {
      threadId, senderId: context.userId, senderName: name, content: input.content,
      requestId: input.requestId, sequence: thread.version + 1,
    },
  });
  const record = await db.messageThread.findUniqueOrThrow({ where: { id: threadId }, include: threadRelations });
  const own = ownParticipant(record, context);
  await db.messageParticipant.updateMany({
    where: { threadId, id: { not: own.id } },
    data: { read: false, readAt: null, archivedAt: null },
  });
  await db.messageParticipant.update({ where: { id: own.id }, data: { read: true, readAt: new Date(), archivedAt: null } });
  for (const participant of record.participants.filter((entry) => entry.id !== own.id)) {
    if (participant.userId) {
      const user = await loadUserAuthorization(db, participant.userId);
      if (!user || !canManageMessages(user, "viewSentMessages")) continue;
      await createNotification(db, {
        userId: user.userId, title: "Antwort auf deine Nachricht",
        message: `${name} hat auf „${record.subject}“ geantwortet.`, type: "MESSAGE_REPLY", link: `/nachrichten/${threadId}`,
      });
    } else if (participant.employeeId) {
      const employee = await db.employee.findUnique({ where: { id: participant.employeeId }, include: recipientRelations });
      if (!employee || !acceptsMessages(employee)) continue;
      await createNotification(db, {
        employeeId: employee.id, title: "Neue Antwort",
        message: `${name} hat auf „${record.subject}“ geantwortet.`, type: "MESSAGE_REPLY", link: `/nachrichten/${threadId}`,
      });
    }
  }
  return getMessageThread(db, context, threadId);
}

export async function updateMessageThread(
  db: MessageDatabase, context: AuthorizationContext, threadId: string, input: MessageAction,
) {
  const thread = await getMessageThread(db, context, threadId);
  if (input.action === "read") {
    if (thread.version !== input.version) throw new MessageError("Es gibt neue Antworten. Bitte den Verlauf erneut laden.", 409);
    await db.messageParticipant.updateMany({
      where: { threadId, ...participantScope(context), read: false }, data: { read: true, readAt: new Date() },
    });
    return;
  }
  if (input.action === "archive" || input.action === "unarchive") {
    const archivedAt = input.action === "archive" ? new Date() : null;
    const changed = await db.messageParticipant.updateMany({
      where: { threadId, ...participantScope(context), archivedAt: input.action === "archive" ? null : { not: null } },
      data: { archivedAt },
    });
    if (changed.count) await recordAuditLog({
      actorUserId: context.userId, action: `message.${input.action}`,
      entityType: "MessageThread", entityId: threadId,
    }, db);
    return;
  }
  if (!thread.canComplete) throw new MessageError("Keine Berechtigung zum Verwalten dieses Verlaufs.");
  const status = input.action === "complete" ? "ERLEDIGT" : "ARCHIVIERT";
  if (thread.status === status) return;
  if (input.action === "archiveThread" && thread.status !== "ERLEDIGT") {
    throw new MessageError("Nur erledigte Verläufe können für alle archiviert werden.", 409);
  }
  if (thread.status === "ARCHIVIERT") throw new MessageError("Der Verlauf ist bereits archiviert.", 409);
  const changed = await db.messageThread.updateMany({
    where: { id: threadId, version: thread.version }, data: { status, version: { increment: 1 } },
  });
  if (!changed.count) throw new MessageError("Der Verlauf wurde gleichzeitig geändert. Bitte neu laden.", 409);
  await recordAuditLog({
    actorUserId: context.userId, action: input.action === "complete" ? "message.complete" : "message.archive_thread",
    entityType: "MessageThread", entityId: threadId, newValues: { status },
  }, db);
}

export async function messageTransaction<T>(work: (db: MessageDatabase) => Promise<T>) {
  try {
    return await prisma.$transaction(work, { isolationLevel: "Serializable", timeout: 30000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) {
      throw new MessageError("Der Vorgang wurde gleichzeitig verarbeitet. Bitte erneut versuchen; dieselbe Versandkennung verhindert Duplikate.", 409);
    }
    throw error;
  }
}
