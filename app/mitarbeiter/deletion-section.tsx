"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { DeletionImpactItem, EmployeeDeletionPreview } from "@/lib/employee-deletion";
import type { Employee } from "./data";
import { employeeRepository } from "./repository";

const secondaryButton = "min-h-11 shrink-0 rounded-lg border border-[#ccdbcf] px-3 text-sm font-semibold text-[#286044] transition hover:bg-[#f4f8f4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174c37] disabled:opacity-60";
const dangerOutlineButton = "min-h-11 shrink-0 rounded-lg border border-[#e8c3b8] px-3 text-sm font-semibold text-[#9f422d] transition hover:bg-[#fff6f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9f422d] disabled:opacity-60";
const inputClass = "h-11 w-full rounded-lg border border-[#dce4dc] bg-white px-3 text-sm text-[#27372d] outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10";

/** Bereich „Mitarbeiter entfernen“ im Bearbeiten-Dialog (nur Admins). */
export function EmployeeRemovalPanel({
  employee,
  isSelf,
  onDeactivated,
  onDeleted,
}: {
  employee: Employee;
  isSelf: boolean;
  onDeactivated: () => Promise<void> | void;
  onDeleted: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section aria-labelledby="removal-title">
      <div className="mb-4">
        <h3 id="removal-title" className="text-sm font-semibold">Mitarbeiter entfernen</h3>
        <p className="mt-1 text-xs text-[#77847b]">
          Deaktivieren sperrt die Anmeldung, alle Daten bleiben erhalten. Endgültiges Löschen ist nur für
          deaktivierte Testmitarbeiter ohne historische Bedeutung gedacht.
        </p>
      </div>
      <div className="rounded-lg border border-[#f0d9d1] bg-[#fffaf8] px-3.5 py-3 sm:px-4">
        {isSelf ? (
          <p className="text-xs text-[#77847b]">Dein eigenes Konto kannst du nicht deaktivieren oder löschen.</p>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className={dangerOutlineButton}>
            Deaktivieren oder löschen …
          </button>
        )}
      </div>
      {open && (
        <RemovalDialog
          employeeId={employee.id}
          onClose={() => setOpen(false)}
          onDeactivated={onDeactivated}
          onDeleted={(name) => {
            setOpen(false);
            onDeleted(name);
          }}
        />
      )}
    </section>
  );
}

function RemovalDialog({
  employeeId,
  onClose,
  onDeactivated,
  onDeleted,
}: {
  employeeId: string;
  onClose: () => void;
  onDeactivated: () => Promise<void> | void;
  onDeleted: (name: string) => void;
}) {
  const [preview, setPreview] = useState<EmployeeDeletionPreview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"deactivate" | "delete" | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [confirmHistory, setConfirmHistory] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    employeeRepository.deletionPreview(employeeId)
      .then((result) => { if (!cancelled) setPreview(result); })
      .catch((reason) => { if (!cancelled) setLoadError(reason instanceof Error ? reason.message : "Prüfung fehlgeschlagen."); });
    return () => { cancelled = true; };
  }, [employeeId]);

  useEffect(() => {
    // Capture-Listener: Escape schließt nur diesen Dialog, nicht den Bearbeiten-Dialog dahinter.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      if (!busy) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [busy, onClose]);

  async function deactivate() {
    setError("");
    setBusy("deactivate");
    try {
      setPreview(await employeeRepository.deactivate(employeeId));
      setNotice("Mitarbeiter und Benutzerkonto wurden deaktiviert. Alle Daten bleiben erhalten.");
      await onDeactivated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Deaktivieren fehlgeschlagen.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!preview) return;
    setError("");
    setBusy("delete");
    try {
      await employeeRepository.deletePermanently(employeeId, {
        confirmation,
        confirmHistory,
        fingerprint: preview.fingerprint,
      });
      onDeleted(preview.employee.name);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Löschen fehlgeschlagen.");
      // Bei geänderten Daten die Übersicht aktualisieren, damit der Admin sie erneut prüft.
      employeeRepository.deletionPreview(employeeId).then(setPreview).catch(() => undefined);
      setBusy(null);
    }
  }

  const canDeactivate = !!preview?.canDeactivate;
  const confirmationMatches = !!preview && confirmation.trim() === preview.employee.personnelNumber;
  const deleteReady = !!preview?.canDelete && confirmationMatches && (!preview.requiresHistoryConfirmation || confirmHistory);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-[#10251c]/60 p-3 backdrop-blur-[2px] sm:p-6"
      onMouseDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="removal-dialog-title"
        className="mx-auto my-2 flex max-h-[calc(100dvh-1.5rem)] max-w-xl flex-col overflow-hidden rounded-xl border border-[#e0e7e0] bg-white shadow-2xl sm:my-10 sm:max-h-[calc(100dvh-5rem)]"
      >
        <div className="shrink-0 border-b border-[#e8ede8] px-5 py-4 sm:px-6">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-[#9f422d]">MITARBEITER ENTFERNEN</p>
          <h2 id="removal-dialog-title" className="mt-1 text-lg font-semibold">
            {preview ? `${preview.employee.name} (${preview.employee.personnelNumber})` : "Verknüpfte Daten werden geprüft …"}
          </h2>
          {preview && (
            <p className="mt-1 text-xs text-[#77847b]">
              {preview.employee.isActive ? "Aktiv" : "Inaktiv"}
              {preview.employee.login ? ` · Konto ${preview.employee.login}` : " · kein Benutzerkonto"}
              {preview.employee.role ? ` · ${preview.employee.role}` : ""}
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {loadError && <Alert>{loadError}</Alert>}
          {!preview && !loadError && <p className="text-sm text-[#77847b]">Bitte warten …</p>}

          {notice && (
            <p role="status" className="rounded-lg border border-[#cfe3d4] bg-[#eef7f0] px-3 py-2.5 text-sm text-[#174c37]">
              {notice}
            </p>
          )}

          {preview && (
            <>
              {canDeactivate && (
                <div className="rounded-lg border border-[#e3e9e3] px-3.5 py-3">
                  <p className="text-sm font-medium">Empfohlen: deaktivieren</p>
                  <p className="mt-1 text-xs text-[#77847b]">
                    Anmeldung wird sofort gesperrt, laufende Sitzungen enden. Schichtplan-Historie, Urlaub und
                    Audit-Log bleiben vollständig erhalten. Jederzeit wieder aktivierbar.
                  </p>
                  <button type="button" disabled={!!busy} onClick={() => void deactivate()} className={`${secondaryButton} mt-3`}>
                    {busy === "deactivate" ? "Wird deaktiviert …" : "Mitarbeiter deaktivieren"}
                  </button>
                </div>
              )}

              {preview.blockers.length > 0 && (
                <div className="rounded-lg border border-[#f0dcae] bg-[#fff9ec] px-3.5 py-3 text-sm text-[#7a5413]">
                  <p className="font-semibold">Endgültiges Löschen ist derzeit nicht möglich</p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5">
                    {preview.blockers.map((blocker) => <li key={blocker.code}>{blocker.message}</li>)}
                  </ul>
                </div>
              )}

              <ImpactList
                title="Historische Daten – würden unwiderruflich gelöscht"
                tone="danger"
                items={preview.historical}
                empty="Keine Urlaubsanträge, Abwesenheiten, Einsätze, manuellen Schichten oder Tauschanfragen."
              />
              <ImpactList title="Wird zusammen mit dem Mitarbeiter entfernt" items={preview.removed} empty="Keine weiteren Stammdaten." />
              <ImpactList title="Bleibt erhalten" items={preview.retained} empty="Keine Audit-Log-Einträge vorhanden." />

              {preview.canDelete && (
                <div className="space-y-3 rounded-lg border border-[#f0c8bd] bg-[#fff6f2] px-3.5 py-3.5">
                  <p className="text-sm font-semibold text-[#9f422d]">Sicherheitsabfrage</p>
                  {preview.requiresHistoryConfirmation && (
                    <label className="flex cursor-pointer items-start gap-2.5 text-sm text-[#5b3328]">
                      <input
                        type="checkbox"
                        checked={confirmHistory}
                        onChange={(event) => setConfirmHistory(event.target.checked)}
                        className="mt-0.5 size-4 accent-[#9f422d]"
                      />
                      Ich bestätige, dass es sich um Testdaten handelt und die oben aufgeführten historischen
                      Daten endgültig gelöscht werden dürfen.
                    </label>
                  )}
                  <div>
                    <label htmlFor="delete-confirmation" className="block text-sm text-[#5b3328]">
                      Zur Bestätigung die Personalnummer <strong className="font-semibold">{preview.employee.personnelNumber}</strong> eingeben:
                    </label>
                    <input
                      id="delete-confirmation"
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      className={`${inputClass} mt-1.5`}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {error && <Alert>{error}</Alert>}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[#e8ede8] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            disabled={!!busy}
            onClick={onClose}
            className="min-h-11 rounded-lg border border-[#dce4dc] px-4 text-sm font-medium text-[#526056] transition hover:bg-[#f6f8f5]"
          >
            Schließen
          </button>
          {preview?.canDelete && (
            <button
              type="button"
              disabled={!deleteReady || !!busy}
              onClick={() => void remove()}
              className="min-h-11 rounded-lg bg-[#9f422d] px-4 text-sm font-semibold text-white transition hover:bg-[#873523] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "delete" ? "Wird gelöscht …" : "Endgültig löschen"}
            </button>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}

function ImpactList({
  title,
  items,
  empty,
  tone,
}: {
  title: string;
  items: DeletionImpactItem[];
  empty: string;
  tone?: "danger";
}) {
  return (
    <div>
      <h3 className={`text-xs font-semibold tracking-wide ${tone === "danger" && items.length ? "text-[#9f422d]" : "text-[#526056]"}`}>
        {title}
      </h3>
      {items.length ? (
        <ul className="mt-1.5 divide-y divide-[#edf0ec] rounded-lg border border-[#e3e9e3] text-sm">
          {items.map((item) => (
            <li key={item.key} className="flex items-start justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="block">{item.label}</span>
                {item.detail && <span className="block text-xs text-[#77847b]">{item.detail}</span>}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{item.count}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-xs text-[#77847b]">{empty}</p>
      )}
    </div>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="whitespace-pre-line rounded-lg border border-[#f0c8bd] bg-[#fff2ed] px-3 py-2.5 text-sm text-[#9f422d]">
      {children}
    </p>
  );
}
