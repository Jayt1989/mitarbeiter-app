"use client";

import { useEffect, useState } from "react";
import Link from "@/app/components/access-link";
import NotificationBell from "@/app/components/notification-bell";
import type { Employee } from "../mitarbeiter/data";
import { toEmployeeShiftPlan } from "../mitarbeiter/schedule";
import { getShiftForDate, shiftModelOptions, type Shift } from "./rotation";
import type { VacationRequest, VacationStatus } from "../urlaub/vacation-data";
import { absenceTypes } from "../admin/staffing-data";
import { getAssignmentForDay, type TemporaryAssignment } from "../admin/assignments-data";
import type { ShiftPlanData } from "@/lib/shift-plan";
import { shiftPlanRepository } from "./repository";
import { berlinTodayKey } from "@/lib/calendar";
import { shiftTimeLabel } from "@/lib/shift-interval";
import {
  absenceStyles,
  companyDayMarkerStyle,
  holidayMarkerStyle,
  shiftStyles,
  vacationStyles,
} from "./shift-styles";
import YearSelector from "../components/year-selector";
import { calendarRepository } from "../admin/calendar-repository";
import {
  currentBerlinYear,
  defaultCalendarData,
  getCalendarMarks,
  type CalendarData,
} from "@/lib/calendar";

const weekDays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const shifts: Exclude<Shift, null>[] = ["Früh", "Spät", "Nacht", "Frei"];

function getMonths(year: number) {
  return Array.from({ length: 12 }, (_, monthIndex) => {
    const firstWeekday = (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7;
    const dayCount = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

    return {
      name: new Intl.DateTimeFormat("de-DE", { month: "long", timeZone: "UTC" }).format(
        new Date(Date.UTC(year, monthIndex, 1)),
      ),
      firstWeekday,
      dayCount,
      monthIndex,
    };
  });
}

function sortedActiveEmployees(employees: Employee[]) {
  return employees
    .filter((employee) => employee.isActive)
    .sort((left, right) =>
      `${left.lastName} ${left.firstName}`.localeCompare(
        `${right.lastName} ${right.firstName}`,
        "de",
      ),
    );
}

export default function ShiftCalendar({ initialData, ownEmployeeId, canSwap, canReview }: {
  initialData: ShiftPlanData; ownEmployeeId: string | null; canSwap: boolean; canReview: boolean;
}) {
  const [employees, setEmployees] = useState(initialData.employees);
  const [vacationRequests, setVacationRequests] = useState(initialData.vacations);
  const [absences, setAbsences] = useState(initialData.absences);
  const [planError, setPlanError] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    () => initialData.employees.find((employee) => employee.id === ownEmployeeId)?.id
      ?? sortedActiveEmployees(initialData.employees)[0]?.id ?? "",
  );
  const [selectedVacation, setSelectedVacation] = useState<VacationRequest | null>(null);
  const [assignments, setAssignments] = useState<TemporaryAssignment[]>(initialData.assignments);
  const [year, setYear] = useState(() => currentBerlinYear());
  const [calendar, setCalendar] = useState<CalendarData>(defaultCalendarData);
  const months = getMonths(year);

  useEffect(() => {
    let isCurrent = true;

    void calendarRepository.load().then((storedCalendar) => {
      if (isCurrent) setCalendar(storedCalendar);
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;

    const refresh = () => {
      void shiftPlanRepository.load().then((data) => {
        if (!isCurrent) return;
        setEmployees(data.employees);
        setSelectedEmployeeId((currentId) =>
          data.employees.some((employee) => employee.id === currentId) ? currentId
            : data.employees.find((employee) => employee.id === ownEmployeeId)?.id
              ?? data.employees[0]?.id ?? "",
        );
        setVacationRequests(data.vacations);
        setAbsences(data.absences);
        setAssignments(data.assignments);
        setPlanError("");
      }).catch((error: unknown) => {
        if (isCurrent) setPlanError(error instanceof Error ? error.message : "Schichtplan konnte nicht aktualisiert werden.");
      });
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("planning:changed", refresh);
    return () => {
      isCurrent = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("planning:changed", refresh);
    };
  }, [ownEmployeeId]);

  const activeEmployees = sortedActiveEmployees(employees);
  const selectedEmployee = activeEmployees.find(
    (employee) => employee.id === selectedEmployeeId,
  );
  const employeePlan = selectedEmployee
    ? toEmployeeShiftPlan(selectedEmployee)
    : null;
  const shiftModelLabel = selectedEmployee
    ? shiftModelOptions.find((model) => model.id === selectedEmployee.shiftModel)?.label
    : undefined;
  const visibleVacationRequests = selectedEmployee
    ? vacationRequests.filter(
        (request) =>
          request.status !== "Storniert" &&
          request.employeeId === selectedEmployee.id,
      )
    : [];

  return (
    <main className="min-h-screen bg-[#f4f6f2] text-[#1c2b23]">
      <header className="border-b border-[#dce4dc] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-lg focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#174c37]"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#174c37] text-sm font-bold text-white">
              TP
            </span>
            <span className="hidden text-sm font-semibold tracking-[0.02em] sm:inline">
              TeamPlan
            </span>
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-2" aria-label="Hauptnavigation">
            {canSwap && <Link href="/schichttausch" className="rounded-lg px-3 py-2 text-sm font-medium text-[#41634f] hover:bg-[#edf3ee]">Schichttausch</Link>}
            {canReview && <Link href="/admin/schichttausch" className="rounded-lg px-3 py-2 text-sm font-medium text-[#41634f] hover:bg-[#edf3ee]">Tausche prüfen</Link>}
            <Link href="/mitarbeiter" className="rounded-lg px-3 py-2 text-sm font-medium text-[#41634f] transition hover:bg-[#edf3ee] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]">Mitarbeiter</Link>
            <NotificationBell />
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-12 pt-8 sm:px-8 sm:pt-12">
        {planError && <p role="alert" className="mb-4 rounded-lg bg-[#fff0ec] p-3 text-sm text-[#a33e31]">{planError}</p>}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.15em] text-[#668071]">
              JAHRESÜBERSICHT
            </p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Schichtplan</h1>
            <p className="mt-2 text-sm text-[#68766d]">
              Persönlicher Schichtplan für {year}.
            </p>
          </div>
          <label className="block w-full sm:max-w-sm">
            <span className="mb-1.5 block text-xs font-medium text-[#526056]">
              Mitarbeiter auswählen
            </span>
            <select
              value={selectedEmployeeId}
              onChange={(event) => setSelectedEmployeeId(event.target.value)}
              disabled={activeEmployees.length === 0}
              className="h-11 w-full rounded-lg border border-[#dce4dc] bg-white px-3 text-sm text-[#27372d] outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10 disabled:text-[#8b9890]"
            >
              <option value="">Mitarbeiter auswählen</option>
              {activeEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.lastName}, {employee.firstName} · {employee.personnelNumber}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5">
          <YearSelector year={year} onChange={setYear} />
        </div>
        {canSwap && selectedEmployeeId === ownEmployeeId && (
          <div className="mt-4">
            <Link href="/schichttausch" className="inline-flex min-h-11 items-center rounded-lg bg-[#174c37] px-4 py-2 text-sm font-semibold text-white hover:bg-[#103d2b]">
              Schichttausch anfragen
            </Link>
            <p className="mt-2 text-xs text-[#68766d]">Klicke alternativ auf eine eigene Schicht, um deren Datum direkt zu übernehmen.</p>
          </div>
        )}

        {selectedEmployee && employeePlan ? (
          <>
            <section
              aria-label="Ausgewählter Mitarbeiter"
              className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 rounded-xl border border-[#e0e7e0] bg-white p-4 sm:grid-cols-4 sm:px-6 sm:py-5"
            >
              <EmployeeDetail
                label="Name"
                value={`${selectedEmployee.firstName} ${selectedEmployee.lastName}`}
              />
              <EmployeeDetail
                label="Personalnummer"
                value={selectedEmployee.personnelNumber}
              />
              <EmployeeDetail label="Schichtmodell" value={shiftModelLabel ?? ""} />
              <EmployeeDetail label="Schichtgruppe" value={selectedEmployee.shiftGroup} />
            </section>

            {selectedEmployee.shiftModel === "individuell" && (
              <p className="mt-4 rounded-lg border border-[#dce4dc] bg-white px-4 py-3 text-sm text-[#607067]">
                Für dieses individuelle Schichtmodell wird noch kein Dienst automatisch berechnet.
              </p>
            )}

            <section
              aria-label="Legende Schichtarten und Wochenenden"
              className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-[#e0e7e0] bg-white px-4 py-4 sm:px-5"
            >
              {shifts.map((shift) => (
                <span key={shift} className="flex items-center gap-2 text-sm text-[#425248]">
                  <span className={`size-3 rounded-sm ${shiftStyles[shift]}`} />
                  {shift}
                </span>
              ))}
              {selectedEmployee.shiftModel === "individuell" && (
                <span className="flex items-center gap-2 text-sm text-[#425248]">
                  <span className="size-3 rounded-sm border border-dashed border-[#aab6ac] bg-white" />
                  Nicht geplant
                </span>
              )}
              <span className="flex items-center gap-2 text-sm text-[#425248]">
                <span className={`size-3 rounded-sm ${vacationStyles.Beantragt}`} />
                Urlaub beantragt
              </span>
              <span className="flex items-center gap-2 text-sm text-[#425248]">
                <span className={`size-3 rounded-sm ${vacationStyles.Genehmigt}`} />
                Urlaub genehmigt
              </span>
              <span className="flex items-center gap-2 text-sm text-[#425248]">
                <span className={`size-3 rounded-sm ${vacationStyles.Abgelehnt}`} />
                Urlaub abgelehnt
              </span>
              {absenceTypes.filter((type) => type !== "Urlaub").map((type) => (
                <span key={type} className="flex items-center gap-2 text-sm text-[#425248]">
                  <span className={`size-3 rounded-sm ${absenceStyles[type]}`} />
                  {type}
                </span>
              ))}
              <span className="flex items-center gap-2 text-sm text-[#425248]">
                <span className="size-3 rounded-sm border-l-4 border-l-[#d18a2c] bg-[#e4f0fb]" />
                Temporärer Einsatz
              </span>
              <span className="flex items-center gap-2 text-sm text-[#425248]">
                <span className="size-4 rounded-sm border-2 border-[#d6aa56] bg-white" />
                Wochenende
              </span>
              <span className="flex items-center gap-2 text-sm text-[#425248]">
                <span className={`size-4 rounded-sm bg-[#e4f0fb] ${holidayMarkerStyle}`} />
                Feiertag ({calendar.state})
              </span>
              <span className="flex items-center gap-2 text-sm text-[#425248]">
                <span className={`size-4 rounded-sm bg-[#e4f0fb] ${companyDayMarkerStyle}`} />
                Betrieblicher Sondertag
              </span>
            </section>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {months.map((month) => (
                <section
                  key={month.name}
                  aria-labelledby={`monat-${month.monthIndex}`}
                  className="min-w-0 rounded-xl border border-[#e0e7e0] bg-white p-4 shadow-[0_2px_10px_rgba(28,43,35,0.03)] sm:p-5"
                >
                  <div className="mb-4 flex items-baseline justify-between">
                    <h2 id={`monat-${month.monthIndex}`} className="text-base font-semibold capitalize">
                      {month.name}
                    </h2>
                    <span className="text-xs tabular-nums text-[#77847b]">
                      {month.dayCount} Tage
                    </span>
                  </div>

                  <div className="grid grid-cols-7 gap-1" role="grid">
                    {weekDays.map((dayName, dayIndex) => (
                      <div
                        key={dayName}
                        role="columnheader"
                        className={`flex h-7 items-center justify-center rounded text-[10px] font-semibold ${
                          dayIndex > 4
                            ? "bg-[#fff4d9] text-[#8d6b26]"
                            : "text-[#7b897f]"
                        }`}
                      >
                        {dayName}
                      </div>
                    ))}
                    {Array.from({ length: month.firstWeekday }, (_, index) => (
                      <span key={`leer-${index}`} aria-hidden="true" />
                    ))}
                    {Array.from({ length: month.dayCount }, (_, index) => {
                      const day = index + 1;
                      const weekday = (month.firstWeekday + index) % 7;
                      const date = new Date(Date.UTC(year, month.monthIndex, day));
                      const shift = getShiftForDate(date, employeePlan);
                      const isWeekend = weekday > 4;
                      const dateKey = date.toISOString().slice(0, 10);
                      const marks = getCalendarMarks(dateKey, calendar);
                      const markNames = [
                        ...(marks.holiday ? [marks.holiday.name] : []),
                        ...marks.companyDays.map((entry) => entry.name),
                      ];
                      const vacationOnDay = shift && shift !== "Frei"
                        ? visibleVacationRequests
                            .filter((request) => request.employeeId === selectedEmployee.id)
                            .filter((request) => request.startDate <= dateKey && request.endDate >= dateKey)
                            .sort((left, right) => {
                              const statusOrder: Record<VacationStatus, number> = {
                                Genehmigt: 0,
                                Beantragt: 1,
                                Abgelehnt: 2,
                                Storniert: 3,
                              };
                              return statusOrder[left.status] - statusOrder[right.status];
                            })[0]
                        : undefined;
                      const absenceOnDay = !vacationOnDay && shift && shift !== "Frei"
                        ? absences.find(
                            (absence) =>
                              absence.employeeId === selectedEmployee.id &&
                              absence.startDate <= dateKey &&
                              absence.endDate >= dateKey,
                          )?.type
                        : undefined;
                      const assignmentOnDay =
                        vacationOnDay?.status !== "Genehmigt" && !absenceOnDay
                          ? getAssignmentForDay(selectedEmployee.id, dateKey, shift, assignments)
                          : null;
                      const additionalOnDay = selectedEmployee.additionalShifts?.[dateKey];
                      const shiftClass = vacationOnDay
                        ? vacationStyles[vacationOnDay.status as Exclude<VacationStatus, "Storniert">]
                        : absenceOnDay
                          ? absenceStyles[absenceOnDay]
                        : shift
                          ? shiftStyles[shift]
                          : "border border-dashed border-[#d7dfd8] bg-white text-[#87928b]";
                      const shiftLabel = vacationOnDay
                        ? vacationOnDay.status === "Genehmigt"
                          ? "Urlaub"
                          : vacationOnDay.status === "Beantragt"
                            ? "Antrag"
                            : "Abgelehnt"
                        : absenceOnDay
                          ? absenceOnDay === "Sonderurlaub"
                            ? "Sonderur."
                            : absenceOnDay === "Sonstige Abwesenheit"
                              ? "Abwesenh."
                              : absenceOnDay
                        : shift ?? "–";
                      const accessibleLabel = `${day}. ${month.name} ${year}: ${vacationOnDay ? `Urlaub ${vacationOnDay.status.toLocaleLowerCase("de")}` : absenceOnDay ?? shiftLabel}${shift && shift !== "Frei" ? `, Schicht laut Plan ${shift}` : ""}${additionalOnDay ? `, Zusatzschicht: ${additionalOnDay.departmentName}, ${shiftTimeLabel(additionalOnDay.shift)}` : ""}${assignmentOnDay ? `, Einsatz: ${assignmentOnDay.areaName}` : ""}${marks.holiday ? `, Feiertag: ${marks.holiday.name}` : ""}${marks.companyDays.map((entry) => `, Sondertag: ${entry.name}`).join("")}`;
                      const cellContent = (
                        <>
                          <span className="text-[10px] font-semibold leading-3 tabular-nums">
                            {day}
                          </span>
                          <span className="truncate text-[9px] font-medium leading-3 sm:text-[10px]">
                            {shiftLabel}
                          </span>
                          {additionalOnDay && <span title={`${additionalOnDay.departmentName} · ${shiftTimeLabel(additionalOnDay.shift)}`}
                            className="text-[8px] font-bold leading-3">Zusatzschicht</span>}
                          {markNames.length > 0 && (
                            <span
                              title={markNames.join(" · ")}
                              className="truncate text-[8px] font-semibold leading-3 sm:text-[9px]"
                            >
                              {markNames.join(" · ")}
                            </span>
                          )}
                          {assignmentOnDay && (
                            <span
                              title={`Einsatz: ${assignmentOnDay.areaName}`}
                              className="truncate text-[8px] font-semibold leading-3 sm:text-[9px]"
                            >
                              Einsatz: {assignmentOnDay.areaName}
                            </span>
                          )}
                        </>
                      );

                      const cellClass = `flex min-h-12 min-w-0 flex-col justify-between rounded-md px-1 py-1 ${shiftClass} ${
                        isWeekend ? "ring-2 ring-inset ring-[#d6aa56]" : ""
                      } ${assignmentOnDay ? "border-l-4 border-l-[#d18a2c]" : ""} ${
                        marks.holiday ? holidayMarkerStyle : ""
                      } ${marks.companyDays.length > 0 ? companyDayMarkerStyle : ""}`;

                      const canRequestDay = !additionalOnDay && canSwap && selectedEmployee.id === ownEmployeeId &&
                        shift && shift !== "Frei" && dateKey >= berlinTodayKey();
                      return vacationOnDay ? (
                        <button
                          key={day}
                          type="button"
                          role="gridcell"
                          aria-label={`${accessibleLabel}. Details öffnen`}
                          title="Urlaubsdetails öffnen"
                          data-plan-shift={shift ?? ""}
                          onClick={() => setSelectedVacation(vacationOnDay)}
                          className={`${cellClass} w-full text-left focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#174c37]`}
                        >
                          {cellContent}
                        </button>
                      ) : canRequestDay ? (
                        <Link key={day} role="gridcell" href={`/schichttausch?date=${dateKey}`}
                          aria-label={`${accessibleLabel}. Schichttausch anfragen`}
                          title="Schichttausch anfragen" data-plan-shift={shift ?? ""}
                          className={`${cellClass} focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#174c37]`}>
                          {cellContent}
                          <span className="text-[8px] underline">Tausch</span>
                        </Link>
                      ) : (
                        <div
                          key={day}
                          role="gridcell"
                          aria-label={accessibleLabel}
                          data-plan-shift={shift ?? ""}
                          className={cellClass}
                        >
                          {cellContent}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-[#cfd9d0] bg-white px-5 py-12 text-center">
            <p className="text-sm font-semibold text-[#34443a]">
              {activeEmployees.length === 0
                ? "Keine aktiven Mitarbeiter vorhanden."
                : "Mitarbeiter auswählen"}
            </p>
            <p className="mt-1 text-xs text-[#77847b]">
              {activeEmployees.length === 0
                ? "Aktiviere einen Mitarbeiter in der Mitarbeiterverwaltung, um einen Schichtplan zu sehen."
                : "Wähle oben einen Mitarbeiter für den persönlichen Schichtplan aus."}
            </p>
          </div>
        )}
      </div>
      {selectedVacation && (
        <VacationDayDialog
          request={selectedVacation}
          onClose={() => setSelectedVacation(null)}
        />
      )}
    </main>
  );
}

function VacationDayDialog({
  request,
  onClose,
}: {
  request: VacationRequest;
  onClose: () => void;
}) {
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}T00:00:00.000Z`));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#10251c]/50 p-3 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="vacation-day-title"
        className="w-full max-w-lg rounded-xl border border-[#e0e7e0] bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#e8ede8] px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.14em] text-[#668071]">
              URLAUBSANTRAG
            </p>
            <h2 id="vacation-day-title" className="mt-1 text-xl font-semibold">
              {request.status === "Genehmigt" ? "Urlaub genehmigt" : request.status === "Beantragt" ? "Urlaub beantragt" : "Urlaub abgelehnt"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dialog schließen"
            className="flex size-9 items-center justify-center rounded-lg text-[#68766d] hover:bg-[#f2f5f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 px-5 py-5 sm:px-6">
          <EmployeeDetail label="Von" value={formatDate(request.startDate)} />
          <EmployeeDetail label="Bis" value={formatDate(request.endDate)} />
          <EmployeeDetail label="Anzahl Urlaubstage" value={`${request.daysRequested}`} />
          <EmployeeDetail label="Status" value={request.status} />
          <EmployeeDetail label="Beantragt am" value={formatDate(request.requestedAt.slice(0, 10))} />
          <div className="col-span-2">
            <EmployeeDetail label="Bemerkung" value={request.comment || "Keine Bemerkung angegeben."} />
          </div>
        </div>
        <div className="flex justify-end border-t border-[#e8ede8] px-5 py-4 sm:px-6">
          <button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-[#dce4dc] px-4 text-sm font-medium text-[#526056] hover:bg-[#f6f8f5]">
            Schließen
          </button>
        </div>
      </section>
    </div>
  );
}

function EmployeeDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#859189]">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-[#34443a]">{value}</p>
    </div>
  );
}
