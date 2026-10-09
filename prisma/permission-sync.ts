import type { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient;
import { permissionOptions } from "../app/mitarbeiter/data";

export const roleDefinitions = [
  { code: "EMPLOYEE", name: "Mitarbeiter" },
  { code: "FOREMAN", name: "Vorarbeiter" },
  { code: "ADMIN", name: "Admin" },
] as const;

export type RoleCode = (typeof roleDefinitions)[number]["code"];

export const allPermissionKeys = permissionOptions.map((permission) => permission.id);

export const defaultRolePermissions: Record<RoleCode, ReadonlySet<string>> = {
  EMPLOYEE: new Set([
    "ownShiftPlan",
    "requestVacation",
    "ownVacation",
    "ownQualifications",
    "requestShiftSwap",
    "recordPerformance",
  ]),
  FOREMAN: new Set([
    "ownShiftPlan",
    "teamShiftPlan",
    "requestVacation",
    "ownVacation",
    "otherVacations",
    "viewEmployees",
    "editShiftPlans",
    "recordAbsence",
    "viewQualifications",
    "ownQualifications",
    "requestShiftSwap",
    "approveShiftSwap",
    "recordPerformance",
    "viewPerformance",
  ]),
  // Admin erhält immer alle Rechte aus permissionOptions, auch später hinzugefügte.
  ADMIN: new Set(allPermissionKeys),
};

export async function upsertRoles(prisma: Db) {
  const roles = new Map<RoleCode, { id: string }>();
  for (const role of roleDefinitions) {
    const record = await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name },
      create: role,
    });
    roles.set(role.code, record);
  }
  return roles;
}

export async function upsertPermissions(prisma: Db) {
  const permissions = new Map<string, { id: string }>();
  for (const permission of permissionOptions) {
    const record = await prisma.permission.upsert({
      where: { key: permission.id },
      update: { label: permission.label },
      create: { key: permission.id, label: permission.label },
    });
    permissions.set(permission.id, record);
  }
  return permissions;
}

/**
 * Setzt Rollenrechte auf die vorgesehenen Standardwerte.
 * `onlyAdminUpdates`: bestehende Einträge der Nicht-Admin-Rollen bleiben unverändert,
 * fehlende Einträge werden trotzdem angelegt.
 */
export async function syncRolePermissions(
  prisma: Db,
  roles: Map<RoleCode, { id: string }>,
  permissions: Map<string, { id: string }>,
  { onlyAdminUpdates = false }: { onlyAdminUpdates?: boolean } = {},
) {
  for (const role of roleDefinitions) {
    const roleId = roles.get(role.code)!.id;
    for (const key of allPermissionKeys) {
      const permissionId = permissions.get(key)!.id;
      const allowed = defaultRolePermissions[role.code].has(key);
      const updateExisting = !onlyAdminUpdates || role.code === "ADMIN";
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        update: updateExisting ? { allowed } : {},
        create: { roleId, permissionId, allowed },
      });
    }
  }
}

/** Gibt allen Mitarbeitern mit Benutzerrolle ADMIN sämtliche Rechte als Mitarbeiter-Eintrag. */
export async function grantAllPermissionsToAdminEmployees(
  prisma: Db,
  permissions: Map<string, { id: string }>,
) {
  const adminUsers = await prisma.user.findMany({
    where: { role: { code: "ADMIN" }, employeeId: { not: null } },
    select: { login: true, employeeId: true },
  });
  for (const user of adminUsers) {
    for (const key of allPermissionKeys) {
      const permissionId = permissions.get(key)!.id;
      await prisma.employeePermission.upsert({
        where: { employeeId_permissionId: { employeeId: user.employeeId!, permissionId } },
        update: { allowed: true },
        create: { employeeId: user.employeeId!, permissionId, allowed: true },
      });
    }
  }
  return adminUsers;
}

/** Effektive Rechte wie in auth.ts: Rollenrecht, überschrieben durch Mitarbeiter-Eintrag. */
export async function getMissingAdminPermissions(prisma: Db) {
  const adminUsers = await prisma.user.findMany({
    where: { role: { code: "ADMIN" } },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      employee: { include: { permissions: { include: { permission: true } } } },
    },
  });
  return adminUsers.map((user) => {
    const effective: Record<string, boolean> = Object.fromEntries(
      user.role.permissions.map((entry) => [entry.permission.key, entry.allowed]),
    );
    for (const entry of user.employee?.permissions ?? []) {
      effective[entry.permission.key] = entry.allowed;
    }
    return {
      login: user.login,
      employeeId: user.employeeId,
      missing: allPermissionKeys.filter((key) => effective[key] !== true),
    };
  });
}
