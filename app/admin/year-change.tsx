"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import YearSelector from "../components/year-selector";
import { currentBerlinYear } from "@/lib/calendar";
import { MAX_VACATION_DAYS, type VacationYearRow } from "./vacation-years-data";

type RowDraft = {
  annualAllowance: number;
  transfer: boolean;
  carryOverDays: number;
};

const numberInputClass =
  "h-10 w-20 rounded-lg border border-[#dce4dc] bg-white px-2 text-sm tabular-nums outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10 disabled:bg-[#f4f6f2] disabled:text-[#9aa59d]";

function toDays(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : Math.min(MAX_VACATION_DAYS, Math.max(0, parsed));
}

function draftsFor(rows: VacationYearRow[]): Record<string, RowDraft> {
  return Object.fromEntries(
    rows.map((row) => [
      row.employeeId,
      {
        annualAllowance: row.next.annualAllowance,
        transfer: row.next.exists && row.next.carryOverDays > 0,
        carryOverDays: row.next.exists ? row.next.carryOverDays : Math.max(0, row.previous.remainingDays),
      },
    ]),
  );
}

export default function YearChange() {
  const [targetYear, setTargetYear] = useState(() => currentBerlinYear() + 1);
  const [rows, setRows] = useState<VacationYearRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [loadError, setLoadError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    void fetch(`/api/vacation-years?year=${targetYear}`, { cache: "no-store" })
      .then(async (response) => {
        if (!isCurrent) return;
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setLoadError(body?.error ?? "Daten konnten nicht geladen werden.");
          setRows([]);
          return;
        }
        const loaded = (await response.json()) as VacationYearRow[];
        setLoadError("");
        setRows(loaded);
        setDrafts(draftsFor(loaded));
        setConfirmed(false);
      })
      .catch(() => {
        if (isCurrent) setLoadError("Daten konnten nicht geladen werden.");
      });

    return () => {
      isCurrent = false;
    };
  }, [targetYear]);

  const previousYear = targetYear - 1;
  const transfers = rows.filter((row) => drafts[row.employeeId]?.transfer && drafts[row.employeeId].carryOverDays > 0);
  const existingCount = rows.filter((row) => row.next.exists).length;

  function updateDraft(employeeId: string, patch: Partial<RowDraft>) {
    setDrafts((current) => ({ ...current, [employeeId]: { ...current[employeeId], ...patch } }));
    if (patch.transfer !== undefined || patch.carryOverDays !== undefined) setConfirmed(false);
  }

  function setAllTransfers(transfer: boolean) {
    setDrafts((current) =>
      Object.fromEntries(Object.entries(current).map(([id, draft]) => [id, { ...draft, transfer }])),
    );
    setConfirmed(false);
  }

  async function save() {
    setMessage("");
    setError("");
    setIsSaving(true);
    try {
      const response = await fetch("/api/vacation-years", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: targetYear,
          confirmCarryOver: confirmed,
          entries: rows.map((row) => {
            const draft = drafts[row.employeeId];
            return {
              employeeId: row.employeeId,
              annualAllowance: draft.annualAllowance,
              carryOverDays: draft.transfer ? draft.carryOverDays : 0,
            };
          }),
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { saved?: number; rows?: VacationYearRow[]; error?: string }
        | null;
      if (!response.ok || !body?.rows) throw new Error(body?.error ?? "Speichern fehlgeschlagen.");
      setRows(body.rows);
      setDrafts(draftsFor(body.rows));
      setConfirmed(false);
      setMessage(`Urlaubsjahr ${targetYear}: ${body.saved ?? 0} Urlaubskonten gespeichert.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Speichern fehlgeschlagen.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f6f2] text-[#1c2b23]">
      <header className="border-b border-[#dce4dc] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3 rounded-lg focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#174c37]">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#174c37] text-sm font-bold text-white">MA</span>
            <span className="hidden text-sm font-semibold tracking-[0.02em] sm:inline">MITARBEITERPORTAL</span>
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-1 sm:gap-2" aria-label="Adminbereiche">
            <Link href="/admin" className="rounded-lg px-2 py-2 text-xs font-medium text-[#41634f] hover:bg-[#edf3ee] sm:px-3 sm:text-sm">Personalbesetzung</Link>
            <Link href="/admin/einstellungen" className="rounded-lg px-2 py-2 text-xs font-medium text-[#41634f] hover:bg-[#edf3ee] sm:px-3 sm:text-sm">Feiertage &amp; Kalender</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-14 pt-8 sm:px-8 sm:pt-12">
        <p className="text-xs font-semibold tracking-[0.15em] text-[#668071]">ADMIN · URLAUBSJAHR</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
          Jahreswechsel {previousYear} → {targetYear}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[#68766d]">
          Legt für alle aktiven Mitarbeiter ein Urlaubskonto für {targetYear} an. Schichtpläne werden nicht kopiert –
          die Rotation läuft automatisch weiter. Individuelle Schichten bleiben jahresbezogen und werden nicht übernommen.
        </p>

        <div className="mt-5">
          <YearSelector year={targetYear} onChange={setTargetYear} label="Neues Urlaubsjahr" />
        </div>

        {loadError && <p role="alert" className="mt-5 rounded-lg border border-[#efb8ad] bg-[#fff0ec] px-4 py-3 text-sm font-semibold text-[#a33e31]">{loadError}</p>}
        {message && <p role="status" className="mt-5 rounded-lg border border-[#b9dcc2] bg-[#eef7f0] px-4 py-3 text-sm font-medium text-[#256440]">{message}</p>}

        {!loadError && (
          <>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-[#77847b]">
                {rows.length} aktive Mitarbeiter · {existingCount} Konten für {targetYear} bereits vorhanden
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAllTransfers(true)} className="min-h-10 rounded-lg border border-[#dce4dc] bg-white px-3 text-xs font-medium text-[#41634f] hover:bg-[#edf3ee]">
                  Resturlaub bei allen auswählen
                </button>
                <button type="button" onClick={() => setAllTransfers(false)} className="min-h-10 rounded-lg border border-[#dce4dc] bg-white px-3 text-xs font-medium text-[#526056] hover:bg-[#f4f6f2]">
                  Keinen übernehmen
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {rows.map((row) => {
                const draft = drafts[row.employeeId];
                if (!draft) return null;
                return (
                  <article key={row.employeeId} className="rounded-xl border border-[#e0e7e0] bg-white p-4 lg:grid lg:grid-cols-[1.4fr_1.6fr_1.6fr] lg:items-center lg:gap-6">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold">{row.name}</h2>
                      <p className="mt-0.5 text-xs text-[#77847b]">
                        {row.personnelNumber} · {row.shiftModel} · {row.shiftGroup}
                      </p>
                      {row.next.exists && (
                        <span className="mt-1 inline-block rounded-md bg-[#e8eff7] px-2 py-0.5 text-[11px] font-medium text-[#365f80]">
                          Konto {targetYear} vorhanden
                        </span>
                      )}
                    </div>
                    <dl className="mt-3 grid grid-cols-4 gap-2 text-xs lg:mt-0">
                      <Metric label={`Anspruch ${previousYear}`} value={row.previous.annualAllowance} />
                      <Metric label="Übertrag" value={row.previous.carryOverDays} />
                      <Metric label="Genehmigt" value={row.previous.approvedDays} />
                      <Metric label="Rest" value={row.previous.remainingDays} emphasis />
                    </dl>
                    <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-[#edf0ec] pt-3 lg:mt-0 lg:border-t-0 lg:pt-0">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-[#526056]">Jahresurlaub {targetYear}</span>
                        <input
                          type="number"
                          min={0}
                          max={MAX_VACATION_DAYS}
                          value={draft.annualAllowance}
                          onChange={(event) => updateDraft(row.employeeId, { annualAllowance: toDays(event.target.value) })}
                          className={numberInputClass}
                        />
                      </label>
                      <label className="flex min-h-10 items-center gap-2 text-xs font-medium text-[#526056]">
                        <input
                          type="checkbox"
                          checked={draft.transfer}
                          onChange={(event) => updateDraft(row.employeeId, { transfer: event.target.checked })}
                          className="size-4 accent-[#174c37]"
                        />
                        Resturlaub übernehmen
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-[#526056]">Tage</span>
                        <input
                          type="number"
                          min={0}
                          max={MAX_VACATION_DAYS}
                          disabled={!draft.transfer}
                          value={draft.transfer ? draft.carryOverDays : 0}
                          onChange={(event) => updateDraft(row.employeeId, { carryOverDays: toDays(event.target.value) })}
                          className={numberInputClass}
                        />
                      </label>
                    </div>
                  </article>
                );
              })}
            </div>

            {rows.length > 0 && (
              <div className="sticky bottom-0 mt-6 rounded-xl border border-[#e0e7e0] bg-white p-4 shadow-[0_-6px_20px_rgba(28,43,35,0.06)] sm:flex sm:items-center sm:justify-between sm:gap-4">
                {transfers.length > 0 ? (
                  <label className="flex items-start gap-2 text-sm text-[#34443a]">
                    <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 size-4 accent-[#174c37]" />
                    Ich bestätige die Übernahme von Resturlaub aus {previousYear} für {transfers.length} Mitarbeiter.
                  </label>
                ) : (
                  <p className="text-sm text-[#68766d]">Es wird kein Resturlaub übertragen.</p>
                )}
                {error && <p role="alert" className="mt-2 text-sm font-semibold text-[#a33e31] sm:mt-0">{error}</p>}
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={isSaving || (transfers.length > 0 && !confirmed)}
                  className="mt-3 min-h-11 w-full rounded-lg bg-[#174c37] px-4 text-sm font-semibold text-white hover:bg-[#103d2b] disabled:cursor-not-allowed disabled:bg-[#a8b9ad] sm:mt-0 sm:w-auto"
                >
                  {isSaving ? "Speichern …" : `Urlaubsjahr ${targetYear} anlegen`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value, emphasis = false }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div className={`rounded-lg px-2 py-1.5 ${emphasis ? "bg-[#e7f3e9] text-[#174c37]" : "bg-[#f8faf7]"}`}>
      <dt className="truncate text-[10px] text-[#718077]">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
