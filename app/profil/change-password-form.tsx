"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { passwordRulesText } from "@/lib/password-policy";
import { PasswordField } from "@/app/components/password-field";
import { changePasswordAction, type PasswordChangeState } from "./actions";

const initialState: PasswordChangeState = { error: null, success: false };

export default function ChangePasswordForm() {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [state, formAction, isSubmitting] = useActionState(changePasswordAction, initialState);

  // Nur der Fallback ohne neue Sitzung landet hier; der Normalfall leitet serverseitig weiter.
  useEffect(() => {
    if (!state.success) return;
    form.current?.reset();
    const timer = window.setTimeout(() => router.replace("/login"), 1500);
    return () => window.clearTimeout(timer);
  }, [router, state]);

  return (
    <form ref={form} action={formAction} className="space-y-5">
      <PasswordField name="currentPassword" label="Aktuelles Passwort" autoComplete="current-password" />
      <PasswordField name="newPassword" label="Neues Passwort" autoComplete="new-password" hint={passwordRulesText} />
      <PasswordField name="confirmPassword" label="Neues Passwort wiederholen" autoComplete="new-password" />
      {state.error && (
        <p role="alert" className="whitespace-pre-line rounded-lg border border-[#f0c8bd] bg-[#fff2ed] px-3 py-2.5 text-sm text-[#9f422d]">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="rounded-lg border border-[#cfe3d4] bg-[#eef7f0] px-3 py-2.5 text-sm text-[#174c37]">
          Dein Passwort wurde erfolgreich geändert. Bitte melde dich mit deinem neuen Passwort erneut an.
        </p>
      )}
      <button
        type="submit"
        disabled={isSubmitting}
        className="min-h-12 w-full rounded-lg bg-[#174c37] px-4 text-sm font-semibold text-white transition hover:bg-[#103d2b] disabled:cursor-wait disabled:opacity-70 sm:w-auto"
      >
        {isSubmitting ? "Wird gespeichert …" : "Passwort ändern"}
      </button>
    </form>
  );
}
