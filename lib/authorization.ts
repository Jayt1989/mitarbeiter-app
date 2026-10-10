import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { permitted } from "@/lib/access-policy";
import { loadUserAuthorization } from "@/lib/user-authorization";

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

  return loadUserAuthorization(prisma, userId);
}

export function hasPermission(
  context: AuthorizationContext,
  permission: string,
) {
  return permitted(context, permission);
}
