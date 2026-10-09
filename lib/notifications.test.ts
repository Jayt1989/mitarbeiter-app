import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import type { Prisma, Notification } from "@prisma/client";
import { prisma } from "./prisma";
import { createNotification, loadOwnNotifications, markOwnNotificationsRead } from "./notifications";
import { qualificationNotification } from "./notification-messages";

const db = {
  notification: {
    ...prisma.notification,
    findMany: prisma.notification.findMany,
    count: prisma.notification.count,
    updateMany: prisma.notification.updateMany,
    create: prisma.notification.create,
  },
};

afterEach(() => mock.restoreAll());

const notification: Notification = {
  id: "notification-1", employeeId: "employee-1", title: "Test", message: "Nachricht",
  type: "QUALIFICATION_ADDED", read: false, link: "/dashboard",
  createdAt: new Date("2026-10-02T11:00:00Z"), readAt: null,
};

test("listing and unread count always filter by the authenticated employee", async () => {
  const list = mock.method(db.notification, "findMany", async (args: Prisma.NotificationFindManyArgs) => {
    assert.deepEqual(args.where, { employeeId: notification.employeeId });
    assert.deepEqual(args.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
    return [notification];
  });
  const count = mock.method(db.notification, "count", async (args: Prisma.NotificationCountArgs) => {
    assert.deepEqual(args.where, { employeeId: notification.employeeId, read: false });
    return 1;
  });
  const feed = await loadOwnNotifications(notification.employeeId, undefined, db);
  assert.equal(list.mock.callCount(), 1);
  assert.equal(count.mock.callCount(), 1);
  assert.equal(feed.unreadCount, 1);
  assert.equal(feed.notifications[0].createdAt, "2026-10-02T11:00:00.000Z");
  assert.equal(feed.notifications[0].readAt, null);
});

test("preview requests exactly the five latest own records but counts all unread records", async () => {
  mock.method(db.notification, "findMany", async (args: Prisma.NotificationFindManyArgs) => {
    assert.equal(args.take, 5);
    assert.deepEqual(args.where, { employeeId: "employee-1" });
    return [];
  });
  mock.method(db.notification, "count", async () => 12);
  assert.equal((await loadOwnNotifications("employee-1", 5, db)).unreadCount, 12);
});

test("users without employee association never query other employees, including admins", async () => {
  const list = mock.method(db.notification, "findMany", async () => {
    throw new Error("Must not query notifications");
  });
  const count = mock.method(db.notification, "count", async () => {
    throw new Error("Must not query notifications");
  });
  assert.deepEqual(await loadOwnNotifications(null, undefined, db), { notifications: [], unreadCount: 0 });
  assert.equal(list.mock.callCount(), 0);
  assert.equal(count.mock.callCount(), 0);
});

test("single read updates require both ownership and unread status", async () => {
  mock.method(db.notification, "updateMany", async (args: Prisma.NotificationUpdateManyArgs) => {
    assert.deepEqual(args.where, { employeeId: "employee-1", read: false, id: "foreign-id" });
    assert.equal(args.data.read, true);
    assert.ok(args.data.readAt instanceof Date);
    return { count: 0 };
  });
  assert.equal((await markOwnNotificationsRead("employee-1", "foreign-id", db)).count, 0);
});

test("mark all read is scoped to the employee and preserves prior read timestamps", async () => {
  mock.method(db.notification, "updateMany", async (args: Prisma.NotificationUpdateManyArgs) => {
    assert.deepEqual(args.where, { employeeId: "employee-1", read: false });
    assert.equal(args.data.read, true);
    assert.ok(args.data.readAt instanceof Date);
    return { count: 3 };
  });
  assert.equal((await markOwnNotificationsRead("employee-1", undefined, db)).count, 3);
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
  await assert.rejects(markOwnNotificationsRead("employee-1", undefined, db), /Read failure/);
  mock.method(db.notification, "findMany", async () => { throw new Error("List failure"); });
  mock.method(db.notification, "count", async () => 0);
  await assert.rejects(loadOwnNotifications("employee-1", undefined, db), /List failure/);
});
