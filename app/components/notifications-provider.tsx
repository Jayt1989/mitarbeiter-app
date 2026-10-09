"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { loadOwnNotifications } from "@/lib/notifications";

export type NotificationFeed = Awaited<ReturnType<typeof loadOwnNotifications>>;
type NotificationsContextValue = NotificationFeed & {
  available: boolean;
  loading: boolean;
  error: string;
  pending: string | null;
  reload: () => Promise<void>;
  markRead: (id?: string) => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [feed, setFeed] = useState<NotificationFeed>({ notifications: [], unreadCount: 0 });
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const requestVersion = useRef({ version: 0 });

  const reload = useCallback(() => {
    const version = ++requestVersion.current.version;
    return fetch("/api/notifications", { cache: "no-store" }).then(async (response) => {
      if (version !== requestVersion.current.version) return;
      if (response.status === 401) {
        setAvailable(false);
        setFeed({ notifications: [], unreadCount: 0 });
        setError("");
        return;
      }
      if (!response.ok) throw new Error("Benachrichtigungen konnten nicht geladen werden.");
      const data = (await response.json()) as NotificationFeed;
      if (version !== requestVersion.current.version) return;
      setFeed(data);
      setAvailable(true);
      setError("");
    }).catch((cause: unknown) => {
      if (version === requestVersion.current.version) {
        setError(cause instanceof Error ? cause.message : "Benachrichtigungen konnten nicht geladen werden.");
      }
    }).finally(() => {
      if (version === requestVersion.current.version) setLoading(false);
    });
  }, []);

  useEffect(() => {
    const requests = requestVersion.current;
    void reload();
    const refresh = () => { void reload(); };
    window.addEventListener("notifications:refresh", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      ++requests.version;
      window.removeEventListener("notifications:refresh", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [pathname, reload]);

  async function markRead(id?: string) {
    setPending(id ?? "all");
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { action: "read", id } : { action: "readAll" }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Benachrichtigungen konnten nicht als gelesen markiert werden.");
      }
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Benachrichtigungen konnten nicht als gelesen markiert werden.");
    } finally {
      setPending(null);
    }
  }

  return (
    <NotificationsContext.Provider value={{ ...feed, available, loading, error, pending, reload, markRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error("NotificationsProvider fehlt.");
  return value;
}
