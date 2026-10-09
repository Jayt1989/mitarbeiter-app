"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NotificationBell from "@/app/components/notification-bell";
import type { Employee } from "../mitarbeiter/data";
import { sampleEmployees } from "../mitarbeiter/data";
import { shiftPlanRepository } from "../schichtplan/repository";
import type { AbsenceEntry } from "./staffing-data";
import { sampleVacationRequests, type VacationRequest } from "../urlaub/vacation-data";
import { areaRepository } from "./areas-repository";
import { sampleAreaConfiguration, type AreaConfiguration } from "./areas-data";
import type { TemporaryAssignment } from "./assignments-data";
import {
  formatDate,
  getStaffingAbsences,
  getWeeklyStaffing,
  type EmployeeDay,
} from "./staffing";
import YearSelector from "../components/year-selector";
import { calendarRepository } from "./calendar-repository";
import {
  berlinTodayKey,
  defaultCalendarData,
  getCalendarMarks,
  moveDateKeyToYear,
  type CalendarData,
} from "@/lib/calendar";

const shiftShort: Record<string, string> = { Früh: "F", Spät: "S", Nacht: "N" };
const shiftCellStyles: Record<string, string> = {
  Früh: "bg-[#e4f0fb] text-[#245c87]",
  Spät: "bg-[#fff0df] text-[#9a4c16]",
  Nacht: "bg-[#29395f] text-white",
};

function dateFromInput(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function moveDate(value: string, days: number) {
  const date = dateFromInput(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type Row = { employee: Employee; days: EmployeeDay[] };

export default function WeekPlan() {
  const [employees, setEmployees] = useState<Employee[]>(sampleEmployees);
  const [areaConfiguration, setAreaConfiguration] = useState<AreaConfiguration>(sampleAreaConfiguration);
  const [vacationRequests, setVacationRequests] = useState<VacationRequest[]>(sampleVacationRequests);
  const [assignments, setAssignments] = useState<TemporaryAssignment[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => berlinTodayKey());
  const [calendar, setCalendar] = useState<CalendarData>(defaultCalendarData);
  const [recordedAbsences, setRecordedAbsences] = useState<AbsenceEntry[]>([]);
  const [planningError, setPlanningError] = useState("");

  useEffect(() => {
    let isCurrent = true;

    void Promise.all([
      shiftPlanRepository.load("staffing"),
      areaRepository.load(),
      calendarRepository.load(),
    ]).then(([plan, storedAreas, storedCalendar]) => {
      if (!isCurrent) return;
      setEmployees(plan.employees);
      setRecordedAbsences(plan.absences);
      setAreaConfiguration(storedAreas);
      setVacationRequests(plan.vacations);
      setAssignments(plan.assignments);
      setCalendar(storedCalendar);
    }).catch((error: unknown) => {
      if (isCurrent) setPlanningError(error instanceof Error ? error.message : "Wochenplanung konnte nicht geladen werden.");
    });
    const refresh = () => {
      void shiftPlanRepository.load("staffing").then((plan) => {
        if (!isCurrent) return;
        setEmployees(plan.employees);
        setRecordedAbsences(plan.absences);
        setVacationRequests(plan.vacations);
        setAssignments(plan.assignments);
        setPlanningError("");
      }).catch((error: unknown) => {
        if (isCurrent) setPlanningError(error instanceof Error ? error.message : "Wochenplanung konnte nicht aktualisiert werden.");
      });
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("planning:changed", refresh);
    return () => {
      isCurrent = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("planning:changed", refresh);
    };
  }, []);

  const week = getWeeklyStaffing(
    dateFromInput(selectedDate),
    employees,
    getStaffingAbsences(vacationRequests, recordedAbsences),
    areaConfiguration,
    assignments,
  );
  const rows: Row[] = employees
    .filter((employee) => employee.isActive)
    .map((employee) => ({
      employee,
      days: week.days.map((day) => day.employees.find((entry) => entry.employee.id === employee.id)!),
    }))
    .sort((left, right) =>
      `${left.employee.lastName} ${left.employee.firstName}`.localeCompare(
        `${right.employee.lastName} ${right.employee.firstName}`,
        "de",
      ),
    );
  const groups = [
    ...areaConfiguration.areas.filter((area) => area.active).map((area) => ({ id: area.id as string | null, name: area.name })),
    { id: null, name: "Ohne Bereich" },
  ]
    .map((group) => ({
      ...group,
      rows: rows.filter(
        (row) =>
          row.employee.areaId === group.id ||
          row.days.some((day) => day.effectiveAreaId === group.id),
      ),
    }))
    .filter((group) => group.rows.length > 0);

  return (
    <main className="min-h-screen bg-[#f4f6f2] text-[#1c2b23] print:min-h-0 print:bg-white">
      <header className="border-b border-[#dce4dc] bg-white print:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3 rounded-lg">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#174c37] text-sm font-bold text-white">MA</span>
            <span className="hidden text-sm font-semibold tracking-[0.02em] sm:inline">MITARBEITERPORTAL</span>
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-1 sm:gap-2" aria-label="Adminbereiche">
            <Link href="/admin" className="rounded-lg px-2 py-2 text-xs font-medium text-[#41634f] hover:bg-[#edf3ee] sm:px-3 sm:text-sm">
              Personalbesetzung
            </Link>
            <Link href="/admin/einsatzplanung" className="rounded-lg px-2 py-2 text-xs font-medium text-[#41634f] hover:bg-[#edf3ee] sm:px-3 sm:text-sm">
              Einsatzplanung
            </Link>
            <NotificationBell />
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-14 pt-8 sm:px-8 sm:pt-12 print:max-w-none print:p-0">
        {planningError && <p role="alert" className="mb-4 rounded-lg bg-[#fff0ec] p-3 text-sm text-[#a33e31]">{planningError}</p>}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between print:hidden">
          <div>
            <p className="text-xs font-semibold tracking-[0.15em] text-[#668071]">ADMIN · DRUCKANSICHT A4</p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Wochenschichtplan</h1>
            <p className="mt-2 text-sm text-[#68766d]">
              Mitarbeiter erscheinen am jeweiligen Tag in ihrem tatsächlichen Einsatzbereich.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <button type="button" onClick={() => setSelectedDate((date) => moveDate(date, -7))} className="min-h-11 rounded-lg border border-[#dce4dc] bg-white px-3 text-sm font-medium text-[#526056] hover:bg-[#f2f6f2]">
              Vorherige Woche
            </button>
            <input
              type="date"
              aria-label="Woche auswählen"
              value={selectedDate}
              onChange={(event) => event.target.value && setSelectedDate(event.target.value)}
              className="h-11 rounded-lg border border-[#dce4dc] bg-white px-3 text-sm outline-none focus:border-[#71937d]"
            />
            <button type="button" onClick={() => setSelectedDate((date) => moveDate(date, 7))} className="min-h-11 rounded-lg border border-[#dce4dc] bg-white px-3 text-sm font-medium text-[#526056] hover:bg-[#f2f6f2]">
              Nächste Woche
            </button>
            <button type="button" onClick={() => window.print()} className="min-h-11 rounded-lg bg-[#174c37] px-4 text-sm font-semibold text-white hover:bg-[#123d2c]">
              Drucken
            </button>
          </div>
        </div>

        <div className="mt-4 print:hidden">
          <YearSelector
            year={Number(selectedDate.slice(0, 4))}
            onChange={(year) => setSelectedDate((date) => moveDateKeyToYear(date, year))}
          />
        </div>

        <section className="mt-6 rounded-xl border border-[#e0e7e0] bg-white p-4 sm:p-6 print:mt-0 print:rounded-none print:border-0 print:p-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#dce4dc] pb-3">
            <h2 className="text-lg font-semibold print:text-base">
              Wochenschichtplan KW {week.weekNumber}
            </h2>
            <span className="text-sm text-[#68766d] print:text-xs">
              {formatDate(week.startDate, { day: "2-digit", month: "2-digit", year: "numeric" })} –{" "}
              {formatDate(week.endDate, { day: "2-digit", month: "2-digit", year: "numeric" })}
            </span>
          </div>

          {groups.map((group) => (
            <div key={group.id ?? "none"} className="mt-5 break-inside-avoid print:mt-3">
              <h3 className="mb-2 text-sm font-semibold text-[#174c37] print:text-xs">{group.name}</h3>
              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full min-w-[720px] table-fixed border-collapse text-left text-xs print:min-w-0 print:text-[9px]">
                  <thead>
                    <tr className="bg-[#f8faf7] text-[10px] font-semibold uppercase tracking-[0.06em] text-[#77847b] print:text-[8px]">
                      <th scope="col" className="w-44 border border-[#e0e7e0] px-2 py-1.5 print:w-32">Mitarbeiter</th>
                      {week.days.map((day) => {
                        const marks = getCalendarMarks(day.date.toISOString().slice(0, 10), calendar);
                        const names = [
                          ...(marks.holiday ? [marks.holiday.name] : []),
                          ...marks.companyDays.map((entry) => entry.name),
                        ];
                        return (
                          <th
                            key={day.date.toISOString()}
                            scope="col"
                            className={`border border-[#e0e7e0] px-2 py-1.5 text-center ${
                              marks.holiday
                                ? "bg-[#fde9e7] text-[#a33e31]"
                                : marks.companyDays.length > 0
                                  ? "bg-[#f2eaf7] text-[#704d89]"
                                  : ""
                            }`}
                          >
                            {formatDate(day.date, { weekday: "short" })} {formatDate(day.date, { day: "2-digit", month: "2-digit" })}
                            {names.length > 0 && (
                              <span className="block truncate normal-case tracking-normal" title={names.join(" · ")}>
                                {names.join(" · ")}
                              </span>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr key={row.employee.id}>
                        <th scope="row" className="truncate border border-[#e0e7e0] px-2 py-1.5 font-medium">
                          {row.employee.lastName}, {row.employee.firstName}
                        </th>
                        {row.days.map((day, index) => (
                          <PlanCell key={week.days[index].date.toISOString()} day={day} areaId={group.id} />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <p className="mt-4 text-[10px] text-[#77847b] print:text-[8px]">
            F = Früh · S = Spät · N = Nacht · „Einsatz“ = temporär aus anderem Bereich · „→ Bereich“ = an diesem Tag in anderem Bereich eingesetzt · Rot = gesetzlicher Feiertag ({calendar.state}, Schicht bleibt bestehen) · Violett = betrieblicher Sondertag
          </p>
        </section>
      </div>
    </main>
  );
}

function PlanCell({ day, areaId }: { day: EmployeeDay; areaId: string | null }) {
  const base = "border border-[#e0e7e0] px-1 py-1.5 text-center align-middle";

  if (day.effectiveAreaId !== areaId) {
    return (
      <td className={`${base} bg-[#f4f6f2] text-[10px] text-[#8a958d] print:text-[8px]`}>
        {day.assignment ? `→ ${day.assignment.areaName}` : ""}
      </td>
    );
  }
  if (day.absenceType) {
    return <td className={`${base} bg-[#fde9e7] font-semibold text-[#a33e31]`}>{day.absenceType}</td>;
  }
  if (day.shift === null || day.shift === "Frei") {
    return <td className={`${base} text-[#8a958d]`}>{day.shift ?? "–"}</td>;
  }
  return (
    <td className={`${base} font-semibold ${shiftCellStyles[day.shift]}`}>
      {shiftShort[day.shift]}
      {day.assignment && (
        <span className="block text-[9px] font-medium print:text-[7px]">Einsatz</span>
      )}
    </td>
  );
}
