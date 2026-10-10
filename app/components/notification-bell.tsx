"use client";

import Link from "@/app/components/access-link";
import { useEffect, useRef } from "react";
import { useNotifications } from "./notifications-provider";
import NotificationList, { NotificationStatus } from "./notification-list";
import { logoutAction } from "@/app/profil/actions";

export default function NotificationBell() {
  const { notifications, unreadCount, available, error, reload } = useNotifications();
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && details.current && !details.current.contains(event.target)) {
        details.current.open = false;
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && details.current?.open) {
        details.current.open = false;
        details.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  if (!available) return null;

  return (
    <details ref={details} className="relative shrink-0 text-[#1c2b23] print:hidden"
      onToggle={(event) => { if (event.currentTarget.open) void reload(); }}>
      <summary aria-label={`Benachrichtigungen${unreadCount ? `, ${unreadCount} ungelesen` : ""}${error ? ", Ladefehler" : ""}`}
        className="relative flex size-11 cursor-pointer list-none items-center justify-center rounded-lg text-[#41634f] hover:bg-[#edf3ee] focus-visible:outline-3 focus-visible:outline-[#174c37] [&::-webkit-details-marker]:hidden">
        <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
        {(unreadCount > 0 || error) && (
          <span aria-hidden="true" className="absolute right-0 top-0 min-w-5 rounded-full bg-[#174c37] px-1 text-center text-[11px] font-semibold leading-5 text-white">
            {error ? "!" : unreadCount}
          </span>
        )}
      </summary>
      <section aria-label="Letzte Benachrichtigungen"
        className="fixed inset-x-4 top-20 z-50 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-xl border border-[#dce4dc] bg-white p-4 shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
        <h2 className="mb-3 text-base font-semibold">Benachrichtigungen</h2>
        <NotificationStatus />
        <NotificationList notifications={notifications.slice(0, 5)} compact />
        <Link href="/benachrichtigungen" onClick={() => { if (details.current) details.current.open = false; }}
          className="mt-3 flex min-h-11 items-center justify-center rounded-lg bg-[#174c37] px-3 text-sm font-semibold text-white hover:bg-[#103d2b]">
          Alle Benachrichtigungen
        </Link>
        <div className="mt-3 flex gap-2 border-t border-[#edf1ec] pt-3">
          <Link href="/profil" onClick={() => { if (details.current) details.current.open = false; }}
            className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-[#dce4dc] px-3 text-sm font-medium text-[#41634f] hover:bg-[#edf3ee]">
            Profil &amp; Passwort
          </Link>
          <form action={logoutAction} className="flex-1">
            <button type="submit"
              className="flex min-h-11 w-full items-center justify-center rounded-lg border border-[#dce4dc] px-3 text-sm font-medium text-[#41634f] hover:bg-[#edf3ee]">
              Abmelden
            </button>
          </form>
        </div>
      </section>
    </details>
  );
}
