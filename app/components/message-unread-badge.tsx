"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { apiJson } from "@/lib/api-client";

export default function MessageUnreadBadge() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const [error, setError] = useState(false);
  const version = useRef({ value: 0 });
  const reload = useCallback(async () => {
    const current = ++version.current.value;
    try {
      const data = await apiJson<{ unreadCount: number }>("/api/messages/unread");
      if (current === version.current.value) { setCount(data.unreadCount); setError(false); }
    } catch {
      if (current === version.current.value) setError(true);
    }
  }, []);
  useEffect(() => {
    const state = version.current;
    const refresh = () => { void reload(); };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("messages:refresh", refresh);
    return () => {
      ++state.value;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("messages:refresh", refresh);
    };
  }, [pathname, reload]);
  if (!count && !error) return null;
  return <span className="ml-2 inline-block rounded-full bg-[#174c37] px-2 py-0.5 text-xs font-semibold text-white"
    aria-label={error ? "Ungelesene Nachrichten konnten nicht geladen werden" : `${count} ungelesene Nachrichten`}
    title={error ? "Ladefehler: Seite oder Nachrichten erneut laden" : undefined}>{error ? "!" : count}</span>;
}
