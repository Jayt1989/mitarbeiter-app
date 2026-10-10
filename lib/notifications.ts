import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { NotificationInput } from "@/lib/notification-messages";
import { effectivePermissions } from "@/lib/access-policy";

type NotificationDatabase = Pick<Prisma.TransactionClient, "notification">;
type NotificationRecipientDatabase = Pick<Prisma.TransactionClient, "user">;
type PermissionNotificationDatabase = NotificationDatabase & NotificationRecipientDatabase;

export async function createNotification(db: NotificationDatabase, input: NotificationInput) {
  return db.notification.create({ data: input });
}

async function loadActiveUsersWithPermission(
  db: NotificationRecipientDatabase,
  permission: string,
) {
  const users = await db.user.findMany({
    where: {
      active: true,
      mustChangePassword: false,
      OR: [{ employeeId: null }, { employee: { is: { isActive: true } } }],
    },
    select: {
      id: true,
      role: {
        select: {
          code: true,
          permissions: { select: { allowed: true, permission: { select: { key: true } } } },
        },
      },
      employee: {
        select: {
          permissions: { select: { allowed: true, permission: { select: { key: true } } } },
        },
      },
    },
  });
  return users.filter((user) => {
    const permissions = Object.fromEntries(
      user.role.permissions.map((entry) => [entry.permission.key, entry.allowed]),
    );
    for (const entry of user.employee?.permissions ?? []) {
      permissions[entry.permission.key] = entry.allowed;
    }
    return effectivePermissions(user.role.code, permissions)[permission] === true;
  }).map((user) => user.id);
}

export async function notifyUsersWithPermission(
  db: PermissionNotificationDatabase,
  permission: string,
  notificationFor: (userId: string) => NotificationInput,
) {
  const recipients = await loadActiveUsersWithPermission(db, permission);
  for (const userId of recipients) {
    await createNotification(db, notificationFor(userId));
  }
}

export async function loadOwnNotifications(
  employeeId: string | null,
  userId: string | null,
  limit?: number,
  db: NotificationDatabase = prisma,
) {
  const recipientScope = [
    ...(employeeId ? [{ employeeId }] : []),
    ...(userId ? [{ userId }] : []),
  ];
  if (!recipientScope.length) return { notifications: [], unreadCount: 0 };
  const [notifications, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { OR: recipientScope },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(limit ? { take: limit } : {}),
    }),
    db.notification.count({ where: { OR: recipientScope, read: false } }),
  ]);
  return {
    notifications: notifications.map((entry) => ({
      ...entry, createdAt: entry.createdAt.toISOString(), readAt: entry.readAt?.toISOString() ?? null,
    })),
    unreadCount,
  };
}

export async function markOwnNotificationsRead(
  employeeId: string | null,
  userId: string,
  id?: string,
  db: NotificationDatabase = prisma,
) {
  const recipientScope = [
    ...(employeeId ? [{ employeeId }] : []),
    { userId },
  ];
  return db.notification.updateMany({
    where: {
      OR: recipientScope,
      read: false,
      ...(id ? { id } : {}),
    },
    data: { read: true, readAt: new Date() },
  });
}
