import Link from "@/app/components/access-link";
import type { ReactNode } from "react";
import NotificationBell from "@/app/components/notification-bell";

export default function SwapShell({ children, review, canRequest, canReview }: {
  children: ReactNode; review: boolean; canRequest: boolean; canReview: boolean;
}) {
  return (
    <main className="min-h-screen bg-[#f4f6f2] text-[#1c2b23]">
      <header className="border-b border-[#dce4dc] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-3 rounded-lg">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#174c37] text-sm font-bold text-white">TP</span>
            <span className="hidden text-sm font-semibold sm:inline">TeamPlan</span>
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-1 sm:gap-2" aria-label="Hauptnavigation">
            <Link href="/schichtplan" className="rounded-lg px-2 py-2 text-sm font-medium text-[#41634f] hover:bg-[#edf3ee]">Schichtplan</Link>
            {review && canRequest && <Link href="/schichttausch" className="rounded-lg px-2 py-2 text-sm font-medium text-[#41634f] hover:bg-[#edf3ee]">Eigene Tausche</Link>}
            {!review && canReview && <Link href="/admin/schichttausch" className="rounded-lg px-2 py-2 text-sm font-medium text-[#41634f] hover:bg-[#edf3ee]">Tausche prüfen</Link>}
            <NotificationBell />
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 pb-14 pt-8 sm:px-8 sm:pt-12">{children}</div>
    </main>
  );
}
