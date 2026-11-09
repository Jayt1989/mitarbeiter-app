INSERT INTO "Permission" ("id", "key", "label") VALUES
  ('permission-manage-tf-day-entitlements', 'manageTfDayEntitlements', 'TF-Tage-Ansprüche verwalten')
ON CONFLICT ("key") DO UPDATE
SET "label" = EXCLUDED."label";

INSERT INTO "RolePermission" ("roleId", "permissionId", "allowed")
SELECT r."id", p."id", r."code" = 'ADMIN'
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."code" IN ('ADMIN', 'FOREMAN', 'EMPLOYEE')
  AND p."key" = 'manageTfDayEntitlements'
ON CONFLICT ("roleId", "permissionId") DO UPDATE
SET "allowed" = EXCLUDED."allowed";
