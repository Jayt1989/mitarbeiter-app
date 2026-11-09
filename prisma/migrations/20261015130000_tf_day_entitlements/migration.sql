CREATE TYPE "VacationRequestType" AS ENUM ('VACATION', 'TF_DAY');

ALTER TYPE "NotificationType" ADD VALUE 'TF_DAY_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'TF_DAY_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'TF_DAY_REJECTED';

ALTER TABLE "VacationRequest"
ADD COLUMN "requestType" "VacationRequestType" NOT NULL DEFAULT 'VACATION';

CREATE INDEX "VacationRequest_employee_type_status_period_idx"
ON "VacationRequest"("employeeId", "requestType", "status", "startDate", "endDate");

CREATE TABLE "TfDayAccount" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "entitlement" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TfDayAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TfDayAccount_employeeId_year_key"
ON "TfDayAccount"("employeeId", "year");

CREATE INDEX "TfDayAccount_year_idx" ON "TfDayAccount"("year");

ALTER TABLE "TfDayAccount"
ADD CONSTRAINT "TfDayAccount_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
