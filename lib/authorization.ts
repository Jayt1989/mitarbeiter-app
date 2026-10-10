import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { effectivePermissions, permitted } from "@/lib/access-policy";

export type AuthorizationContext = {
  userId: string;
  employeeId: string | null;
  login: string;
  role: string;
  permissions: Record<string, boolean>;
};

export async function getAuthorizationContext(): Promise<AuthorizationContext | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      employee: { include: { permissions: { include: { permission: true } } } },
    },
  });
  if (!user?.active || user.employee?.isActive === false) return null;
  // Solange das Startpasswort nicht ersetzt wurde, gibt es keinen Zugriff auf App-Funktionen.
  if (user.mustChangePassword) return null;

  const permissions = Object.fromEntries(
    user.role.permissions.map((entry) => [entry.permission.key, entry.allowed]),
  );
  for (const entry of user.employee?.permissions ?? []) {
    permissions[entry.permission.key] = entry.allowed;
  }

  return {
    userId: user.id,
    employeeId: user.employeeId,
    login: user.login,
    role: user.role.code,
    permissions: effectivePermissions(user.role.code, permissions),
  };
}

export function hasPermission(
  context: AuthorizationContext,
  permission: string,
) {
  return permitted(context, permission);
}
