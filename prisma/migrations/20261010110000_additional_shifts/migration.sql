ALTER TYPE "NotificationType" ADD VALUE 'ADDITIONAL_SHIFT_RELEASED';
ALTER TYPE "NotificationType" ADD VALUE 'ADDITIONAL_SHIFT_UPDATED';
ALTER TYPE "NotificationType" ADD VALUE 'ADDITIONAL_SHIFT_CANCELLED';

CREATE TYPE "AdditionalShiftStatus" AS ENUM ('ENTWURF', 'FREIGEGEBEN', 'STORNIERT');
CREATE TABLE "AdditionalShift" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "shift" "ShiftCode" NOT NULL,
  "departmentId" TEXT NOT NULL,
  "status" "AdditionalShiftStatus" NOT NULL DEFAULT 'ENTWURF',
  "note" TEXT,
  "createdById" TEXT,
  "releasedById" TEXT,
  "releasedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdditionalShift_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdditionalShift_weekend" CHECK (EXTRACT(ISODOW FROM "date") IN (6, 7)),
  CONSTRAINT "AdditionalShift_working_shift" CHECK ("shift" <> 'OFF'),
  CONSTRAINT "AdditionalShift_status_times" CHECK (
    ("status" <> 'FREIGEGEBEN' OR ("releasedAt" IS NOT NULL AND "cancelledAt" IS NULL))
    AND ("status" <> 'STORNIERT' OR "cancelledAt" IS NOT NULL)
  )
);
CREATE INDEX "AdditionalShift_employeeId_date_status_idx" ON "AdditionalShift"("employeeId", "date", "status");
CREATE INDEX "AdditionalShift_status_date_departmentId_idx" ON "AdditionalShift"("status", "date", "departmentId");
CREATE UNIQUE INDEX "AdditionalShift_active_employee_date_key" ON "AdditionalShift"("employeeId", "date")
  WHERE "status" <> 'STORNIERT';
ALTER TABLE "AdditionalShift" ADD CONSTRAINT "AdditionalShift_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdditionalShift" ADD CONSTRAINT "AdditionalShift_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdditionalShift" ADD CONSTRAINT "AdditionalShift_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdditionalShift" ADD CONSTRAINT "AdditionalShift_releasedById_fkey"
  FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "key", "label") VALUES
  ('permission-view-additional-shifts', 'viewAdditionalShifts', 'Zusatzschichten sehen'),
  ('permission-plan-additional-shifts', 'planAdditionalShifts', 'Zusatzschichten planen'),
  ('permission-release-additional-shifts', 'releaseAdditionalShifts', 'Zusatzschichten freigeben'),
  ('permission-cancel-additional-shifts', 'cancelAdditionalShifts', 'Zusatzschichten stornieren')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "allowed")
SELECT r."id", p."id", r."code" IN ('ADMIN', 'FOREMAN')
FROM "Role" r CROSS JOIN "Permission" p
WHERE r."code" IN ('EMPLOYEE', 'ADMIN', 'FOREMAN')
  AND p."key" IN ('viewAdditionalShifts', 'planAdditionalShifts', 'releaseAdditionalShifts', 'cancelAdditionalShifts')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
