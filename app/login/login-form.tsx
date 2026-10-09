"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export default function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, formAction, isSubmitting] = useActionState(loginAction, initialState);
  const error = state.error;

  return (
    <form action={formAction} className="space-y-5">
      {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-[#526056]">
          Personalnummer oder E-Mail
        </span>
        <input
          name="login"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          required
          className="h-12 w-full rounded-lg border border-[#dce4dc] bg-white px-3 text-sm outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-[#526056]">Passwort</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-12 w-full rounded-lg border border-[#dce4dc] bg-white px-3 text-sm outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10"
        />
      </label>
      {error && (
        <p role="alert" className="rounded-lg border border-[#f0c8bd] bg-[#fff2ed] px-3 py-2.5 text-sm text-[#9f422d]">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={isSubmitting}
        className="min-h-12 w-full rounded-lg bg-[#174c37] px-4 text-sm font-semibold text-white transition hover:bg-[#103d2b] disabled:cursor-wait disabled:opacity-70 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#174c37]"
      >
        {isSubmitting ? "Wird angemeldet …" : "Anmelden"}
      </button>
    </form>
  );
}

