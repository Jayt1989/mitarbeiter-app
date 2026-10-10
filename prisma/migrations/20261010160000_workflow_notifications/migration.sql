ALTER TYPE "NotificationType" ADD VALUE 'VACATION_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'SWAP_AWAITING_APPROVAL';

ALTER TABLE "Notification" ALTER COLUMN "employeeId" DROP NOT NULL;
ALTER TABLE "Notification" ADD COLUMN "userId" TEXT;

CREATE INDEX "Notification_userId_createdAt_id_idx"
  ON "Notification"("userId", "createdAt", "id");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
