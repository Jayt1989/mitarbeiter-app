import Link from "@/app/components/access-link";
import type { ReactNode } from "react";
import NotificationBell from "@/app/components/notification-bell";

export default function MessageShell({ children }: { children: ReactNode }) {
  return <main className="min-h-screen bg-[#f4f6f2] text-[#1c2b23]">
    <header className="border-b border-[#dce4dc] bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#174c37] text-sm font-bold text-white">TP</span>
          <span className="hidden text-sm font-semibold sm:inline">TeamPlan</span>
        </Link>
        <nav aria-label="Hauptnavigation" className="flex flex-wrap items-center justify-end gap-2">
          <Link href="/dashboard" className="rounded-lg px-3 py-2 text-sm text-[#41634f] hover:bg-[#edf3ee]">Dashboard</Link>
          <Link href="/nachrichten" className="rounded-lg px-3 py-2 text-sm font-semibold text-[#174c37] hover:bg-[#edf3ee]">Nachrichten</Link>
          <NotificationBell />
        </nav>
      </div>
    </header>
    <div className="mx-auto max-w-6xl px-4 pb-14 pt-6 sm:px-8 sm:pt-10">{children}</div>
  </main>;
}
