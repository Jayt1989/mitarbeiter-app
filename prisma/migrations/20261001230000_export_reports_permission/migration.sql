-- Neue Berechtigung „Exporte erstellen“, standardmäßig nur für die Admin-Rolle
INSERT INTO "Permission" ("id", "key", "label")
VALUES ('perm_export_reports', 'exportReports', 'Exporte erstellen')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "allowed")
SELECT r."id", p."id", r."code" = 'ADMIN'
FROM "Role" r
CROSS JOIN "Permission" p
WHERE p."key" = 'exportReports'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
