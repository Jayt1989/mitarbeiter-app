"use client";

import { useNotifications } from "@/app/components/notifications-provider";
import NotificationList, { NotificationStatus } from "@/app/components/notification-list";

export default function NotificationsPageContent() {
  const { notifications, unreadCount, loading, pending, markRead, reload } = useNotifications();
  return (
    <>
      <p className="text-xs font-semibold tracking-[0.15em] text-[#668071]">DEIN POSTEINGANG</p>
      <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Benachrichtigungen</h1>
      <p className="mt-2 text-sm text-[#68766d]">Hier siehst du ausschließlich deine eigenen Benachrichtigungen.</p>
      <div className="my-6 flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-[#526056]">{loading ? "Wird geladen …" : `${unreadCount} ungelesen`}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void reload()} className="min-h-11 rounded-lg border border-[#dce4dc] bg-white px-3 text-sm font-medium text-[#41634f]">
            Aktualisieren
          </button>
          <button type="button" disabled={loading || !unreadCount || pending !== null} onClick={() => void markRead()}
            className="min-h-11 rounded-lg bg-[#174c37] px-3 text-sm font-semibold text-white hover:bg-[#103d2b] disabled:opacity-50">
            {pending === "all" ? "Wird markiert …" : "Alle als gelesen markieren"}
          </button>
        </div>
      </div>
      <NotificationStatus />
      <NotificationList notifications={notifications} />
    </>
  );
}
