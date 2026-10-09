CREATE TYPE "NotificationType" AS ENUM (
  'VACATION_APPROVED', 'VACATION_REJECTED', 'SHIFT_CHANGED',
  'ASSIGNMENT_CREATED', 'ASSIGNMENT_UPDATED', 'ASSIGNMENT_CANCELLED',
  'QUALIFICATION_ADDED'
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "link" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_employeeId_createdAt_id_idx"
  ON "Notification"("employeeId", "createdAt", "id");
CREATE INDEX "Notification_employeeId_read_idx"
  ON "Notification"("employeeId", "read");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
