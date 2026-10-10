"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { z } from "zod";
import { accessFingerprint, useUpdateNavigationAccess, type NavigationAccess } from "./access-provider";
import { authorizationChangedEvent } from "./authorization-events";

const sessionSchema = z.object({
  id: z.string(), employeeId: z.string().nullable(), role: z.string(),
  permissions: z.record(z.string(), z.boolean()),
});

export default function AccessRefresh({ initialAccess }: { initialAccess: NavigationAccess | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const update = useUpdateNavigationAccess();
  const [error, setError] = useState("");

  useEffect(() => {
    if (pathname === "/login" || pathname === "/passwort-aendern") return;
    const controller = new AbortController();
    let running = false;
    let latest = accessFingerprint(initialAccess);
    const refresh = async () => {
      if (running || controller.signal.aborted) return;
      running = true;
      try {
        const response = await fetch("/api/session", { cache: "no-store", signal: controller.signal });
        if (response.status === 401 || response.status === 403) {
          update(null);
          router.replace("/login");
          router.refresh();
          return;
        }
        if (!response.ok) throw new Error("Berechtigungen konnten nicht aktualisiert werden.");
        const session = sessionSchema.parse(await response.json());
        const access = { userId: session.id, employeeId: session.employeeId, role: session.role, permissions: session.permissions };
        const fingerprint = accessFingerprint(access);
        setError("");
        if (fingerprint !== latest) {
          latest = fingerprint;
          update(access);
          router.refresh();
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        console.error("Berechtigungsaktualisierung fehlgeschlagen", cause);
        setError("Berechtigungen konnten nicht aktualisiert werden. Bitte die Seite neu laden.");
      } finally {
        running = false;
      }
    };
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 5000);
    const onRefresh = () => { void refresh(); };
    const channel = new BroadcastChannel(authorizationChangedEvent);
    channel.addEventListener("message", onRefresh);
    window.addEventListener("focus", onRefresh);
    window.addEventListener("pageshow", onRefresh);
    window.addEventListener(authorizationChangedEvent, onRefresh);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      channel.close();
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener("pageshow", onRefresh);
      window.removeEventListener(authorizationChangedEvent, onRefresh);
    };
  }, [initialAccess, pathname, router, update]);

  return error ? <p role="alert" className="bg-[#fff0ec] p-4 text-[#a33e31]">{error}</p> : null;
}
