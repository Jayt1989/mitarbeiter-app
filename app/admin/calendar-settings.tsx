"use client";

import { apiJson } from "@/lib/api-client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import NotificationBell from "@/app/components/notification-bell";
import YearSelector from "../components/year-selector";
import { calendarRepository } from "./calendar-repository";
import {
  companyDayTypeLabel,
  companyDayTypes,
  currentBerlinYear,
  defaultCalendarData,
  type CalendarData,
  type CompanyDay,
  type CompanyDayType,
} from "@/lib/calendar";
import { germanStateName, germanStates, getHolidays, type GermanState } from "@/lib/holidays";
import { companyDayBadgeStyle, holidayBadgeStyle } from "../schichtplan/shift-styles";

type DayForm = Omit<CompanyDay, "id"> & { id: string | null };

const inputClass =
  "h-11 w-full rounded-lg border border-[#dce4dc] bg-white px-3 text-sm outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10 disabled:bg-[#f4f6f2] disabled:text-[#77847b]";

function formatDay(dateKey: string) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T00:00:00.000Z`));
}

export default function CalendarSettings() {
  const [calendar, setCalendar] = useState<CalendarData>(defaultCalendarData);
  const [selectedState, setSelectedState] = useState<GermanState>(defaultCalendarData.state);
  const [year, setYear] = useState(() => currentBerlinYear());
  const [canEdit, setCanEdit] = useState(false);
  const [form, setForm] = useState<DayForm | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let isCurrent = true;

    void Promise.all([
      calendarRepository.load(),
      apiJson<{ permissions: Record<string, boolean> }>("/api/session"),
    ]).then(([storedCalendar, session]) => {
      if (!isCurrent) return;
      setCalendar(storedCalendar);
      setSelectedState(storedCalendar.state);
      setCanEdit(session?.permissions?.editCalendar === true);
    }).catch((cause: unknown) => {
      if (isCurrent) setError(cause instanceof Error ? cause.message : "Kalendereinstellungen konnten nicht geladen werden.");
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  const holidays = getHolidays(year, calendar.state);
  const companyDays = calendar.companyDays
    .filter((entry) => entry.date.startsWith(`${year}-`))
    .sort((left, right) => left.date.localeCompare(right.date));

  async function saveState() {
    setMessage("");
    setError("");
    try {
      const updated = await calendarRepository.saveState(selectedState);
      setCalendar(updated);
      setMessage(`Bundesland auf ${germanStateName(updated.state)} gesetzt.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Speichern fehlgeschlagen.");
    }
  }

  async function submitDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    setError("");
    try {
      const { id, ...input } = form;
      const saved = id
        ? await calendarRepository.updateCompanyDay({ ...input, id })
        : await calendarRepository.createCompanyDay(input);
      setCalendar((current) => ({
        ...current,
        companyDays: [...current.companyDays.filter((entry) => entry.id !== saved.id), saved],
      }));
      setMessage(`Sondertag „${saved.name}“ gespeichert.`);
      setForm(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Speichern fehlgeschlagen.");
    }
  }

  async function toggleActive(day: CompanyDay) {
    setError("");
    try {
      const saved = await calendarRepository.updateCompanyDay({ ...day, active: !day.active });
      setCalendar((current) => ({
        ...current,
        companyDays: current.companyDays.map((entry) => (entry.id === saved.id ? saved : entry)),
      }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Speichern fehlgeschlagen.");
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
            <Link href="/admin/jahreswechsel" className="rounded-lg px-2 py-2 text-xs font-medium text-[#41634f] hover:bg-[#edf3ee] sm:px-3 sm:text-sm">Jahreswechsel</Link>
            <NotificationBell />
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 pb-14 pt-8 sm:px-8 sm:pt-12">
        <p className="text-xs font-semibold tracking-[0.15em] text-[#668071]">ADMIN · EINSTELLUNGEN</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Feiertage &amp; Kalender</h1>
        <p className="mt-2 text-sm text-[#68766d]">
          Gesetzliche Feiertage werden automatisch berechnet und nur markiert – geplante Schichten bleiben bestehen.
        </p>

        {message && <p role="status" className="mt-5 rounded-lg border border-[#b9dcc2] bg-[#eef7f0] px-4 py-3 text-sm font-medium text-[#256440]">{message}</p>}
        {error && <p role="alert" className="mt-5 rounded-lg border border-[#efb8ad] bg-[#fff0ec] px-4 py-3 text-sm font-semibold text-[#a33e31]">{error}</p>}

        <section className="mt-6 rounded-xl border border-[#e0e7e0] bg-white p-4 sm:p-6" aria-labelledby="region-titel">
          <h2 id="region-titel" className="text-base font-semibold">Region</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[#526056]">Land</span>
              <input value="Deutschland" disabled className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[#526056]">Bundesland</span>
              <select
                value={selectedState}
                disabled={!canEdit}
                onChange={(event) => setSelectedState(event.target.value as GermanState)}
                className={inputClass}
              >
                {germanStates.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
              </select>
            </label>
            {canEdit && (
              <button
                type="button"
                onClick={() => void saveState()}
                disabled={selectedState === calendar.state}
                className="min-h-11 rounded-lg bg-[#174c37] px-4 text-sm font-semibold text-white hover:bg-[#103d2b] disabled:cursor-not-allowed disabled:bg-[#a8b9ad]"
              >
                Speichern
              </button>
            )}
          </div>
          {!canEdit && (
            <p className="mt-3 text-xs text-[#77847b]">Zum Ändern wird die Berechtigung „Feiertage &amp; Kalender bearbeiten“ benötigt.</p>
          )}
        </section>

        <div className="mt-6">
          <YearSelector year={year} onChange={setYear} />
        </div>

        <section className="mt-6 rounded-xl border border-[#e0e7e0] bg-white p-4 sm:p-6" aria-labelledby="feiertage-titel">
          <h2 id="feiertage-titel" className="text-base font-semibold">
            Gesetzliche Feiertage {year} · {germanStateName(calendar.state)}
          </h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {holidays.map((holiday) => (
              <li key={holiday.date} className="flex items-center justify-between gap-3 rounded-lg bg-[#f8faf7] px-3 py-2 text-sm">
                <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${holidayBadgeStyle}`}>{holiday.name}</span>
                <span className="tabular-nums text-[#526056]">{formatDay(holiday.date)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6 rounded-xl border border-[#e0e7e0] bg-white p-4 sm:p-6" aria-labelledby="sondertage-titel">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="sondertage-titel" className="text-base font-semibold">Betriebliche Sondertage {year}</h2>
              <p className="mt-1 text-xs text-[#77847b]">
                Sondertage wie Betriebsruhe werden nur im Kalender markiert und nicht als Urlaub gebucht.
              </p>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => setForm({ id: null, name: "", date: `${year}-01-01`, type: "CLOSURE", note: "", active: true })}
                className="min-h-11 rounded-lg bg-[#174c37] px-4 text-sm font-semibold text-white hover:bg-[#103d2b]"
              >
                Sondertag hinzufügen
              </button>
            )}
          </div>

          {form && (
            <form onSubmit={(event) => void submitDay(event)} className="mt-4 grid gap-3 rounded-lg border border-[#dce4dc] bg-[#f8faf7] p-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#526056]">Name</span>
                <input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#526056]">Datum</span>
                <input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#526056]">Typ</span>
                <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as CompanyDayType })} className={inputClass}>
                  {companyDayTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 self-end pb-3 text-sm">
                <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} className="size-4 accent-[#174c37]" />
                Aktiv
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-[#526056]">Bemerkung (optional)</span>
                <textarea rows={2} maxLength={500} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className="w-full rounded-lg border border-[#dce4dc] bg-white px-3 py-2 text-sm outline-none focus:border-[#71937d]" />
              </label>
              <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setForm(null)} className="min-h-11 rounded-lg border border-[#dce4dc] bg-white px-4 text-sm font-medium text-[#526056]">Abbrechen</button>
                <button type="submit" className="min-h-11 rounded-lg bg-[#174c37] px-4 text-sm font-semibold text-white">Speichern</button>
              </div>
            </form>
          )}

          {companyDays.length === 0 ? (
            <p className="mt-4 text-sm text-[#77847b]">Keine Sondertage für {year} angelegt.</p>
          ) : (
            <ul className="mt-4 divide-y divide-[#edf0ec]">
              {companyDays.map((day) => (
                <li key={day.id} className={`flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between ${day.active ? "" : "opacity-60"}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {day.name}
                      <span className={`ml-2 rounded-md px-2 py-0.5 text-[11px] font-semibold ${companyDayBadgeStyle}`}>{companyDayTypeLabel(day.type)}</span>
                      {!day.active && <span className="ml-2 text-xs font-medium text-[#77847b]">inaktiv</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-[#68766d]">{formatDay(day.date)}{day.note ? ` · ${day.note}` : ""}</p>
                  </div>
                  {canEdit && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setForm({ ...day })} className="min-h-9 rounded-lg border border-[#dce4dc] px-3 text-xs font-medium text-[#41634f] hover:bg-[#edf3ee]">Ändern</button>
                      <button type="button" onClick={() => void toggleActive(day)} className="min-h-9 rounded-lg border border-[#dce4dc] px-3 text-xs font-medium text-[#526056] hover:bg-[#f4f6f2]">
                        {day.active ? "Deaktivieren" : "Aktivieren"}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
