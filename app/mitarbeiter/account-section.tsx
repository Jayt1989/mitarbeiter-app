"use client";

import { useState } from "react";
import { generateStartPassword, passwordPolicyErrors, passwordRulesText } from "@/lib/password-policy";
import type { Employee } from "./data";
import { employeeRepository } from "./repository";

const inputClass = "h-11 w-full rounded-lg border border-[#dce4dc] bg-white px-3 text-sm text-[#27372d] outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10";
const secondaryButton = "min-h-11 shrink-0 rounded-lg border border-[#ccdbcf] px-3 text-sm font-semibold text-[#286044] transition hover:bg-[#f4f8f4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174c37] disabled:opacity-60";

/** Passworteingabe mit Generator. `generated` signalisiert, dass der Admin das Passwort nicht selbst getippt hat. */
export function TemporaryPasswordInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string, generated: boolean) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-[#526056]">{label}</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            type={visible ? "text" : "password"}
            value={value}
            onChange={(event) => onChange(event.target.value, false)}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={`${inputClass} pr-24 font-mono`}
          />
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md px-2.5 py-1.5 text-xs font-medium text-[#526056] hover:bg-[#f0f4ef]"
          >
            {visible ? "Verbergen" : "Anzeigen"}
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(generateStartPassword(), true);
            setVisible(true);
          }}
          className={secondaryButton}
        >
          Generieren
        </button>
      </div>
      <p className="mt-1.5 text-xs text-[#77847b]">{passwordRulesText}</p>
    </div>
  );
}

/** Zeigt ein generiertes Passwort genau einmal an; es wird nirgends gespeichert. */
export function OneTimePasswordNotice({
  title,
  login,
  password,
  onClose,
}: {
  title: string;
  login: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="rounded-xl border border-[#cfe3d4] bg-[#eef7f0] p-4 text-sm text-[#174c37]">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-[#41634f]">
        Anmeldung mit Personalnummer <span className="font-semibold">{login}</span>. Das Startpasswort wird nur jetzt
        angezeigt und muss beim ersten Login geändert werden.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 break-all rounded-lg border border-[#cfe3d4] bg-white px-3 py-2.5 font-mono text-sm text-[#1c2b23]">
          {password}
        </code>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(password).then(() => setCopied(true), () => setCopied(false));
            }}
            className={secondaryButton}
          >
            {copied ? "Kopiert" : "Kopieren"}
          </button>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Ausblenden
          </button>
        </div>
      </div>
    </div>
  );
}

export function AccountBadge({ account }: { account: Employee["account"] }) {
  if (!account) {
    return <span className="inline-flex rounded-md bg-[#f1f3f0] px-2 py-1 text-xs font-medium text-[#68766d]">Kein Konto</span>;
  }
  if (!account.active) {
    return <span className="inline-flex rounded-md bg-[#f1f3f0] px-2 py-1 text-xs font-medium text-[#68766d]">Konto inaktiv</span>;
  }
  if (account.mustChangePassword) {
    return <span className="inline-flex rounded-md bg-[#fff0df] px-2 py-1 text-xs font-medium text-[#94501e]">Startpasswort</span>;
  }
  return <span className="inline-flex rounded-md bg-[#e5f2e9] px-2 py-1 text-xs font-medium text-[#22633a]">Konto aktiv</span>;
}

/** Kontostatus und Passwort-Zurücksetzen im Bearbeiten-Dialog. */
export function AccountPanel({
  employee,
  canManage,
  isSelf,
  onChanged,
}: {
  employee: Employee;
  canManage: boolean;
  isSelf: boolean;
  onChanged: () => Promise<void>;
}) {
  const account = employee.account ?? null;
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [generated, setGenerated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ message: string; password: string | null } | null>(null);

  async function submit() {
    setError("");
    const problems = passwordPolicyErrors(password);
    if (problems.length) {
      setError(problems.join("\n"));
      return;
    }
    setBusy(true);
    try {
      const { created } = await employeeRepository.resetPassword(employee.id, password);
      setResult({
        message: created
          ? "Benutzerkonto wurde angelegt. Beim ersten Login muss ein eigenes Passwort gesetzt werden."
          : "Passwort wurde zurückgesetzt. Beim nächsten Login muss ein eigenes Passwort gesetzt werden.",
        password: generated ? password : null,
      });
      setPassword("");
      setGenerated(false);
      setOpen(false);
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Das Passwort konnte nicht zurückgesetzt werden.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="account-title">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h3 id="account-title" className="text-sm font-semibold">Benutzerkonto</h3>
          <p className="mt-1 text-xs text-[#77847b]">
            Das Konto folgt dem Mitarbeiterstatus aktiv/inaktiv. Passwörter werden nie angezeigt.
          </p>
        </div>
        <AccountBadge account={account} />
      </div>
      <div className="space-y-3 rounded-lg border border-[#e3e9e3] px-3.5 py-3 sm:px-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-[#77847b]">Benutzerkonto</dt>
            <dd className="mt-0.5 font-medium">{account ? "vorhanden" : "nicht vorhanden"}</dd>
          </div>
          {account && (
            <>
              <div>
                <dt className="text-xs text-[#77847b]">Anmeldename</dt>
                <dd className="mt-0.5 break-all font-medium">{account.login}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#77847b]">Status</dt>
                <dd className="mt-0.5 font-medium">
                  {account.active ? "aktiv" : "inaktiv"}
                  {account.mustChangePassword && " · Passwortänderung ausstehend"}
                </dd>
              </div>
            </>
          )}
        </dl>

        {result && (
          result.password ? (
            <OneTimePasswordNotice
              title={result.message}
              login={account?.login ?? employee.personnelNumber}
              password={result.password}
              onClose={() => setResult(null)}
            />
          ) : (
            <p role="status" className="rounded-lg border border-[#cfe3d4] bg-[#eef7f0] px-3 py-2.5 text-sm text-[#174c37]">
              {result.message}
            </p>
          )
        )}

        {canManage && !isSelf && !open && (
          <button type="button" onClick={() => { setOpen(true); setResult(null); }} className={secondaryButton}>
            {account ? "Passwort zurücksetzen" : "Benutzerkonto anlegen"}
          </button>
        )}
        {canManage && isSelf && (
          <p className="text-xs text-[#77847b]">Dein eigenes Passwort änderst du im Profil.</p>
        )}

        {open && (
          <div className="space-y-3 border-t border-[#edf0ec] pt-3">
            <TemporaryPasswordInput
              id="reset-password"
              label={account ? "Neues temporäres Passwort" : "Startpasswort"}
              value={password}
              onChange={(value, isGenerated) => { setPassword(value); setGenerated(isGenerated); }}
            />
            {error && (
              <p role="alert" className="whitespace-pre-line rounded-lg border border-[#f0c8bd] bg-[#fff2ed] px-3 py-2.5 text-sm text-[#9f422d]">
                {error}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => { setOpen(false); setPassword(""); setError(""); }}
                className="min-h-11 rounded-lg border border-[#dce4dc] px-4 text-sm font-medium text-[#526056] transition hover:bg-[#f6f8f5]"
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void submit()}
                className="min-h-11 rounded-lg bg-[#174c37] px-4 text-sm font-semibold text-white transition hover:bg-[#103d2b] disabled:cursor-wait disabled:opacity-70"
              >
                {busy ? "Wird gespeichert …" : account ? "Passwort zurücksetzen" : "Konto anlegen"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
