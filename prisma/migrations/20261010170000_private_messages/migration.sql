ALTER TYPE "NotificationType" ADD VALUE 'MESSAGE_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'MESSAGE_REPLY';

CREATE TYPE "MessageThreadStatus" AS ENUM ('OFFEN', 'WARTET_AUF_ANTWORT', 'BEANTWORTET', 'ERLEDIGT', 'ARCHIVIERT');
CREATE TYPE "MessageRecipientType" AS ENUM ('SINGLE', 'MULTIPLE', 'DEPARTMENT', 'SHIFT_GROUP', 'ALL');

CREATE TABLE "MessageDispatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "createdById" TEXT,
  "recipientType" "MessageRecipientType" NOT NULL,
  "recipientSelection" JSONB NOT NULL,
  "recipientCount" INTEGER NOT NULL,
  "requestHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageDispatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "MessageThread" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "dispatchId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "createdById" TEXT,
  "creatorName" TEXT NOT NULL,
  "important" BOOLEAN NOT NULL DEFAULT false,
  "replyRequired" BOOLEAN NOT NULL DEFAULT false,
  "status" "MessageThreadStatus" NOT NULL DEFAULT 'OFFEN',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessageThread_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "MessageDispatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MessageThread_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "MessageParticipant" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "threadId" TEXT NOT NULL,
  "userId" TEXT,
  "employeeId" TEXT,
  "name" TEXT NOT NULL,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MessageParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MessageParticipant_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "Message" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "threadId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "senderId" TEXT,
  "senderName" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "MessageDispatch_createdById_createdAt_idx" ON "MessageDispatch"("createdById", "createdAt");
CREATE INDEX "MessageThread_createdById_updatedAt_idx" ON "MessageThread"("createdById", "updatedAt");
CREATE UNIQUE INDEX "MessageParticipant_threadId_userId_key" ON "MessageParticipant"("threadId", "userId");
CREATE UNIQUE INDEX "MessageParticipant_threadId_employeeId_key" ON "MessageParticipant"("threadId", "employeeId");
CREATE INDEX "MessageParticipant_userId_read_archivedAt_idx" ON "MessageParticipant"("userId", "read", "archivedAt");
CREATE INDEX "MessageParticipant_employeeId_read_archivedAt_idx" ON "MessageParticipant"("employeeId", "read", "archivedAt");
CREATE UNIQUE INDEX "Message_requestId_key" ON "Message"("requestId");
CREATE INDEX "Message_threadId_createdAt_id_idx" ON "Message"("threadId", "createdAt", "id");
CREATE UNIQUE INDEX "Message_threadId_sequence_key" ON "Message"("threadId", "sequence");

INSERT INTO "Permission" ("id", "key", "label") VALUES
  ('permission-receiveMessages', 'receiveMessages', 'Nachrichten empfangen und lesen'),
  ('permission-replyMessages', 'replyMessages', 'Eigene Nachrichten beantworten'),
  ('permission-sendMessageSingle', 'sendMessageSingle', 'Nachricht an einzelne Mitarbeiter senden'),
  ('permission-sendMessageMultiple', 'sendMessageMultiple', 'Nachricht an mehrere Mitarbeiter senden'),
  ('permission-sendMessageDepartment', 'sendMessageDepartment', 'Nachricht an Bereich senden'),
  ('permission-sendMessageShift', 'sendMessageShift', 'Nachricht an Schichtgruppe senden'),
  ('permission-sendMessageAll', 'sendMessageAll', 'Nachricht an alle aktiven Mitarbeiter senden'),
  ('permission-viewSentMessages', 'viewSentMessages', 'Eigene gesendete Nachrichten sehen'),
  ('permission-completeMessages', 'completeMessages', 'Eigene gesendete Nachrichten erledigen und archivieren')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "allowed")
SELECT r."id", p."id", r."code" = 'ADMIN' OR p."key" IN ('receiveMessages', 'replyMessages')
FROM "Role" r CROSS JOIN "Permission" p
WHERE r."code" IN ('ADMIN', 'FOREMAN', 'EMPLOYEE')
  AND p."key" IN ('receiveMessages', 'replyMessages', 'sendMessageSingle', 'sendMessageMultiple',
    'sendMessageDepartment', 'sendMessageShift', 'sendMessageAll', 'viewSentMessages', 'completeMessages')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
