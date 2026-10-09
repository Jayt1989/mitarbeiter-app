"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import NotificationBell from "@/app/components/notification-bell";
import type { Employee } from "../mitarbeiter/data";
import { sampleEmployees } from "../mitarbeiter/data";
import { employeeRepository } from "../mitarbeiter/repository";
import { getVacationWorkdays, countVacationDaysInYear, requestsOverlap, type VacationRequest, type VacationStatus } from "./vacation-data";
import { vacationRepository } from "./vacation-repository";
import { getDemoEmployee } from "./session";
import YearSelector from "../components/year-selector";
import { calendarRepository } from "../admin/calendar-repository";
import type { VacationAccountDto } from "../admin/vacation-years-data";
import {
  berlinTodayKey,
  currentBerlinYear,
  defaultCalendarData,
  type CalendarData,
} from "@/lib/calendar";

const statusStyles: Record<VacationStatus, string> = {
  Beantragt: "bg-[#fff3d9] text-[#886719]",
  Genehmigt: "bg-[#e7f3e9] text-[#256440]",
  Abgelehnt: "bg-[#fde9e7] text-[#a33e31]",
  Storniert: "bg-[#eef0ed] text-[#66726a]",
};

function intersectsYear(request: VacationRequest, year: number) {
  return request.endDate >= `${year}-01-01` && request.startDate <= `${year}-12-31`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

export default function VacationDashboard() {
  const [employees, setEmployees] = useState<Employee[]>(sampleEmployees);
  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [year, setYear] = useState(() => currentBerlinYear());
  const [calendar, setCalendar] = useState<CalendarData>(defaultCalendarData);
  const [accounts, setAccounts] = useState<VacationAccountDto[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [comment, setComment] = useState("");
  const [formError, setFormError] = useState("");
  const [formNotice, setFormNotice] = useState("");

  useEffect(() => {
    let isCurrent = true;

    void Promise.all([
      employeeRepository.loadAll(),
      vacationRepository.loadAll(),
      calendarRepository.load(),
    ]).then(([storedEmployees, storedRequests, storedCalendar]) => {
      if (!isCurrent) return;
      if (storedEmployees) setEmployees(storedEmployees);
      setRequests(storedRequests);
      setCalendar(storedCalendar);
      if (new URLSearchParams(window.location.search).get("antrag") === "neu") setIsFormOpen(true);
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;

    void fetch(`/api/vacation-accounts?year=${year}`, { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<VacationAccountDto[]>) : []))
      .catch(() => [] as VacationAccountDto[])
      .then((storedAccounts) => {
        if (isCurrent) setAccounts(storedAccounts);
      });

    return () => {
      isCurrent = false;
    };
  }, [year]);

  const employee = getDemoEmployee(employees);
  const canRequest = employee?.permissions.requestVacation ?? false;
  const canSeeOwn = employee?.permissions.ownVacation ?? false;
  const canSeeOthers = employee?.permissions.otherVacations ?? false;
  const ownRequests = employee
    ? requests.filter((request) => request.employeeId === employee.id)
    : [];
  const visibleRequests = requests.filter(
    (request) =>
      intersectsYear(request, year) &&
      ((request.employeeId === employee?.id && canSeeOwn) ||
        (request.employeeId !== employee?.id && canSeeOthers)),
  );
  const yearRequests = ownRequests.filter((request) => intersectsYear(request, year));
  const account = employee ? accounts.find((entry) => entry.employeeId === employee.id) : undefined;
  const annualAllowance = account?.annualAllowance ?? employee?.annualLeaveAllowance ?? 0;
  const carryOverDays = account?.carryOverDays ?? employee?.carryOverLeaveDays ?? 0;
  const todayKey = berlinTodayKey();
  const approvedDays = employee
    ? yearRequests
        .filter((request) => request.status === "Genehmigt")
        .reduce((sum, request) => sum + countVacationDaysInYear(employee, request, year, calendar.state), 0)
    : 0;
  const takenDays = employee
    ? yearRequests
        .filter((request) => request.status === "Genehmigt" && request.startDate <= todayKey)
        .reduce(
          (sum, request) =>
            sum +
            countVacationDaysInYear(
              employee,
              { ...request, endDate: request.endDate < todayKey ? request.endDate : todayKey },
              year,
              calendar.state,
            ),
          0,
        )
    : 0;
  const requestedDays = employee
    ? yearRequests
        .filter((request) => request.status === "Beantragt")
        .reduce((sum, request) => sum + countVacationDaysInYear(employee, request, year, calendar.state), 0)
    : 0;
  const totalDays = annualAllowance + carryOverDays;
  const remainingDays = totalDays - approvedDays - requestedDays;
  const rejectedRequests = yearRequests.filter(
    (request) => request.status === "Abgelehnt",
  );
  const calculatedDays = employee && startDate && endDate
    ? getVacationWorkdays(employee, startDate, endDate, calendar.state)
    : [];

  function openForm() {
    setStartDate("");
    setEndDate("");
    setComment("");
    setFormError("");
    setFormNotice("");
    setIsFormOpen(true);
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employee || !canRequest) return;

    if (!startDate || !endDate || startDate > endDate) {
      setFormError("Bitte wähle einen gültigen Zeitraum aus.");
      return;
    }

    const workdays = getVacationWorkdays(employee, startDate, endDate, calendar.state);
    if (workdays.length === 0) {
      setFormError("Der gewählte Zeitraum enthält keine Urlaubstage (freie Tage und Feiertage zählen nicht).");
      return;
    }

    const overlapsExisting = requests.some(
      (request) =>
        request.employeeId === employee.id &&
        (request.status === "Beantragt" || request.status === "Genehmigt") &&
        requestsOverlap(startDate, endDate, request.startDate, request.endDate),
    );
    if (overlapsExisting) {
      setFormError("Der Zeitraum überschneidet sich mit einem offenen oder genehmigten Antrag.");
      return;
    }

    try {
      const created = await vacationRepository.create({ startDate, endDate, comment: comment.trim() });
      setRequests((current) => [created, ...current]);
      setIsFormOpen(false);
      setFormNotice("Dein Urlaubsantrag wurde eingereicht.");
    } catch {
      setFormError("Der Antrag konnte nicht gespeichert werden.");
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
          <nav className="flex items-center gap-2" aria-label="Hauptnavigation">
            <Link href="/" className="rounded-lg px-3 py-2 text-sm font-medium text-[#41634f] transition hover:bg-[#edf3ee] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]">Dashboard</Link>
            <NotificationBell />
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pb-14 pt-8 sm:px-8 sm:pt-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.15em] text-[#668071]">URLAUBSPLANUNG</p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Mein Urlaub</h1>
            {employee && (
              <p className="mt-2 text-sm text-[#68766d]">
                {employee.firstName} {employee.lastName} · {year}
              </p>
            )}
          </div>
          {canRequest && (
            <button
              type="button"
              onClick={openForm}
              className="min-h-11 self-start rounded-lg bg-[#174c37] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#103d2b] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#174c37] sm:self-auto"
            >
              Urlaub beantragen
            </button>
          )}
        </div>

        {!employee ? (
          <div className="mt-8 rounded-xl border border-dashed border-[#cfd9d0] bg-white px-5 py-12 text-center">
            <p className="text-sm font-semibold">Kein aktives Mitarbeiterkonto verfügbar.</p>
          </div>
        ) : (
          <>
            {canSeeOwn ? (
              <>
                <div className="mt-6">
                  <YearSelector year={year} onChange={setYear} label="Urlaubsjahr" />
                </div>
                {!account && (
                  <p className="mt-4 rounded-lg border border-[#ecd49a] bg-[#fff3d9] px-4 py-3 text-xs text-[#886719]">
                    Für {year} ist noch kein Urlaubskonto angelegt. Angezeigt werden die Standardwerte aus den Stammdaten.
                  </p>
                )}
                <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-label={`Urlaubskonto ${year}`}>
                  <AccountCard label={`Jahresurlaub ${year}`} value={`${annualAllowance} Tage`} />
                  <AccountCard label={`Resturlaub aus ${year - 1}`} value={`${carryOverDays} Tage`} />
                  <AccountCard label="Gesamturlaub" value={`${totalDays} Tage`} emphasis />
                  <AccountCard label="Bereits genehmigt" value={`${approvedDays} Tage`} />
                  <AccountCard label="Davon genommen" value={`${takenDays} Tage`} />
                  <AccountCard label="Beantragt" value={`${requestedDays} Tage`} />
                  <AccountCard label="Offene Urlaubstage" value={`${remainingDays} Tage`} emphasis />
                  <AccountCard label="Abgelehnte Anträge" value={String(rejectedRequests.length)} />
                </section>

                <section className="mt-9" aria-labelledby="antraege-eigen-titel">
                  <div className="mb-4 flex items-end justify-between gap-4">
                    <div>
                      <h2 id="antraege-eigen-titel" className="text-lg font-semibold">Meine Anträge</h2>
                      <p className="mt-1 text-xs text-[#77847b]">
                        {visibleRequests.length} sichtbare Anträge
                      </p>
                    </div>
                  </div>
                  {visibleRequests.length === 0 ? (
                    <EmptyState message="Du hast noch keine sichtbaren Urlaubsanträge." />
                  ) : (
                    <div className="space-y-3">
                      {visibleRequests.map((request) => {
                        const requestEmployee = employees.find((entry) => entry.id === request.employeeId);
                        const days = requestEmployee
                          ? countVacationDaysInYear(requestEmployee, request, year, calendar.state)
                          : request.daysRequested;
                        return (
                          <article key={request.id} className="rounded-xl border border-[#e0e7e0] bg-white p-4 sm:flex sm:items-center sm:justify-between sm:gap-5 sm:px-5">
                            <div className="min-w-0">
                              {canSeeOthers && requestEmployee && request.employeeId !== employee.id && (
                                <p className="mb-1 text-xs font-semibold text-[#567262]">
                                  {requestEmployee.firstName} {requestEmployee.lastName}
                                </p>
                              )}
                              <p className="text-sm font-semibold">
                                {formatDate(request.startDate)} - {formatDate(request.endDate)}
                              </p>
                              <p className="mt-1 text-xs text-[#77847b]">
                                {days} Urlaubstage{request.comment ? ` · ${request.comment}` : ""}
                              </p>
                            </div>
                            <StatusBadge status={request.status} />
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              </>
            ) : (
              <p className="mt-8 rounded-xl border border-[#e0e7e0] bg-white p-5 text-sm text-[#68766d]">
                Für dieses Konto ist die Berechtigung zum Anzeigen des eigenen Urlaubs nicht gesetzt.
              </p>
            )}
            {formNotice && (
              <p role="status" className="mt-5 rounded-lg bg-[#e7f3e9] px-4 py-3 text-sm text-[#256440]">{formNotice}</p>
            )}
          </>
        )}
      </div>

      {isFormOpen && employee && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-[#10251c]/50 p-3 backdrop-blur-[2px] sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsFormOpen(false);
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="vacation-form-title" className="mx-auto my-3 max-w-xl rounded-xl border border-[#e0e7e0] bg-white shadow-2xl sm:my-8">
            <div className="flex items-start justify-between gap-4 border-b border-[#e8ede8] px-5 py-4 sm:px-7">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.14em] text-[#668071]">URLAUBSPLANUNG</p>
                <h2 id="vacation-form-title" className="mt-1 text-xl font-semibold">Urlaub beantragen</h2>
              </div>
              <button type="button" onClick={() => setIsFormOpen(false)} aria-label="Dialog schließen" className="flex size-9 items-center justify-center rounded-lg text-[#68766d] hover:bg-[#f2f5f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
              </button>
            </div>

            <form onSubmit={submitRequest}>
              <div className="space-y-5 px-5 py-6 sm:px-7">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-[#526056]">Von-Datum</span>
                    <input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} className={inputClass} />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-[#526056]">Bis-Datum</span>
                    <input type="date" required min={startDate || undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)} className={inputClass} />
                  </label>
                </div>
                <div className="rounded-lg border border-[#dfe8df] bg-[#f7faf6] px-4 py-3">
                  <p className="text-xs text-[#718077]">Automatisch berechnete Urlaubstage</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {calculatedDays.length} Tage
                  </p>
                  <p className="mt-1 text-xs text-[#77847b]">
                    Es zählen nur Tage, an denen dein Schichtplan Arbeit vorsieht. Gesetzliche Feiertage zählen nicht als Urlaubstag.
                  </p>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-[#526056]">Bemerkung (optional)</span>
                  <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} maxLength={500} className="w-full resize-y rounded-lg border border-[#dce4dc] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10" />
                </label>
                {formError && <p role="alert" className="rounded-lg border border-[#f0c8bd] bg-[#fff2ed] px-3 py-2.5 text-sm text-[#9f422d]">{formError}</p>}
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-[#e8ede8] px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
                <button type="button" onClick={() => setIsFormOpen(false)} className="min-h-11 rounded-lg border border-[#dce4dc] px-4 text-sm font-medium text-[#526056] hover:bg-[#f6f8f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]">Abbrechen</button>
                <button type="submit" disabled={calculatedDays.length === 0} className="min-h-11 rounded-lg bg-[#174c37] px-5 text-sm font-semibold text-white hover:bg-[#103d2b] disabled:cursor-not-allowed disabled:bg-[#a8b9ad] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]">Antrag einreichen</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

const inputClass = "h-11 w-full rounded-lg border border-[#dce4dc] bg-white px-3 text-sm text-[#27372d] outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10";

function AccountCard({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3.5 sm:px-5 ${emphasis ? "border-[#cbd9ce] bg-[#edf4ed]" : "border-[#e0e7e0] bg-white"}`}>
      <p className="min-h-8 text-xs font-medium leading-4 text-[#718077]">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: VacationStatus }) {
  return <span className={`mt-3 inline-flex w-fit shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium sm:mt-0 ${statusStyles[status]}`}>{status}</span>;
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-xl border border-dashed border-[#cfd9d0] bg-white px-5 py-10 text-center text-sm text-[#68766d]">{message}</div>;
}
