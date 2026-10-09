"use client";

import Link from "next/link";
import { useNotifications, type NotificationFeed } from "./notifications-provider";

export function NotificationStatus() {
  const { error, loading, reload } = useNotifications();
  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-[#efb8ad] bg-[#fff0ec] p-3 text-sm text-[#a33e31]">
        <p>{error}</p>
        <button type="button" onClick={() => void reload()} className="mt-2 min-h-11 underline">
          Erneut laden
        </button>
      </div>
    );
  }
  if (loading) return <p role="status" className="p-3 text-sm text-[#68766d]">Benachrichtigungen werden geladen …</p>;
  return null;
}

export default function NotificationList({
  notifications, compact = false,
}: { notifications: NotificationFeed["notifications"]; compact?: boolean }) {
  const { pending, markRead, loading, error } = useNotifications();
  if (!notifications.length) {
    return !loading && !error
      ? <p className="p-4 text-sm text-[#68766d]">Noch keine Benachrichtigungen.</p>
      : null;
  }
  return (
    <ul className={compact ? "space-y-2" : "space-y-3"}>
      {notifications.map((notification) => (
        <li key={notification.id} className={`rounded-xl border p-4 ${notification.read ? "border-[#e0e7e0] bg-white" : "border-[#b9dcc2] bg-[#eef7f0]"}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#1c2b23]">{notification.title}</h2>
            {!notification.read && <span className="rounded-full bg-[#174c37] px-2 py-0.5 text-xs font-medium text-white">Ungelesen</span>}
          </div>
          <p className="mt-2 break-words text-sm leading-6 text-[#526056]">{notification.message}</p>
          <time dateTime={notification.createdAt} className="mt-2 block text-xs text-[#77847b]">
            {new Intl.DateTimeFormat("de-DE", {
              dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin",
            }).format(new Date(notification.createdAt))}
          </time>
          <div className="mt-2 flex flex-wrap items-center gap-x-4">
            {notification.link && (
              <Link href={notification.link} className="flex min-h-11 items-center text-sm font-medium text-[#174c37] underline">
                Öffnen
              </Link>
            )}
            {!notification.read && (
              <button type="button" disabled={pending !== null} onClick={() => void markRead(notification.id)}
                className="min-h-11 text-sm font-medium text-[#174c37] underline disabled:opacity-50">
                {pending === notification.id ? "Wird markiert …" : "Als gelesen markieren"}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
