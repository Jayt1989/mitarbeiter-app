"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { passwordRulesText } from "@/lib/password-policy";
import { PasswordField } from "@/app/components/password-field";
import { changeInitialPasswordAction, type PasswordChangeState } from "@/app/profil/actions";

const initialState: PasswordChangeState = { error: null, success: false };

export function PasswordChangedNotice() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setTimeout(() => router.replace("/dashboard"), 1500);
    return () => window.clearTimeout(timer);
  }, [router]);
  return (
    <p role="status" className="rounded-lg border border-[#cfe3d4] bg-[#eef7f0] px-3 py-3 text-sm text-[#174c37]">
      Dein Passwort wurde erfolgreich geändert. Du wirst zum Dashboard weitergeleitet …
    </p>
  );
}

export default function InitialPasswordForm() {
  const router = useRouter();
  const [state, formAction, isSubmitting] = useActionState(changeInitialPasswordAction, initialState);

  // Fallback, falls keine neue Sitzung ausgestellt werden konnte (Normalfall: serverseitiger Redirect).
  useEffect(() => {
    if (!state.success) return;
    const timer = window.setTimeout(() => router.replace("/login"), 1500);
    return () => window.clearTimeout(timer);
  }, [router, state]);

  if (state.success) {
    return (
      <p role="status" className="rounded-lg border border-[#cfe3d4] bg-[#eef7f0] px-3 py-3 text-sm text-[#174c37]">
        Dein Passwort wurde erfolgreich geändert. Bitte melde dich mit deinem neuen Passwort an.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <PasswordField name="newPassword" label="Neues Passwort" autoComplete="new-password" hint={passwordRulesText} />
      <PasswordField name="confirmPassword" label="Passwort wiederholen" autoComplete="new-password" />
      {state.error && (
        <p role="alert" className="whitespace-pre-line rounded-lg border border-[#f0c8bd] bg-[#fff2ed] px-3 py-2.5 text-sm text-[#9f422d]">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={isSubmitting}
        className="min-h-12 w-full rounded-lg bg-[#174c37] px-4 text-sm font-semibold text-white transition hover:bg-[#103d2b] disabled:cursor-wait disabled:opacity-70"
      >
        {isSubmitting ? "Wird gespeichert …" : "Passwort speichern"}
      </button>
    </form>
  );
}
