import type { Metadata } from "next";
import Link from "@/app/components/access-link";
import NotificationBell from "@/app/components/notification-bell";
import { requirePageAccess } from "@/lib/page-access";
import { loadRecordingOverview } from "@/lib/performance";
import {
  canViewPerformance,
  performanceVisibility,
  formatDuration,
  summarizeRows,
} from "@/lib/performance-rules";
import { dateKeyToUtc } from "@/lib/calendar";
import PerformanceForm from "./performance-form";
import DeleteEntryButton from "./delete-entry-button";
import AchievementBadge from "./achievement-badge";

export const metadata: Metadata = { title: "Leistung erfassen | TeamPlan" };

const shiftLabels: Record<string, string> = { Früh: "Frühschicht", Spät: "Spätschicht", Nacht: "Nachtschicht" };
const longDate = new Intl.DateTimeFormat("de-DE", {
  weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
});
const timeFormat = new Intl.DateTimeFormat("de-DE", { timeStyle: "short", timeZone: "Europe/Berlin" });
const numberFormat = new Intl.NumberFormat("de-DE");
const rateFormat = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default async function PerformancePage() {
  const context = await requirePageAccess("/leistung");
  const showDetails = canViewPerformance(context);
  const overview = await loadRecordingOverview(context);
  const { resolved, entries } = overview;
  const total = summarizeRows(entries);

  return (
    <main className="min-h-screen bg-[#f4f6f2] text-[#1c2b23]">
      <header className="border-b border-[#dce4dc] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-3 rounded-lg">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#174c37] text-sm font-bold text-white">TP</span>
            <span className="hidden text-sm font-semibold sm:inline">TeamPlan</span>
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-1 sm:gap-2" aria-label="Hauptnavigation">
            {performanceVisibility(context).performanceTargets && (
              <Link href="/admin/leistung/arbeitsplaetze" className="rounded-lg px-2 py-2 text-sm font-medium text-[#41634f] hover:bg-[#edf3ee]">Sollwerte</Link>
            )}
            <Link href="/dashboard" className="rounded-lg px-2 py-2 text-sm font-medium text-[#41634f] hover:bg-[#edf3ee]">Dashboard</Link>
            {canViewPerformance(context) && (
              <Link href="/admin/leistung" className="rounded-lg px-2 py-2 text-sm font-medium text-[#41634f] hover:bg-[#edf3ee]">Auswertung</Link>
            )}
            <NotificationBell />
          </nav>
        </div>
      </header>

      <div className={`mx-auto grid gap-6 px-4 pb-14 pt-8 sm:px-8 sm:pt-12 ${showDetails ? "max-w-5xl lg:grid-cols-[1.1fr_1fr]" : "max-w-2xl"}`}>
        <section aria-labelledby="leistung-titel"
          className="rounded-xl border border-[#e0e7e0] bg-white p-5 shadow-[0_8px_30px_rgba(28,43,35,0.05)] sm:p-6">
          <p className="text-xs font-semibold tracking-[0.15em] text-[#668071]">LEISTUNG</p>
          <h1 id="leistung-titel" className="mt-2 text-2xl font-semibold sm:text-3xl">Leistung erfassen</h1>

          <dl className="mt-5 grid grid-cols-1 gap-3 rounded-lg bg-[#f4f6f2] p-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium text-[#5e7366]">Datum</dt>
              <dd className="mt-0.5 font-semibold">{longDate.format(dateKeyToUtc(resolved.dateKey))}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#5e7366]">Mitarbeiter</dt>
              <dd className="mt-0.5 font-semibold">{overview.employeeName}</dd>
              <dd className="text-xs text-[#5e7366]">{overview.personnelNumber}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#5e7366]">Schicht</dt>
              <dd className="mt-0.5 font-semibold">{resolved.ok ? shiftLabels[resolved.shift] : "–"}</dd>
            </div>
          </dl>

          <div className="mt-6">
            {resolved.ok ? (
              <PerformanceForm workstations={showDetails ? overview.workstations : undefined} />
            ) : (
              <p role="status" className="rounded-lg border border-[#ecd9a8] bg-[#fff8e6] px-4 py-3 text-sm text-[#7a5a12]">
                {resolved.reason}
              </p>
            )}
          </div>
        </section>

        {showDetails && <section aria-labelledby="erfasst-titel"
          className="h-fit rounded-xl border border-[#e0e7e0] bg-white p-5 shadow-[0_8px_30px_rgba(28,43,35,0.05)] sm:p-6">
          <h2 id="erfasst-titel" className="text-lg font-semibold">In dieser Schicht erfasst</h2>
          {entries.length === 0 ? (
            <p className="mt-3 text-sm text-[#5e7366]">Noch keine Leistung erfasst.</p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-[#f4f6f2] px-3 py-2.5 text-sm text-[#5e7366]">
                <span>Ist <strong className="text-[#1c2b23]">{numberFormat.format(total.quantity)}</strong>
                  {total.expectedQuantity > 0 && <> / Soll <strong className="text-[#1c2b23]">{numberFormat.format(total.expectedQuantity)}</strong></>} Stück</span>
                <span>Arbeitszeit <strong className="text-[#1c2b23]">{formatDuration(total.durationMinutes)}</strong></span>
                <span className="flex items-center gap-1.5">Leistungsgrad <AchievementBadge percent={total.achievement} /></span>
              </div>
              {entries.some((entry) => entry.targetPerHour === null) && (
                <p className="mt-2 text-xs text-[#5e7366]">Der zusammengefasste Leistungsgrad berücksichtigt nur Einträge mit Sollwert.</p>
              )}
              <ul className="mt-4 divide-y divide-[#e7ede7]">
                {entries.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {entry.workstation} <span className="font-normal text-[#5e7366]">· {entry.areaLabel}</span>
                      </p>
                      <p className="text-sm">
                        {numberFormat.format(entry.quantity)} Stück · {formatDuration(entry.durationMinutes)}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-[#5e7366]">
                        <span>
                          Ist {rateFormat.format(entry.perHour)} Stück/Std. · Soll {entry.targetPerHour === null
                            ? "nicht hinterlegt" : `${numberFormat.format(entry.targetPerHour)} Stück/Std.`}
                        </span>
                        <span>Leistungsgrad <AchievementBadge percent={entry.achievement} /></span>
                      </p>
                      {entry.note && <p className="mt-1 break-words text-sm text-[#5e7366]">{entry.note}</p>}
                      <p className="mt-1 text-xs text-[#87928b]">erfasst um {timeFormat.format(new Date(entry.createdAt))} Uhr</p>
                    </div>
                    <DeleteEntryButton entryId={entry.id} label={`${entry.workstation}, Menge ${entry.quantity}`} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>}
      </div>
    </main>
  );
}
