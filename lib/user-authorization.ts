import type { Prisma } from "@prisma/client";
import type { AuthorizationContext } from "./authorization";
import { effectivePermissions } from "./access-policy";

export async function loadUserAuthorization(
  db: Pick<Prisma.TransactionClient, "user">, userId: string,
): Promise<AuthorizationContext | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      employee: { include: { permissions: { include: { permission: true } } } },
    },
  });
  if (!user?.active || user.employee?.isActive === false || user.mustChangePassword) return null;
  const permissions = Object.fromEntries(
    user.role.permissions.map((entry) => [entry.permission.key, entry.allowed]),
  );
  for (const entry of user.employee?.permissions ?? []) permissions[entry.permission.key] = entry.allowed;
  return {
    userId: user.id, employeeId: user.employeeId, login: user.login, role: user.role.code,
    permissions: effectivePermissions(user.role.code, permissions),
  };
}
