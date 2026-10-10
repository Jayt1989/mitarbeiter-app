"use client";

import Link from "@/app/components/access-link";
import { useNotifications } from "./notifications-provider";
import NotificationList, { NotificationStatus } from "./notification-list";

export default function NotificationSummary() {
  const { notifications, unreadCount } = useNotifications();
  return (
    <section className="mt-6 rounded-xl border border-[#e0e7e0] bg-white p-4 sm:p-5" aria-labelledby="benachrichtigungen-titel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="benachrichtigungen-titel" className="text-sm font-semibold">Benachrichtigungen · {unreadCount} ungelesen</h2>
        <Link href="/benachrichtigungen" className="flex min-h-11 items-center text-sm font-medium text-[#174c37] underline">Alle anzeigen</Link>
      </div>
      <NotificationStatus />
      <NotificationList notifications={notifications.slice(0, 3)} compact />
    </section>
  );
}
