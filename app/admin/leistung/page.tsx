import type { Metadata } from "next";
import Link from "@/app/components/access-link";
import type { ReactNode } from "react";
import NotificationBell from "@/app/components/notification-bell";
import AchievementBadge from "@/app/leistung/achievement-badge";
import { isValidDateKey } from "@/app/admin/assignments-data";
import { requirePageAccess } from "@/lib/page-access";
import { berlinTodayKey, dateKeyToUtc } from "@/lib/calendar";
import { listPerformance, listPerformanceWorkstations } from "@/lib/performance";
import { getExportAccess } from "@/lib/export/access";
import {
  MAX_REPORT_DAYS,
  canRecordPerformance,
  canManagePerformanceTargets,
  formatDuration,
  parsePerformanceFilter,
  performanceAreas,
  summarizePerformance,
  summarizeRows,
  type PerformanceSummary,
} from "@/lib/performance-rules";

export const metadata: Metadata = { title: "Leistungsauswertung | TeamPlan" };

const shortDate = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("de-DE", { timeStyle: "short", timeZone: "Europe/Berlin" });
const numberFormat = new Intl.NumberFormat("de-DE");
const rateFormat = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const formatDate = (dateKey: string) => shortDate.format(dateKeyToUtc(dateKey));

const fieldClass =
  "mt-1 block min-h-11 w-full rounded-lg border border-[#cfdad1] bg-white px-3 text-sm outline-none focus:border-[#174c37] focus:ring-3 focus:ring-[#174c37]/15";

export default async function PerformanceReportPage({ searchParams }: {
  searchParams: Promise<{ von?: string; bis?: string; bereich?: string; schicht?: string }>;
}) {
  const context = await requirePageAccess("/admin/leistung");

  const filter = parsePerformanceFilter(await searchParams, berlinTodayKey(), isValidDateKey);
  const [rows, workstations] = await Promise.all([listPerformance(filter), listPerformanceWorkstations()]);
  const exportParams = new URLSearchParams({
    type: "performance", von: filter.from, bis: filter.to,
    ...(filter.area ? { bereich: filter.area } : {}),
    ...(filter.shift ? { schicht: filter.shift } : {}),
  });
  const total = summarizeRows(rows);
  const byWorkstation = summarizePerformance(rows, (row) => ({
    key: `${row.area}:${row.workstation}`, label: row.workstation, detail: row.areaLabel,
  }));
  const byEmployee = summarizePerformance(rows, (row) => ({
    key: row.employeeId, label: row.employeeName, detail: row.personnelNumber,
  }));
  const period = filter.from === filter.to ? formatDate(filter.from) : `${formatDate(filter.from)} – ${formatDate(filter.to)}`;

  return (
    <main className="min-h-screen bg-[#f4f6f2] text-[#1c2b23]">
      <header className="border-b border-[#dce4dc] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-3 rounded-lg">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#174c37] text-sm font-bold text-white">TP</span>
            <span className="hidden text-sm font-semibold sm:inline">TeamPlan</span>
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-1 sm:gap-2" aria-label="Hauptnavigation">
            {canManagePerformanceTargets(context) && (
              <Link href="/admin/leistung/arbeitsplaetze" className="rounded-lg px-2 py-2 text-sm font-medium text-[#41634f] hover:bg-[#edf3ee]">Sollwerte bearbeiten</Link>
            )}
            {context.role === "ADMIN" && context.permissions.openAdmin === true && (
              <Link staffing href="/admin" className="rounded-lg px-2 py-2 text-sm font-medium text-[#41634f] hover:bg-[#edf3ee]">Personalbesetzung</Link>
            )}
            {canRecordPerformance(context) && (
              <Link href="/leistung" className="rounded-lg px-2 py-2 text-sm font-medium text-[#41634f] hover:bg-[#edf3ee]">Leistung erfassen</Link>
            )}
            <NotificationBell />
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pb-14 pt-8 sm:px-8 sm:pt-12">
        <p className="text-xs font-semibold tracking-[0.15em] text-[#668071]">AUSWERTUNG</p>
        <h1 className="mt-2 text-2xl font-semibold sm:text-4xl">Leistungen</h1>

        <form method="get" className="mt-6 grid grid-cols-2 gap-3 rounded-xl border border-[#e0e7e0] bg-white p-4 sm:grid-cols-5 sm:items-end">
          <label className="text-xs font-semibold text-[#2f4a3b]">
            Von
            <input type="date" name="von" defaultValue={filter.from} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold text-[#2f4a3b]">
            Bis
            <input type="date" name="bis" defaultValue={filter.to} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold text-[#2f4a3b]">
            Bereich
            <select name="bereich" defaultValue={filter.area ?? ""} className={fieldClass}>
              <option value="">Alle Bereiche</option>
              {performanceAreas.map((area) => <option key={area.id} value={area.id}>{area.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-[#2f4a3b]">
            Schicht
            <select name="schicht" defaultValue={filter.shift ?? ""} className={fieldClass}>
              <option value="">Alle Schichten</option>
              <option value="Früh">Frühschicht</option>
              <option value="Spät">Spätschicht</option>
              <option value="Nacht">Nachtschicht</option>
            </select>
          </label>
          <button type="submit" className="col-span-2 min-h-11 rounded-lg bg-[#174c37] px-4 text-sm font-semibold text-white hover:bg-[#103d2b] sm:col-span-1">
            Anzeigen
          </button>
        </form>
        {getExportAccess(context).team && (
          <a href={`/api/export/excel?${exportParams}`} className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-[#cfdad1] bg-white px-4 text-sm font-semibold text-[#41634f] hover:bg-[#edf3ee]">
            Leistungen als Excel exportieren
          </a>
        )}
        {filter.limited && (
          <p role="status" className="mt-3 rounded-lg border border-[#ecd9a8] bg-[#fff8e6] px-3 py-2 text-sm text-[#7a5a12]">
            Der Zeitraum wurde auf {MAX_REPORT_DAYS} Tage begrenzt.
          </p>
        )}

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Kpi label="Zeitraum" value={period} className="col-span-2 sm:col-span-1" />
          <Kpi label="Einträge" value={numberFormat.format(rows.length)} />
          <Kpi label="Stück gesamt" value={numberFormat.format(total.quantity)}
            hint={total.expectedQuantity > 0 ? `Soll ${numberFormat.format(total.expectedQuantity)}` : undefined} />
          <Kpi label="Stück pro Stunde" value={rateFormat.format(total.perHour)}
            hint={`${total.targetPerHour !== null ? `Soll ${rateFormat.format(total.targetPerHour)} · ` : ""}${formatDuration(total.durationMinutes)}`} />
          <Kpi label="Leistungsgrad" value={rows.length === 0 ? "–" : <AchievementBadge percent={total.achievement} />} />
        </dl>

        <details className="mt-4 rounded-xl border border-[#e0e7e0] bg-white px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-[#2f4a3b]">Soll-Werte je Arbeitsplatz</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {performanceAreas.map((area) => (
              <div key={area.id}>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#5e7366]">{area.label}</p>
                <ul className="mt-1 space-y-0.5">
                  {area.workstations.map((workstation) => {
                    const target = workstations.find((entry) => entry.code === workstation)?.targetPerHour ?? null;
                    return (
                      <li key={workstation} className="flex justify-between gap-3 tabular-nums">
                        <span className="font-semibold">{workstation}</span>
                        <span>{target === null ? "Nicht hinterlegt" : `${numberFormat.format(target)} Stück/Std.`}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-[#5e7366]">
            Grün ab 100 %, gelb ab 85 %, darunter rot. Jeder Eintrag speichert das zum Erfassungszeitpunkt gültige Soll.
            Summen des Leistungsgrads berücksichtigen nur Einträge mit Sollwert.
          </p>
        </details>

        {rows.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-[#d7dfd8] bg-white px-4 py-8 text-center text-sm text-[#5e7366]">
            Für diesen Filter wurden keine Leistungen erfasst.
          </p>
        ) : (
          <>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <SummaryTable title="Nach Arbeitsplatz" rows={byWorkstation} />
              <SummaryTable title="Nach Mitarbeiter" rows={byEmployee} />
            </div>

            <section aria-labelledby="eintraege-titel" className="mt-6 rounded-xl border border-[#e0e7e0] bg-white p-4 sm:p-5">
              <h2 id="eintraege-titel" className="text-lg font-semibold">Einzelne Einträge</h2>
              {rows.length >= 2000 && (
                <p className="mt-1 text-sm text-[#7a5a12]">Es werden nur die neuesten 2.000 Einträge angezeigt. Bitte den Zeitraum eingrenzen.</p>
              )}
              <ul className="mt-3 divide-y divide-[#e7ede7] md:hidden">
                {rows.map((row) => (
                  <li key={row.id} className="py-3 text-sm">
                    <p className="font-semibold">{row.employeeName} <span className="font-normal text-[#5e7366]">· {row.personnelNumber}</span></p>
                    <p className="text-[#41634f]">{formatDate(row.workDate)} · {row.shift} · {row.areaLabel} {row.workstation}</p>
                    <p>{numberFormat.format(row.quantity)} Stück · {formatDuration(row.durationMinutes)}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2">
                      <span>Ist {rateFormat.format(row.perHour)} Stück/Std. · Soll {row.targetPerHour === null ? "nicht hinterlegt" : `${numberFormat.format(row.targetPerHour)} Stück/Std.`}</span>
                      <span>Leistungsgrad <AchievementBadge percent={row.achievement} /></span>
                    </p>
                    {row.note && <p className="mt-1 break-words text-[#5e7366]">{row.note}</p>}
                  </li>
                ))}
              </ul>
              <div className="mt-3 hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[#e0e7e0] text-xs uppercase tracking-wide text-[#5e7366]">
                    <tr>
                      <th className="py-2 pr-3 font-semibold">Datum</th>
                      <th className="py-2 pr-3 font-semibold">Mitarbeiter</th>
                      <th className="py-2 pr-3 font-semibold">Schicht</th>
                      <th className="py-2 pr-3 font-semibold">Bereich</th>
                      <th className="py-2 pr-3 font-semibold">Platz</th>
                      <th className="py-2 pr-3 text-right font-semibold">Menge</th>
                      <th className="py-2 pr-3 text-right font-semibold">Zeit</th>
                      <th className="py-2 pr-3 text-right font-semibold">Ist Stück/Std.</th>
                      <th className="py-2 pr-3 text-right font-semibold">Soll Stück/Std.</th>
                      <th className="py-2 pr-3 text-right font-semibold">Leistungsgrad %</th>
                      <th className="py-2 font-semibold">Bemerkung</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eef2ee]">
                    {rows.map((row) => (
                      <tr key={row.id} className="align-top">
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {formatDate(row.workDate)}
                          <span className="block text-xs text-[#87928b]">{timeFormat.format(new Date(row.createdAt))} Uhr</span>
                        </td>
                        <td className="py-2 pr-3">{row.employeeName}<span className="block text-xs text-[#5e7366]">{row.personnelNumber}</span></td>
                        <td className="py-2 pr-3">{row.shift}</td>
                        <td className="py-2 pr-3">{row.areaLabel}</td>
                        <td className="py-2 pr-3 font-semibold">{row.workstation}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{numberFormat.format(row.quantity)}</td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap">{formatDuration(row.durationMinutes)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{rateFormat.format(row.perHour)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{row.targetPerHour !== null ? numberFormat.format(row.targetPerHour) : "Nicht hinterlegt"}</td>
                        <td className="py-2 pr-3 text-right"><AchievementBadge percent={row.achievement} /></td>
                        <td className="max-w-64 py-2 break-words text-[#5e7366]">{row.note ?? "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Kpi({ label, value, hint, className = "" }: { label: string; value: ReactNode; hint?: string; className?: string }) {
  return (
    <div className={`min-w-0 rounded-xl border border-[#e0e7e0] bg-white px-4 py-3 ${className}`}>
      <dt className="text-xs font-medium text-[#5e7366]">{label}</dt>
      <dd className="mt-1 text-lg font-semibold sm:text-xl">{value}</dd>
      {hint && <dd className="text-xs text-[#5e7366]">{hint}</dd>}
    </div>
  );
}

function SummaryTable({ title, rows }: { title: string; rows: PerformanceSummary[] }) {
  return (
    <section className="rounded-xl border border-[#e0e7e0] bg-white p-4 sm:p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="-mx-1 overflow-x-auto px-1">
      <table className="mt-3 w-full text-left text-sm">
        <thead className="border-b border-[#e0e7e0] text-xs uppercase tracking-wide text-[#5e7366]">
          <tr>
            <th className="py-2 pr-2 font-semibold">Name</th>
            <th className="py-2 pr-2 text-right font-semibold">Stück</th>
            <th className="py-2 pr-2 text-right font-semibold">Zeit</th>
            <th className="py-2 pr-2 text-right font-semibold">Ist/Soll pro Std.</th>
            <th className="py-2 text-right font-semibold">Leistungsgrad %</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#eef2ee]">
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="py-2 pr-2">
                <span className="font-semibold">{row.label}</span>
                {row.detail && <span className="block text-xs text-[#5e7366]">{row.detail} · {row.entries} Eintr.</span>}
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">{numberFormat.format(row.quantity)}</td>
              <td className="py-2 pr-2 text-right whitespace-nowrap">{formatDuration(row.durationMinutes)}</td>
              <td className="py-2 pr-2 text-right tabular-nums">
                {rateFormat.format(row.perHour)}
                {row.targetPerHour !== null && <span className="block text-xs text-[#5e7366]">Soll {rateFormat.format(row.targetPerHour)}</span>}
              </td>
              <td className="py-2 text-right"><AchievementBadge percent={row.achievement} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
