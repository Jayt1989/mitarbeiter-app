CREATE TABLE "PerformanceWorkstation" (
    "code" TEXT NOT NULL,
    "area" "PerformanceArea" NOT NULL,
    "targetPerHour" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PerformanceWorkstation_pkey" PRIMARY KEY ("code"),
    CONSTRAINT "PerformanceWorkstation_targetPerHour_check"
      CHECK ("targetPerHour" IS NULL OR "targetPerHour" > 0)
);

-- Bestehende Snapshots bleiben unverändert. Ohne bisherigen Snapshot bleibt das Soll offen.
INSERT INTO "PerformanceWorkstation" ("code", "area", "targetPerHour", "updatedAt")
SELECT w.code, w.area::"PerformanceArea",
  (SELECT e."targetPerHour" FROM "PerformanceEntry" e
   WHERE e."workstation" = w.code AND e."targetPerHour" IS NOT NULL
   ORDER BY e."createdAt" DESC, e."id" DESC LIMIT 1),
  CURRENT_TIMESTAMP
FROM (VALUES
  ('K01', 'PICKING'), ('K02', 'PICKING'), ('K03', 'PICKING'),
  ('VP1', 'PACKING'), ('VP2', 'PACKING'), ('VP3', 'PACKING')
) AS w(code, area);

INSERT INTO "Permission" ("id", "key", "label") VALUES
  ('permission-manage-performance-targets', 'managePerformanceTargets', 'Sollwerte der Arbeitsplätze bearbeiten')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "allowed")
SELECT r."id", p."id", r."code" = 'ADMIN'
FROM "Role" r CROSS JOIN "Permission" p
WHERE r."code" IN ('EMPLOYEE', 'FOREMAN', 'ADMIN')
  AND p."key" = 'managePerformanceTargets'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
