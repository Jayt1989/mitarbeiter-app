"use client";

import { useState } from "react";

export function PasswordField({
  name,
  label,
  autoComplete,
  hint,
}: {
  name: string;
  label: string;
  autoComplete: "new-password" | "current-password";
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-[#526056]">{label}</span>
      <span className="relative block">
        <input
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          className="h-12 w-full rounded-lg border border-[#dce4dc] bg-white px-3 pr-24 text-sm outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10"
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md px-2.5 py-1.5 text-xs font-medium text-[#526056] hover:bg-[#f0f4ef]"
        >
          {visible ? "Verbergen" : "Anzeigen"}
        </button>
      </span>
      {hint && <span className="mt-1.5 block text-xs text-[#6f7c73]">{hint}</span>}
    </label>
  );
}

export function LogoutButton({ className }: { className?: string }) {
  return (
    <button
      type="submit"
      className={className ?? "min-h-11 rounded-lg border border-[#dce4dc] bg-white px-4 text-sm font-medium text-[#526056] transition hover:bg-[#f4f6f2]"}
    >
      Abmelden
    </button>
  );
}
