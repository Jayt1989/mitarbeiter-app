ALTER TYPE "NotificationType" ADD VALUE 'SWAP_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'SWAP_PARTNER_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE 'SWAP_PARTNER_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'SWAP_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'SWAP_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'SWAP_CANCELLED';

CREATE TYPE "ShiftSwapStatus" AS ENUM (
  'ANGEFRAGT', 'PARTNER_BESTAETIGT', 'PARTNER_ABGELEHNT',
  'GENEHMIGT', 'ABGELEHNT', 'STORNIERT'
);

CREATE TABLE "ShiftSwapRequest" (
  "id" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "requesterOriginalShift" "ShiftCode" NOT NULL,
  "partnerOriginalShift" "ShiftCode" NOT NULL,
  "requesterArea" TEXT,
  "partnerArea" TEXT,
  "status" "ShiftSwapStatus" NOT NULL DEFAULT 'ANGEFRAGT',
  "comment" TEXT,
  "partnerDecidedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShiftSwapRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShiftSwapRequest_distinct_employees" CHECK ("requesterId" <> "partnerId"),
  CONSTRAINT "ShiftSwapRequest_working_shifts" CHECK (
    "requesterOriginalShift" <> 'OFF' AND "partnerOriginalShift" <> 'OFF'
    AND "requesterOriginalShift" <> "partnerOriginalShift"
  )
);

CREATE INDEX "ShiftSwapRequest_requesterId_date_status_idx"
  ON "ShiftSwapRequest"("requesterId", "date", "status");
CREATE INDEX "ShiftSwapRequest_partnerId_date_status_idx"
  ON "ShiftSwapRequest"("partnerId", "date", "status");
CREATE INDEX "ShiftSwapRequest_status_createdAt_idx"
  ON "ShiftSwapRequest"("status", "createdAt");

ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_requesterId_fkey"
  FOREIGN KEY ("requesterId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "key", "label") VALUES
  ('permission-request-shift-swap', 'requestShiftSwap', 'Eigenen Schichttausch anfragen und beantworten'),
  ('permission-approve-shift-swap', 'approveShiftSwap', 'Schichttausch prüfen und genehmigen')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "allowed")
SELECT r."id", p."id",
  CASE WHEN p."key" = 'requestShiftSwap' THEN true ELSE r."code" IN ('ADMIN', 'FOREMAN') END
FROM "Role" r CROSS JOIN "Permission" p
WHERE r."code" IN ('EMPLOYEE', 'ADMIN', 'FOREMAN')
  AND p."key" IN ('requestShiftSwap', 'approveShiftSwap')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
