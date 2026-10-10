import type { Metadata } from "next";
import Link from "@/app/components/access-link";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/authorization";
import NotificationBell from "@/app/components/notification-bell";
import NotificationsPageContent from "./notifications-page-content";

export const metadata: Metadata = { title: "Benachrichtigungen | TeamPlan" };

export default async function NotificationsPage() {
  const context = await getAuthorizationContext();
  if (!context) redirect("/login?callbackUrl=%2Fbenachrichtigungen");
  return (
    <main className="min-h-screen bg-[#f4f6f2] text-[#1c2b23]">
      <header className="border-b border-[#dce4dc] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3 rounded-lg">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#174c37] text-sm font-bold text-white">TP</span>
            <span className="hidden text-sm font-semibold sm:inline">TeamPlan</span>
          </Link>
          <nav aria-label="Hauptnavigation" className="flex items-center gap-2">
            <Link href="/dashboard" className="rounded-lg px-3 py-2 text-sm font-medium text-[#41634f] hover:bg-[#edf3ee]">Dashboard</Link>
            <NotificationBell />
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 pb-14 pt-8 sm:px-8 sm:pt-12">
        <NotificationsPageContent />
      </div>
    </main>
  );
}
