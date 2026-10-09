import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { NotificationInput } from "@/lib/notification-messages";

type NotificationDatabase = Pick<Prisma.TransactionClient, "notification">;

export async function createNotification(db: NotificationDatabase, input: NotificationInput) {
  return db.notification.create({ data: input });
}

export async function loadOwnNotifications(
  employeeId: string | null,
  limit?: number,
  db: NotificationDatabase = prisma,
) {
  if (!employeeId) return { notifications: [], unreadCount: 0 };
  const [notifications, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { employeeId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(limit ? { take: limit } : {}),
    }),
    db.notification.count({ where: { employeeId, read: false } }),
  ]);
  return {
    notifications: notifications.map((entry) => ({
      ...entry, createdAt: entry.createdAt.toISOString(), readAt: entry.readAt?.toISOString() ?? null,
    })),
    unreadCount,
  };
}

export async function markOwnNotificationsRead(
  employeeId: string,
  id?: string,
  db: NotificationDatabase = prisma,
) {
  return db.notification.updateMany({
    where: { employeeId, read: false, ...(id ? { id } : {}) },
    data: { read: true, readAt: new Date() },
  });
}
