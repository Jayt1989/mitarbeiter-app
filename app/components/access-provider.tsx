"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { AccessContext } from "@/lib/access-policy";

export type NavigationAccess = AccessContext & { userId: string; employeeId: string | null };

export function accessFingerprint(access: NavigationAccess | null) {
  return JSON.stringify(access && [
    access.userId, access.employeeId, access.role,
    Object.entries(access.permissions).sort(([a], [b]) => a.localeCompare(b)),
  ]);
}

const Access = createContext<NavigationAccess | null>(null);
const UpdateAccess = createContext<(access: NavigationAccess | null) => void>(() => {});

export function useNavigationAccess() {
  return useContext(Access);
}

export function useUpdateNavigationAccess() {
  return useContext(UpdateAccess);
}

export default function AccessProvider({ initialAccess, children }: {
  initialAccess: NavigationAccess | null; children: ReactNode;
}) {
  const [pending, setPending] = useState<{ source: string; access: NavigationAccess | null } | null>(null);
  const source = accessFingerprint(initialAccess);
  const current = pending?.source === source ? pending.access : initialAccess;
  const updating = accessFingerprint(current) !== source;
  const update = useCallback((access: NavigationAccess | null) => setPending({ source, access }), [source]);

  return <Access.Provider value={current}>
    <UpdateAccess.Provider value={update}>
      {updating ? <p role="status" className="p-6">Berechtigungen werden aktualisiert …</p> : children}
    </UpdateAccess.Provider>
  </Access.Provider>;
}
