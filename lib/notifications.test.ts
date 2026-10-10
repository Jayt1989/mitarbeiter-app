import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import type { Prisma, Notification } from "@prisma/client";
import { prisma } from "./prisma";
import {
  createNotification, loadOwnNotifications, markOwnNotificationsRead, notifyUsersWithPermission,
} from "./notifications";
import { qualificationNotification, vacationRequestNotification } from "./notification-messages";

const db = {
  notification: {
    ...prisma.notification,
    findMany: prisma.notification.findMany,
    count: prisma.notification.count,
    updateMany: prisma.notification.updateMany,
    create: prisma.notification.create,
  },
  user: { ...prisma.user, findMany: prisma.user.findMany },
};

afterEach(() => mock.restoreAll());

const notification: Notification = {
  id: "notification-1", employeeId: "employee-1", userId: null, title: "Test", message: "Nachricht",
  type: "QUALIFICATION_ADDED", read: false, link: "/dashboard",
  createdAt: new Date("2026-10-02T11:00:00Z"), readAt: null,
};

test("listing and unread count include only the authenticated employee and user recipients", async () => {
  const list = mock.method(db.notification, "findMany", async (args: Prisma.NotificationFindManyArgs) => {
    assert.deepEqual(args.where, { OR: [{ employeeId: notification.employeeId }, { userId: "user-1" }] });
    assert.deepEqual(args.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
    return [notification];
  });
  const count = mock.method(db.notification, "count", async (args: Prisma.NotificationCountArgs) => {
    assert.deepEqual(args.where, {
      OR: [{ employeeId: notification.employeeId }, { userId: "user-1" }], read: false,
    });
    return 1;
  });
  const feed = await loadOwnNotifications(notification.employeeId, "user-1", undefined, db);
  assert.equal(list.mock.callCount(), 1);
  assert.equal(count.mock.callCount(), 1);
  assert.equal(feed.unreadCount, 1);
  assert.equal(feed.notifications[0].createdAt, "2026-10-02T11:00:00.000Z");
  assert.equal(feed.notifications[0].readAt, null);
});

test("preview requests exactly the five latest own records but counts all unread records", async () => {
  mock.method(db.notification, "findMany", async (args: Prisma.NotificationFindManyArgs) => {
    assert.equal(args.take, 5);
    assert.deepEqual(args.where, { OR: [{ employeeId: "employee-1" }, { userId: "user-1" }] });
    return [];
  });
  mock.method(db.notification, "count", async () => 12);
  assert.equal((await loadOwnNotifications("employee-1", "user-1", 5, db)).unreadCount, 12);
});

test("users without employee association still load their own account notifications", async () => {
  mock.method(db.notification, "findMany", async (args: Prisma.NotificationFindManyArgs) => {
    assert.deepEqual(args.where, { OR: [{ userId: "user-1" }] });
    return [];
  });
  mock.method(db.notification, "count", async () => 0);
  assert.deepEqual(await loadOwnNotifications(null, "user-1", undefined, db), {
    notifications: [], unreadCount: 0,
  });
});

test("a missing employee and user association never queries notifications", async () => {
  const list = mock.method(db.notification, "findMany", async () => {
    throw new Error("Must not query notifications");
  });
  const count = mock.method(db.notification, "count", async () => {
    throw new Error("Must not query notifications");
  });
  assert.deepEqual(await loadOwnNotifications(null, null, undefined, db), { notifications: [], unreadCount: 0 });
  assert.equal(list.mock.callCount(), 0);
  assert.equal(count.mock.callCount(), 0);
});

test("single read updates require both ownership and unread status", async () => {
  mock.method(db.notification, "updateMany", async (args: Prisma.NotificationUpdateManyArgs) => {
    assert.deepEqual(args.where, {
      OR: [{ employeeId: "employee-1" }, { userId: "user-1" }], read: false, id: "foreign-id",
    });
    assert.equal(args.data.read, true);
    assert.ok(args.data.readAt instanceof Date);
    return { count: 0 };
  });
  assert.equal((await markOwnNotificationsRead("employee-1", "user-1", "foreign-id", db)).count, 0);
});

test("mark all read is scoped to the employee and preserves prior read timestamps", async () => {
  mock.method(db.notification, "updateMany", async (args: Prisma.NotificationUpdateManyArgs) => {
    assert.deepEqual(args.where, {
      OR: [{ employeeId: "employee-1" }, { userId: "user-1" }], read: false,
    });
    assert.equal(args.data.read, true);
    assert.ok(args.data.readAt instanceof Date);
    return { count: 3 };
  });
  assert.equal((await markOwnNotificationsRead("employee-1", "user-1", undefined, db)).count, 3);
});

test("notification creation errors propagate so the surrounding transaction can roll back", async () => {
  mock.method(db.notification, "create", async () => { throw new Error("Storage failure"); });
  await assert.rejects(
    createNotification(db, qualificationNotification("employee-1", "Staplerschein")),
    /Storage failure/,
  );
});

test("read and listing failures are not silently treated as successful empty results", async () => {
  mock.method(db.notification, "updateMany", async () => { throw new Error("Read failure"); });
  await assert.rejects(markOwnNotificationsRead("employee-1", "user-1", undefined, db), /Read failure/);
  mock.method(db.notification, "findMany", async () => { throw new Error("List failure"); });
  mock.method(db.notification, "count", async () => 0);
  await assert.rejects(loadOwnNotifications("employee-1", "user-1", undefined, db), /List failure/);
});

test("vacation requests are created only for active accounts with effective approveVacation permission", async () => {
  const findMany = mock.method(db.user, "findMany", async (args: Prisma.UserFindManyArgs) => {
    assert.deepEqual(args.where, {
      active: true,
      mustChangePassword: false,
      OR: [{ employeeId: null }, { employee: { is: { isActive: true } } }],
    });
    return [
      {
        id: "admin",
        role: { code: "ADMIN", permissions: [{ allowed: true, permission: { key: "approveVacation" } }] },
        employee: null,
      },
      {
        id: "foreman-with-right",
        role: { code: "FOREMAN", permissions: [{ allowed: true, permission: { key: "approveVacation" } }] },
        employee: { permissions: [] },
      },
      {
        id: "foreman-with-override",
        role: { code: "FOREMAN", permissions: [{ allowed: true, permission: { key: "approveVacation" } }] },
        employee: { permissions: [{ allowed: false, permission: { key: "approveVacation" } }] },
      },
      {
        id: "foreman-without-right",
        role: { code: "FOREMAN", permissions: [] },
        employee: { permissions: [] },
      },
    ];
  });
  const create = mock.method(db.notification, "create", async (args: Prisma.NotificationCreateArgs) => args.data);
  await notifyUsersWithPermission(db, "approveVacation", (userId) =>
    vacationRequestNotification(userId, "Max Mustermann", {
      id: "vacation-1",
      employeeId: "employee-1",
      startDate: new Date("2026-10-12T00:00:00.000Z"),
      endDate: new Date("2026-10-16T00:00:00.000Z"),
    }));
  assert.deepEqual(create.mock.calls.map((call) => call.arguments[0]?.data.userId), [
    "admin", "foreman-with-right",
  ]);
  assert.deepEqual(create.mock.calls.map((call) => call.arguments[0]?.data.type), [
    "VACATION_REQUESTED", "VACATION_REQUESTED",
  ]);
  assert.deepEqual(create.mock.calls.map((call) => call.arguments[0]?.data.message), [
    "Neuer Urlaubsantrag von Max Mustermann für 12.10.2026 bis 16.10.2026.",
    "Neuer Urlaubsantrag von Max Mustermann für 12.10.2026 bis 16.10.2026.",
  ]);
  assert.equal(findMany.mock.callCount(), 1);
});
