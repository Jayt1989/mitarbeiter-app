-- Neue Berechtigung „Eigene Qualifikationen sehen“, standardmäßig für alle Rollen
INSERT INTO "Permission" ("id", "key", "label")
VALUES ('perm_own_qualifications', 'ownQualifications', 'Eigene Qualifikationen sehen')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "allowed")
SELECT r."id", p."id", true
FROM "Role" r
CROSS JOIN "Permission" p
WHERE p."key" = 'ownQualifications'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
