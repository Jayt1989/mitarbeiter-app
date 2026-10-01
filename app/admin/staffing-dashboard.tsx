"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Employee } from "../mitarbeiter/data";
import { sampleEmployees } from "../mitarbeiter/data";
import { employeeRepository } from "../mitarbeiter/repository";
import {
  formatDate,
  getDailyStaffing,
  getStaffingAbsences,
  getWeeklyStaffing,
  staffedShifts,
  type AttendanceStatus,
  type DailyStaffing,
  type EmployeeDay,
  type TrafficLight,
} from "./staffing";
import { absenceTypes } from "./staffing-data";
import { sampleVacationRequests, type VacationRequest } from "../urlaub/vacation-data";
import { vacationRepository } from "../urlaub/vacation-repository";
import { areaRepository } from "./areas-repository";
import {
  sampleAreaConfiguration,
  type AreaConfiguration,
  type WorkArea,
} from "./areas-data";
import type { TemporaryAssignment } from "./assignments-data";
import { assignmentRepository } from "./assignments-repository";
import YearSelector from "../components/year-selector";
import { calendarRepository } from "./calendar-repository";
import {
  berlinTodayKey,
  companyDayTypeLabel,
  defaultCalendarData,
  getCalendarMarks,
  moveDateKeyToYear,
  type CalendarData,
} from "@/lib/calendar";
import { companyDayBadgeStyle, holidayBadgeStyle } from "../schichtplan/shift-styles";

const trafficStyles: Record<TrafficLight, string> = {
  green: "bg-[#e7f3e9] text-[#256440]",
  yellow: "bg-[#fff3d9] text-[#886719]",
  red: "bg-[#fde9e7] text-[#a33e31]",
};
const trafficDotStyles: Record<TrafficLight, string> = {
  green: "bg-[#398557]",
  yellow: "bg-[#d6a52d]",
  red: "bg-[#c54d3f]",
};
const trafficLabels: Record<TrafficLight, string> = {
  green: "Ausreichend",
  yellow: "Knapp",
  red: "Unterbesetzt",
};
const statusStyles: Partial<Record<AttendanceStatus, string>> = {
  Verfügbar: "bg-[#e7f3e9] text-[#256440]",
  Frei: "bg-[#eef0ed] text-[#66726a]",
  Urlaub: "bg-[#e8eff7] text-[#365f80]",
  Krank: "bg-[#fde9e7] text-[#a33e31]",
  Schulung: "bg-[#fff3d9] text-[#886719]",
  Sonderurlaub: "bg-[#f2eaf7] text-[#704d89]",
  "Sonstige Abwesenheit": "bg-[#f1eeea] text-[#716454]",
  "Nicht geplant": "bg-white text-[#77847b]",
  Inaktiv: "bg-[#eef0ed] text-[#818b83]",
};

type ViewMode = "Tag" | "Woche";
type StaffFilter =
  | "Alle Mitarbeiter"
  | "Früh"
  | "Spät"
  | "Nacht"
  | "Urlaub"
  | "Krank"
  | "Abwesend"
  | "Verfügbar";
type AreaFilter = "Alle Bereiche" | "Kein Bereich" | string;

const staffFilters: StaffFilter[] = [
  "Alle Mitarbeiter",
  "Früh",
  "Spät",
  "Nacht",
  "Urlaub",
  "Krank",
  "Abwesend",
  "Verfügbar",
];

function dateFromInput(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function moveDate(value: string, days: number) {
  const date = dateFromInput(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function matchesFilter(employee: EmployeeDay, filter: StaffFilter) {
  if (filter === "Alle Mitarbeiter") return true;
  if (filter === "Abwesend") return employee.absenceType !== null;
  if (filter === "Verfügbar") return employee.status === "Verfügbar";
  if (filter === "Urlaub" || filter === "Krank") {
    return employee.absenceType === filter;
  }
  return employee.shift === filter;
}

export default function StaffingDashboard() {
  const [employees, setEmployees] = useState<Employee[]>(sampleEmployees);
  const [selectedDate, setSelectedDate] = useState(() => berlinTodayKey());
  const [viewMode, setViewMode] = useState<ViewMode>("Woche");
  const [staffFilter, setStaffFilter] = useState<StaffFilter>("Alle Mitarbeiter");
  const [areaFilter, setAreaFilter] = useState<AreaFilter>("Alle Bereiche");
  const [areaConfiguration, setAreaConfiguration] = useState<AreaConfiguration>(sampleAreaConfiguration);
  const [vacationRequests, setVacationRequests] = useState<VacationRequest[]>(sampleVacationRequests);
  const [assignments, setAssignments] = useState<TemporaryAssignment[]>([]);
  const [calendar, setCalendar] = useState<CalendarData>(defaultCalendarData);

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

    void assignmentRepository.loadAll().then((storedAssignments) => {
      if (isCurrent) setAssignments(storedAssignments);
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;

    void employeeRepository.loadAll().then((storedEmployees) => {
      if (isCurrent && storedEmployees) setEmployees(storedEmployees);
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;

    void vacationRepository.loadAll().then((storedRequests) => {
      if (isCurrent) setVacationRequests(storedRequests);
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;

    void areaRepository.load().then((configuration) => {
      if (isCurrent) setAreaConfiguration(configuration);
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  const staffingAbsences = getStaffingAbsences(vacationRequests);

  const selectedDay = getDailyStaffing(
    dateFromInput(selectedDate),
    employees,
    staffingAbsences,
    areaConfiguration,
    assignments,
  );
  const selectedWeek = getWeeklyStaffing(
    dateFromInput(selectedDate),
    employees,
    staffingAbsences,
    areaConfiguration,
    assignments,
  );
  const filteredEmployees = selectedDay.employees.filter((employee) =>
    matchesFilter(employee, staffFilter) &&
      (areaFilter === "Alle Bereiche"
        ? true
        : areaFilter === "Kein Bereich"
          ? employee.effectiveAreaId === null
          : employee.effectiveAreaId === areaFilter),
  );

  function openDay(date: Date) {
    setSelectedDate(date.toISOString().slice(0, 10));
    setViewMode("Tag");
  }

  return (
    <main className="min-h-screen bg-[#f4f6f2] text-[#1c2b23]">
      <header className="border-b border-[#dce4dc] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-lg focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#174c37]"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#174c37] text-sm font-bold text-white">
              MA
            </span>
            <span className="text-sm font-semibold tracking-[0.02em]">
              MITARBEITERPORTAL
            </span>
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-1 sm:gap-2" aria-label="Adminbereiche">
            <Link
              href="/admin/einsatzplanung"
              className="rounded-lg px-2 py-2 text-xs font-medium text-[#41634f] transition hover:bg-[#edf3ee] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#174c37] sm:px-3 sm:text-sm"
            >
              <span className="sm:hidden">Einsatz</span>
              <span className="hidden sm:inline">Einsatzplanung</span>
            </Link>
            <Link
              href="/admin/wochenplan"
              className="rounded-lg px-2 py-2 text-xs font-medium text-[#41634f] transition hover:bg-[#edf3ee] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#174c37] sm:px-3 sm:text-sm"
            >
              <span className="sm:hidden">Woche</span>
              <span className="hidden sm:inline">Wochenplan</span>
            </Link>
            <Link
              href="/admin/mindestbesetzung"
              className="rounded-lg px-2 py-2 text-xs font-medium text-[#41634f] transition hover:bg-[#edf3ee] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#174c37] sm:px-3 sm:text-sm"
            >
              <span className="sm:hidden">Min.</span>
              <span className="hidden sm:inline">Mindestbesetzung</span>
            </Link>
            <Link
              href="/admin/qualifikationen"
              className="rounded-lg px-2 py-2 text-xs font-medium text-[#41634f] transition hover:bg-[#edf3ee] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#174c37] sm:px-3 sm:text-sm"
            >
              <span className="sm:hidden">Qual.</span>
              <span className="hidden sm:inline">Qualifikationen</span>
            </Link>
            <Link
              href="/admin/urlaub"
              className="rounded-lg px-2 py-2 text-xs font-medium text-[#41634f] transition hover:bg-[#edf3ee] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#174c37] sm:px-3 sm:text-sm"
            >
              <span className="sm:hidden">Urlaub</span>
              <span className="hidden sm:inline">Urlaubsanträge</span>
            </Link>
            <Link
              href="/mitarbeiter"
              className="rounded-lg px-2 py-2 text-xs font-medium text-[#41634f] transition hover:bg-[#edf3ee] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#174c37] sm:px-3 sm:text-sm"
            >
              <span className="sm:hidden">Team</span>
              <span className="hidden sm:inline">Mitarbeiter</span>
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-14 pt-8 sm:px-8 sm:pt-12">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.15em] text-[#668071]">
              ADMIN · PERSONALPLANUNG
            </p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
              Personalbesetzung
            </h1>
            <p className="mt-2 text-sm text-[#68766d]">
              Verfügbarkeit, Schichten und Abwesenheiten im Überblick.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[#526056]">
                Datum auswählen
              </span>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="h-11 w-full rounded-lg border border-[#dce4dc] bg-white px-3 text-sm text-[#27372d] outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10 sm:w-44"
              />
            </label>
            <div className="flex h-11 w-fit items-center rounded-lg border border-[#dce4dc] bg-white p-1" aria-label="Ansicht auswählen">
              {(["Tag", "Woche"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={viewMode === mode}
                  onClick={() => setViewMode(mode)}
                  className={`h-full rounded-md px-4 text-sm font-medium transition ${
                    viewMode === mode
                      ? "bg-[#e8f0e9] text-[#174c37]"
                      : "text-[#68766d] hover:bg-[#f4f6f2]"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <YearSelector
            year={Number(selectedDate.slice(0, 4))}
            onChange={(year) => setSelectedDate((date) => moveDateKeyToYear(date, year))}
          />
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { href: "/admin/einsatzplanung", label: "VERTRETUNG", title: "Einsatzplanung", text: "Mitarbeiter vorübergehend in anderen Bereichen einsetzen.", icon: "M4 7h11m0 0-3-3m3 3-3 3M20 17H9m0 0 3-3m-3 3 3 3", color: "bg-[#fff0df] text-[#b65d22]" },
            { href: "/admin/einstellungen", label: "EINSTELLUNGEN", title: "Feiertage & Kalender", text: "Bundesland, Feiertage und betriebliche Sondertage.", icon: "M4 6h16v14H4zM4 10h16M8 3v4m8-4v4", color: "bg-[#fde9e7] text-[#a33e31]" },
            { href: "/admin/jahreswechsel", label: "URLAUBSJAHR", title: "Jahreswechsel", text: "Urlaubskonten für das neue Jahr anlegen.", icon: "M12 4v4m0 8v4M4 12h4m8 0h4M6.5 6.5l2.5 2.5m6 6 2.5 2.5m0-11L15 9m-6 6-2.5 2.5", color: "bg-[#e5eff9] text-[#316b9b]" },
            { href: "/admin/export", label: "AUSWERTUNGEN", title: "Export", text: "Pläne und Übersichten als PDF oder Excel.", icon: "M12 4v11m0 0-4-4m4 4 4-4M5 19h14", color: "bg-[#e1f2e8] text-[#197044]" },
          ].map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className="group flex items-center justify-between gap-4 rounded-xl border border-[#e0e7e0] bg-white p-4 shadow-[0_2px_10px_rgba(28,43,35,0.03)] transition hover:-translate-y-0.5 hover:border-[#bdcfc1] hover:shadow-[0_10px_24px_rgba(28,43,35,0.08)] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#174c37] sm:p-5"
            >
              <div className="flex min-w-0 items-center gap-4">
                <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${tile.color}`}>
                  <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={tile.icon} />
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold tracking-[0.12em] text-[#7b897f]">{tile.label}</p>
                  <h2 className="mt-0.5 text-base font-semibold">{tile.title}</h2>
                  <p className="mt-0.5 text-sm text-[#68766d]">{tile.text}</p>
                </div>
              </div>
              <ArrowIcon direction="right" />
            </Link>
          ))}
        </div>

        {viewMode === "Tag" ? (
          <DayView
            staffing={selectedDay}
            calendar={calendar}
            filter={staffFilter}
            filteredEmployees={filteredEmployees}
            onFilterChange={setStaffFilter}
            areas={areaConfiguration.areas}
            areaFilter={areaFilter}
            onAreaFilterChange={setAreaFilter}
          />
        ) : (
          <WeekView
            staffing={selectedWeek}
            calendar={calendar}
            onPrevious={() => setSelectedDate((date) => moveDate(date, -7))}
            onNext={() => setSelectedDate((date) => moveDate(date, 7))}
            onToday={() => setSelectedDate(berlinTodayKey())}
            onSelectDay={openDay}
          />
        )}
      </div>
    </main>
  );
}

function DayView({
  staffing,
  calendar,
  filter,
  filteredEmployees,
  onFilterChange,
  areas,
  areaFilter,
  onAreaFilterChange,
}: {
  staffing: DailyStaffing;
  calendar: CalendarData;
  filter: StaffFilter;
  filteredEmployees: EmployeeDay[];
  onFilterChange: (filter: StaffFilter) => void;
  areas: readonly WorkArea[];
  areaFilter: AreaFilter;
  onAreaFilterChange: (filter: AreaFilter) => void;
}) {
  const summaryCards = [
    { label: "Mitarbeiter gesamt", value: staffing.totalEmployees },
    { label: "Eingeplant gesamt", value: staffing.plannedTotal },
    { label: "Tatsächlich verfügbar", value: staffing.availableTotal },
  ];

  return (
    <>
      <div className="mt-8 flex flex-col gap-2 border-b border-[#dce4dc] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-[#668071]">
            TAGESÜBERSICHT
          </p>
          <h2 className="mt-1 text-xl font-semibold capitalize">
            {formatDate(staffing.date, { weekday: "long", day: "numeric", month: "long" })}
          </h2>
        </div>
        <span className="text-sm text-[#748178]">
          {formatDate(staffing.date, { day: "2-digit", month: "2-digit", year: "numeric" })}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-[#e0e7e0] bg-white px-4 py-4 sm:px-5">
            <p className="text-xs font-medium text-[#718077]">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{card.value}</p>
          </div>
        ))}
      </div>

      <CalendarMarkBadges dateKey={staffing.date.toISOString().slice(0, 10)} calendar={calendar} className="mt-4" />

      {staffing.overallTrafficLight === "red" && (
        <p role="alert" className="mt-4 rounded-lg border border-[#efb8ad] bg-[#fff0ec] px-4 py-3 text-sm font-semibold text-[#a33e31]">
          Mindestens ein Bereich unterschreitet heute die Mindestbesetzung.
        </p>
      )}

      <section className="mt-8" aria-labelledby="schichtzahlen-titel">
        <SectionHeading id="schichtzahlen-titel" title="Schichtbesetzung" />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {staffedShifts.map((shift) => {
            const summary = staffing.shifts[shift];
            return (
              <article key={shift} className="rounded-xl border border-[#e0e7e0] bg-white p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold">{shift}</h3>
                  <TrafficBadge status={summary.trafficLight} />
                </div>
                <p className="mt-4 text-2xl font-semibold tabular-nums">
                  {summary.available}
                  <span className="ml-1 text-sm font-medium text-[#7b897f]">
                    verfügbar / mindestens {summary.minimum}
                  </span>
                </p>
                <p className="mt-1 text-xs text-[#77847b]">
                  Eingeplant: {summary.planned}
                </p>
                <div className="mt-4 border-t border-[#edf0ec]">
                  {summary.areas.map((areaSummary) => (
                    <div key={areaSummary.area.id} className="border-b border-[#edf0ec] py-3 last:border-b-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 text-xs font-medium text-[#45544a]">{areaSummary.area.name}</p>
                        <TrafficBadge status={areaSummary.trafficLight} compact />
                      </div>
                      <p className="mt-1 text-xs text-[#68766d]">
                        {areaSummary.available} / {areaSummary.minimum} verfügbar
                        {areaSummary.missing > 0 && ` · ${areaSummary.missing} fehlen`}
                        {areaSummary.extra > 0 && ` · ${areaSummary.extra} zusätzlich`}
                      </p>
                      {areaSummary.qualificationId && (
                        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#68766d]">
                          {areaSummary.qualifiedAvailable} ausreichend qualifiziert
                          {areaSummary.requiredQualified > 0 && ` (mind. ${areaSummary.requiredQualified})`}
                          {areaSummary.qualifiedTrafficLight && (
                            <TrafficBadge status={areaSummary.qualifiedTrafficLight} compact />
                          )}
                        </p>
                      )}
                      <p className="mt-0.5 text-[10px] text-[#87928b]">Eingeplant: {areaSummary.planned}</p>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="abwesenheiten-titel">
        <SectionHeading id="abwesenheiten-titel" title="Abwesenheiten und Frei" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {absenceTypes.map((type) => (
            <div key={type} className="rounded-xl border border-[#e0e7e0] bg-white px-4 py-3.5">
              <p className="min-h-8 text-xs font-medium leading-4 text-[#718077]">{type}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {staffing.absenceCounts[type]}
              </p>
            </div>
          ))}
          <div className="rounded-xl border border-[#e0e7e0] bg-white px-4 py-3.5">
            <p className="text-xs font-medium text-[#718077]">Frei</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{staffing.freeTotal}</p>
          </div>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="tagesliste-titel">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <SectionHeading id="tagesliste-titel" title="Mitarbeiter am ausgewählten Tag" />
            <p className="mt-1 text-xs text-[#77847b]">
              {filteredEmployees.length} von {staffing.employees.length} Mitarbeitern
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:w-52">
              <span className="mb-1.5 block text-xs font-medium text-[#526056]">Mitarbeiter filtern</span>
              <select value={filter} onChange={(event) => onFilterChange(event.target.value as StaffFilter)} className="h-10 w-full rounded-lg border border-[#dce4dc] bg-white px-3 text-sm outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10">
                {staffFilters.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label className="block sm:w-56">
              <span className="mb-1.5 block text-xs font-medium text-[#526056]">Bereich filtern</span>
              <select value={areaFilter} onChange={(event) => onAreaFilterChange(event.target.value)} className="h-10 w-full rounded-lg border border-[#dce4dc] bg-white px-3 text-sm outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10">
                <option>Alle Bereiche</option>
                {areas.filter((area) => area.active).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
                <option>Kein Bereich</option>
              </select>
            </label>
          </div>
        </div>

        <div className="mt-4 hidden overflow-hidden rounded-xl border border-[#e0e7e0] bg-white md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead className="bg-[#f8faf7] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77847b]">
                <tr>
                  <th scope="col" className="px-5 py-3">Name</th>
                  <th scope="col" className="px-4 py-3">Personalnummer</th>
                  <th scope="col" className="px-4 py-3">Schicht</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Abwesenheitsart</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0ec]">
                {filteredEmployees.map((row) => (
                  <tr key={row.employee.id} className="hover:bg-[#fbfcfa]">
                    <td className="px-5 py-3.5 text-sm font-medium">
                      {row.employee.firstName} {row.employee.lastName}
                    </td>
                    <td className="px-4 py-3.5 text-sm tabular-nums text-[#526056]">
                      {row.employee.personnelNumber}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-[#526056]">
                      {row.shift ?? "–"}
                      {row.assignment && (
                        <span className="mt-0.5 block text-xs font-medium text-[#7a4f12]">
                          Einsatz: {row.assignment.areaName}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5"><StatusBadge status={row.status} /></td>
                    <td className="px-4 py-3.5 text-sm text-[#68766d]">
                      {row.absenceType ?? "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredEmployees.length === 0 && <EmptyState />}
        </div>

        <div className="mt-4 space-y-3 md:hidden">
          {filteredEmployees.map((row) => (
            <article key={row.employee.id} className="rounded-xl border border-[#e0e7e0] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">
                    {row.employee.firstName} {row.employee.lastName}
                  </h3>
                  <p className="mt-1 text-xs text-[#77847b]">{row.employee.personnelNumber}</p>
                </div>
                <StatusBadge status={row.status} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[#edf0ec] pt-3">
                <Detail label="Schicht" value={row.shift ?? "–"} />
                <Detail label="Abwesenheitsart" value={row.absenceType ?? "–"} />
                {row.assignment && (
                  <Detail label="Einsatz" value={row.assignment.areaName} />
                )}
              </dl>
            </article>
          ))}
          {filteredEmployees.length === 0 && <EmptyState />}
        </div>
      </section>
    </>
  );
}

function WeekView({
  staffing,
  calendar,
  onPrevious,
  onNext,
  onToday,
  onSelectDay,
}: {
  staffing: ReturnType<typeof getWeeklyStaffing>;
  calendar: CalendarData;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onSelectDay: (date: Date) => void;
}) {
  return (
    <section className="mt-8" aria-labelledby="wochenuebersicht-titel">
      <div className="flex flex-col gap-4 border-b border-[#dce4dc] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-[#668071]">
            WOCHENÜBERSICHT
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h2 id="wochenuebersicht-titel" className="text-xl font-semibold">
              KW {staffing.weekNumber}
            </h2>
            <span className="text-sm text-[#748178]">
              {formatDate(staffing.startDate, { day: "2-digit", month: "2-digit", year: "numeric" })}
              {" - "}
              {formatDate(staffing.endDate, { day: "2-digit", month: "2-digit", year: "numeric" })}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <button
            type="button"
            onClick={onPrevious}
            aria-label="Vorherige Woche"
            className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#dce4dc] bg-white px-3 text-sm font-medium text-[#526056] transition hover:bg-[#f2f6f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]"
          >
            <ArrowIcon direction="left" />
            <span className="hidden sm:inline">Vorherige Woche</span>
            <span className="sm:hidden">Zurück</span>
          </button>
          <button
            type="button"
            onClick={onToday}
            className="min-h-10 rounded-lg border border-[#cbd9ce] bg-[#eaf2eb] px-3 text-xs font-semibold text-[#285e3e] transition hover:bg-[#dfece1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]"
          >
            Aktuelle Woche
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Nächste Woche"
            className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#dce4dc] bg-white px-3 text-sm font-medium text-[#526056] transition hover:bg-[#f2f6f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]"
          >
            <span className="hidden sm:inline">Nächste Woche</span>
            <span className="sm:hidden">Weiter</span>
            <ArrowIcon direction="right" />
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {staffing.days.map((day) => {
          const weekday = formatDate(day.date, { weekday: "long" });
          const isWeekend = day.date.getUTCDay() === 0 || day.date.getUTCDay() === 6;
          const shortAreas = staffedShifts.flatMap((shift) =>
            day.shifts[shift].areas
              .filter((area) => area.trafficLight === "red")
              .map((area) => `${area.area.name} (${shift}: ${area.available}/${area.minimum})`),
          );

          return (
            <button
              key={day.date.toISOString()}
              type="button"
              onClick={() => onSelectDay(day.date)}
              aria-label={`${weekday}, ${formatDate(day.date, { day: "numeric", month: "long" })}: Tagesansicht öffnen`}
              className="rounded-xl border border-[#e0e7e0] bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-[#bdcfc1] hover:shadow-[0_8px_20px_rgba(28,43,35,0.06)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className={`text-sm font-semibold capitalize ${isWeekend ? "text-[#8d6b26]" : "text-[#34443a]"}`}>
                    {weekday}
                  </p>
                  <p className="mt-0.5 text-xs text-[#77847b]">
                    {formatDate(day.date, { day: "2-digit", month: "2-digit" })}
                  </p>
                </div>
                <TrafficBadge status={day.overallTrafficLight} compact />
              </div>
              <CalendarMarkBadges dateKey={day.date.toISOString().slice(0, 10)} calendar={calendar} className="mt-2" compact />

              <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-b border-[#edf0ec] pb-3 text-xs">
                <WeekMetric label="Eingeplant" value={day.plannedTotal} />
                <WeekMetric label="Verfügbar" value={day.availableTotal} />
                <WeekMetric label="Urlaub" value={day.absenceCounts.Urlaub} />
                <WeekMetric label="Krank" value={day.absenceCounts.Krank} />
                <WeekMetric
                  label="Sonstige Abwesenheit"
                  value={day.absenceCounts["Sonstige Abwesenheit"]}
                />
              </div>

              <div className="mt-3 space-y-2">
                {staffedShifts.map((shift) => {
                  const summary = day.shifts[shift];
                  return (
                    <div key={shift} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-[#68766d]">{shift} verfügbar</span>
                      <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums text-[#34443a]">
                        {summary.available} / {summary.minimum}
                        <span className={`size-2 rounded-full ${trafficDotStyles[summary.trafficLight]}`} aria-label={trafficLabels[summary.trafficLight]} />
                      </span>
                    </div>
                  );
                })}
              </div>
              {shortAreas.length > 0 && (
                <p className="mt-3 border-t border-[#edf0ec] pt-2 text-[10px] font-medium text-[#a33e31]">
                  Unterbesetzt: {shortAreas.join(", ")}
                </p>
              )}
              {day.plannedTotal === 0 && (
                <p className="mt-3 text-[10px] text-[#8a958d]">Keine Schicht geplant</p>
              )}
              <span className="sr-only">Tagesansicht öffnen</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CalendarMarkBadges({
  dateKey,
  calendar,
  className = "",
  compact = false,
}: {
  dateKey: string;
  calendar: CalendarData;
  className?: string;
  compact?: boolean;
}) {
  const marks = getCalendarMarks(dateKey, calendar);
  if (!marks.holiday && marks.companyDays.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {marks.holiday && (
        <span className={`rounded-md px-2 py-1 text-[11px] font-semibold ${holidayBadgeStyle}`}>
          {compact ? marks.holiday.name : `Feiertag: ${marks.holiday.name} – Besetzung laut Schichtplan`}
        </span>
      )}
      {marks.companyDays.map((entry) => (
        <span key={entry.id} className={`rounded-md px-2 py-1 text-[11px] font-semibold ${companyDayBadgeStyle}`}>
          {compact ? entry.name : `${companyDayTypeLabel(entry.type)}: ${entry.name}`}
        </span>
      ))}
    </div>
  );
}

function SectionHeading({ id, title }: { id: string; title: string }) {
  return <h2 id={id} className="text-base font-semibold">{title}</h2>;
}

function TrafficBadge({ status, compact = false }: { status: TrafficLight; compact?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${trafficStyles[status]}`}>
      <span className={`size-1.5 rounded-full ${trafficDotStyles[status]}`} />
      {compact ? status === "green" ? "Grün" : status === "yellow" ? "Gelb" : "Rot" : trafficLabels[status]}
    </span>
  );
}

function StatusBadge({ status }: { status: AttendanceStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${statusStyles[status] ?? "bg-[#eef0ed] text-[#66726a]"}`}>
      {status}
    </span>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-[#859189]">{label}</dt>
      <dd className="mt-0.5 truncate text-xs font-medium text-[#45544a]">{value}</dd>
    </div>
  );
}

function WeekMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <span className="text-[#7b897f]">{label}</span>
      <span className="float-right font-semibold tabular-nums text-[#34443a]">{value}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-[#cfd9d0] bg-white px-5 py-10 text-center">
      <p className="text-sm font-semibold text-[#34443a]">Keine Mitarbeiter gefunden</p>
      <p className="mt-1 text-xs text-[#77847b]">Für diesen Filter gibt es keine Treffer.</p>
    </div>
  );
}

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      className="size-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {direction === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

