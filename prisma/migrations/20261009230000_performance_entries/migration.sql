-- Leistungserfassung: neue Tabelle, keine Änderung an bestehenden Daten.
CREATE TYPE "PerformanceArea" AS ENUM ('PICKING', 'PACKING');

CREATE TABLE "PerformanceEntry" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "shift" "ShiftCode" NOT NULL,
    "area" "PerformanceArea" NOT NULL,
    "workstation" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PerformanceEntry_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "PerformanceEntry_duration_check" CHECK ("durationMinutes" > 0 AND "durationMinutes" <= 960),
    CONSTRAINT "PerformanceEntry_shift_check" CHECK ("shift" <> 'OFF')
);

CREATE INDEX "PerformanceEntry_employeeId_workDate_idx" ON "PerformanceEntry"("employeeId", "workDate");
CREATE INDEX "PerformanceEntry_workDate_area_workstation_idx" ON "PerformanceEntry"("workDate", "area", "workstation");

ALTER TABLE "PerformanceEntry" ADD CONSTRAINT "PerformanceEntry_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PerformanceEntry" ADD CONSTRAINT "PerformanceEntry_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Neue Rechte: alle Rollen dürfen eigene Leistung erfassen, Vorarbeiter und Admin auswerten.
-- Bestehende Einträge bleiben unverändert (ON CONFLICT DO NOTHING).
INSERT INTO "Permission" ("id", "key", "label") VALUES
  ('permission-record-performance', 'recordPerformance', 'Eigene Leistung erfassen'),
  ('permission-view-performance', 'viewPerformance', 'Leistungen auswerten')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "allowed")
SELECT r."id", p."id",
  CASE WHEN p."key" = 'recordPerformance' THEN true ELSE r."code" IN ('ADMIN', 'FOREMAN') END
FROM "Role" r CROSS JOIN "Permission" p
WHERE r."code" IN ('EMPLOYEE', 'ADMIN', 'FOREMAN')
  AND p."key" IN ('recordPerformance', 'viewPerformance')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
