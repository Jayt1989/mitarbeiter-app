"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NotificationBell from "@/app/components/notification-bell";
import type { Employee } from "../mitarbeiter/data";
import { sampleEmployees } from "../mitarbeiter/data";
import { employeeRepository } from "../mitarbeiter/repository";
import { getScheduledWorkdays, vacationStatuses, sampleVacationRequests, type VacationRequest, type VacationStatus } from "../urlaub/vacation-data";
import { vacationRepository } from "../urlaub/vacation-repository";
import { getDemoAdmin } from "../urlaub/session";
import { getDailyStaffing, getStaffingAbsences, getTrafficLight, type TrafficLight } from "./staffing";
import { areaRepository } from "./areas-repository";
import { sampleAreaConfiguration, type AreaConfiguration, type WorkArea } from "./areas-data";
import { berlinTodayKey, currentBerlinYear, yearOptions } from "@/lib/calendar";

const months = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1).padStart(2, "0"),
  label: new Intl.DateTimeFormat("de-DE", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2026, index, 1)),
  ),
}));
const statusStyles: Record<VacationStatus, string> = {
  Beantragt: "bg-[#fff3d9] text-[#886719]",
  Genehmigt: "bg-[#e7f3e9] text-[#256440]",
  Abgelehnt: "bg-[#fde9e7] text-[#a33e31]",
  Storniert: "bg-[#eef0ed] text-[#66726a]",
};
const trafficStyles: Record<TrafficLight, string> = {
  green: "bg-[#e7f3e9] text-[#256440]",
  yellow: "bg-[#fff3d9] text-[#886719]",
  red: "bg-[#fde9e7] text-[#a33e31]",
};

type PageView = "Anträge" | "Kalender";
type RequestFilter = "Alle" | VacationStatus;
type ShiftFilter = "Alle Schichten" | "Früh" | "Spät" | "Nacht";
type AreaFilter = "Alle Bereiche" | string;

type VacationImpact = {
  date: string;
  shift: "Früh" | "Spät" | "Nacht";
  area: WorkArea | null;
  before: number;
  after: number;
  minimum: number;
  trafficLight: TrafficLight;
};

function dateAtUtc(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(dateAtUtc(value));
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getRequestImpact(
  request: VacationRequest,
  employees: readonly Employee[],
  requests: readonly VacationRequest[],
  areaConfiguration: AreaConfiguration,
): VacationImpact[] {
  const employee = employees.find((entry) => entry.id === request.employeeId);
  if (!employee) return [];

  const otherApproved = requests.filter(
    (entry) => entry.status === "Genehmigt" && entry.id !== request.id,
  );
  const beforeAbsences = getStaffingAbsences(otherApproved);
  const afterAbsences = getStaffingAbsences([
    ...otherApproved,
    { ...request, status: "Genehmigt" },
  ]);
  const area = areaConfiguration.areas.find(
    (candidate) => candidate.id === employee.areaId && candidate.active,
  ) ?? null;

  return getScheduledWorkdays(employee, request.startDate, request.endDate).map(
    ({ date, shift }) => {
      const beforeStaffing = getDailyStaffing(dateAtUtc(date), employees, beforeAbsences, areaConfiguration).shifts[shift];
      const afterStaffing = getDailyStaffing(dateAtUtc(date), employees, afterAbsences, areaConfiguration).shifts[shift];
      const before = area
        ? beforeStaffing.areas.find((entry) => entry.area.id === area.id)?.available ?? 0
        : beforeStaffing.available;
      const after = area
        ? afterStaffing.areas.find((entry) => entry.area.id === area.id)?.available ?? 0
        : afterStaffing.available;
      const minimum = area ? areaConfiguration.minimums[area.id]?.[shift]?.minimum ?? 0 : 0;

      return {
        date,
        shift,
        area,
        before,
        after,
        minimum,
        trafficLight: area ? getTrafficLight(after, minimum) : "green",
      };
    },
  );
}

function employeeShiftMatches(
  employee: Employee | undefined,
  request: VacationRequest,
  shift: ShiftFilter,
) {
  if (shift === "Alle Schichten") return true;
  if (!employee) return false;
  return getScheduledWorkdays(employee, request.startDate, request.endDate).some(
    (workday) => workday.shift === shift,
  );
}

function getCalendarDays(year: number, month: number) {
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const dayCount = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return { firstWeekday, dayCount };
}

export default function VacationManagement() {
  const [employees, setEmployees] = useState<Employee[]>(sampleEmployees);
  const [requests, setRequests] = useState<VacationRequest[]>(sampleVacationRequests);
  const [pageView, setPageView] = useState<PageView>("Anträge");
  const [statusFilter, setStatusFilter] = useState<RequestFilter>("Alle");
  const [employeeFilter, setEmployeeFilter] = useState("Alle Mitarbeiter");
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>("Alle Schichten");
  const [areaFilter, setAreaFilter] = useState<AreaFilter>("Alle Bereiche");
  const [monthFilter, setMonthFilter] = useState("Alle Monate");
  const [yearFilter, setYearFilter] = useState("Alle Jahre");
  const [calendarDate, setCalendarDate] = useState(() => berlinTodayKey().slice(0, 7));
  const [selectedRequest, setSelectedRequest] = useState<VacationRequest | null>(null);
  const [decisionError, setDecisionError] = useState("");
  const [areaConfiguration, setAreaConfiguration] = useState<AreaConfiguration>(sampleAreaConfiguration);

  useEffect(() => {
    let isCurrent = true;

    void Promise.all([
      employeeRepository.loadAll(),
      vacationRepository.loadAll(),
      areaRepository.load(),
    ]).then(([storedEmployees, storedRequests, storedAreas]) => {
      if (!isCurrent) return;
      if (storedEmployees) setEmployees(storedEmployees);
      setRequests(storedRequests);
      setAreaConfiguration(storedAreas);
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  const admin = getDemoAdmin(employees);
  const canOpenAdmin = admin?.role === "Admin" && admin.permissions.openAdmin;
  const canViewOthers = admin?.permissions.otherVacations ?? false;
  const canApprove = admin?.permissions.approveVacation ?? false;
  const visibleRequests = requests.filter(
    (request) => canViewOthers || request.employeeId === admin?.id,
  );
  const filteredRequests = visibleRequests
    .filter((request) => statusFilter === "Alle" || request.status === statusFilter)
    .filter((request) => employeeFilter === "Alle Mitarbeiter" || request.employeeId === employeeFilter)
    .filter((request) => areaFilter === "Alle Bereiche" || employees.find((employee) => employee.id === request.employeeId)?.areaId === areaFilter)
    .filter((request) => monthFilter === "Alle Monate" || request.startDate.slice(5, 7) === monthFilter)
    .filter((request) => yearFilter === "Alle Jahre" || request.startDate.slice(0, 4) === yearFilter)
    .filter((request) =>
      employeeShiftMatches(
        employees.find((employee) => employee.id === request.employeeId),
        request,
        shiftFilter,
      ),
    )
    .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));

  const calendarParts = calendarDate.split("-");
  const calendarYear = yearFilter === "Alle Jahre" ? Number(calendarParts[0]) : Number(yearFilter);
  const calendarMonth = monthFilter === "Alle Monate" ? Number(calendarParts[1]) - 1 : Number(monthFilter) - 1;
  const calendar = getCalendarDays(calendarYear, calendarMonth);
  const calendarRequests = filteredRequests.filter(
    (request) => request.status === "Beantragt" || request.status === "Genehmigt",
  );
  async function decideRequest(status: "Genehmigt" | "Abgelehnt" | "Storniert") {
    if (!selectedRequest || !canApprove) return;

    try {
      const updatedRequest = await vacationRepository.decide(selectedRequest.id, status);
      setRequests((current) =>
        current.map((request) => (request.id === updatedRequest.id ? updatedRequest : request)),
      );
      setSelectedRequest(updatedRequest);
      setDecisionError("");
    } catch {
      setDecisionError("Die Entscheidung konnte nicht gespeichert werden.");
    }
  }

  function openRequest(request: VacationRequest) {
    setDecisionError("");
    setSelectedRequest(request);
  }

  const selectedEmployee = selectedRequest
    ? employees.find((employee) => employee.id === selectedRequest.employeeId)
    : undefined;
  const selectedArea = selectedEmployee?.areaId
    ? areaConfiguration.areas.find((area) => area.id === selectedEmployee.areaId && area.active) ?? null
    : null;
  const impacts = selectedRequest
    ? getRequestImpact(selectedRequest, employees, requests, areaConfiguration)
    : [];
  const hasShortage = impacts.some((impact) => impact.area !== null && impact.after < impact.minimum);

  if (!canOpenAdmin) {
    return (
      <main className="min-h-screen bg-[#f4f6f2] px-5 py-16 text-[#1c2b23]">
        <div className="mx-auto max-w-xl rounded-xl border border-[#e0e7e0] bg-white p-6 text-center">
          <h1 className="text-xl font-semibold">Kein Zugriff</h1>
          <p className="mt-2 text-sm text-[#68766d]">Für die Urlaubsverwaltung ist die Adminberechtigung erforderlich.</p>
          <Link href="/admin" className="mt-5 inline-flex rounded-lg bg-[#174c37] px-4 py-2.5 text-sm font-semibold text-white">Zur Personalbesetzung</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f6f2] text-[#1c2b23]">
      <header className="border-b border-[#dce4dc] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-8">
          <Link href="/admin" className="flex items-center gap-3 rounded-lg focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#174c37]">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#174c37] text-sm font-bold text-white">MA</span>
            <span className="hidden text-sm font-semibold tracking-[0.02em] sm:inline">MITARBEITERPORTAL</span>
          </Link>
          <nav className="flex items-center gap-2" aria-label="Hauptnavigation">
            <Link href="/admin" className="rounded-lg px-3 py-2 text-sm font-medium text-[#41634f] hover:bg-[#edf3ee]">Personalbesetzung</Link>
            <NotificationBell />
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-14 pt-8 sm:px-8 sm:pt-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.15em] text-[#668071]">ADMIN · URLAUBSPLANUNG</p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Urlaubsanträge</h1>
            <p className="mt-2 text-sm text-[#68766d]">Anträge prüfen und Auswirkungen auf die Besetzung sehen.</p>
          </div>
          <div className="flex h-11 w-fit items-center rounded-lg border border-[#dce4dc] bg-white p-1" aria-label="Urlaubsansicht">
            {(["Anträge", "Kalender"] as const).map((view) => (
              <button key={view} type="button" aria-pressed={pageView === view} onClick={() => setPageView(view)} className={`h-full rounded-md px-4 text-sm font-medium transition ${pageView === view ? "bg-[#e8f0e9] text-[#174c37]" : "text-[#68766d] hover:bg-[#f4f6f2]"}`}>
                {view}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[#526056]">Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as RequestFilter)} className={filterClass}>
              <option>Alle</option>
              {vacationStatuses.map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[#526056]">Mitarbeiter</span>
            <select value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)} className={filterClass}>
              <option>Alle Mitarbeiter</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.lastName}, {employee.firstName}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[#526056]">Bereich</span>
            <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)} className={filterClass}>
              <option>Alle Bereiche</option>
              {areaConfiguration.areas.filter((area) => area.active).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
              <option>Kein Bereich</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[#526056]">Schicht</span>
            <select value={shiftFilter} onChange={(event) => setShiftFilter(event.target.value as ShiftFilter)} className={filterClass}>
              <option>Alle Schichten</option>
              <option>Früh</option>
              <option>Spät</option>
              <option>Nacht</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[#526056]">Monat</span>
            <select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} className={filterClass}>
              <option>Alle Monate</option>
              {months.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[#526056]">Jahr</span>
            <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} className={filterClass}>
              <option>Alle Jahre</option>
              {yearOptions(currentBerlinYear()).map((year) => <option key={year}>{year}</option>)}
            </select>
          </label>
        </div>

        {pageView === "Anträge" ? (
          <section className="mt-6" aria-label="Liste der Urlaubsanträge">
            <p className="mb-3 text-xs text-[#77847b]" aria-live="polite">{filteredRequests.length} Anträge</p>
            <div className="hidden overflow-hidden rounded-xl border border-[#e0e7e0] bg-white md:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1150px] border-collapse text-left">
                  <thead className="bg-[#f8faf7] text-[10px] font-semibold uppercase tracking-[0.08em] text-[#77847b]">
                    <tr>
                      <th scope="col" className="px-4 py-3">Mitarbeiter</th>
                      <th scope="col" className="px-3 py-3">Personalnummer</th>
                      <th scope="col" className="px-3 py-3">Von</th>
                      <th scope="col" className="px-3 py-3">Bis</th>
                      <th scope="col" className="px-3 py-3">Urlaubstage</th>
                      <th scope="col" className="px-3 py-3">Beantragt am</th>
                      <th scope="col" className="px-3 py-3">Status</th>
                      <th scope="col" className="px-3 py-3">Bemerkung</th>
                      <th scope="col" className="px-3 py-3"><span className="sr-only">Aktion</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf0ec]">
                    {filteredRequests.map((request) => (
                      <VacationRow key={request.id} request={request} employee={employees.find((entry) => entry.id === request.employeeId)} onOpen={() => openRequest(request)} />
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredRequests.length === 0 && <EmptyState />}
            </div>
            <div className="space-y-3 md:hidden">
              {filteredRequests.map((request) => (
                <VacationCard key={request.id} request={request} employee={employees.find((entry) => entry.id === request.employeeId)} onOpen={() => openRequest(request)} />
              ))}
              {filteredRequests.length === 0 && <EmptyState />}
            </div>
          </section>
        ) : (
          <VacationCalendar
            year={calendarYear}
            month={calendarMonth}
            calendar={calendar}
            requests={calendarRequests}
            employees={employees}
            onMonthChange={(yearMonth) => setCalendarDate(yearMonth)}
            onOpen={openRequest}
          />
        )}
      </div>

      {selectedRequest && selectedEmployee && (
        <VacationDetailDialog
          request={selectedRequest}
          employee={selectedEmployee}
          area={selectedArea}
          impacts={impacts}
          hasShortage={hasShortage}
          canApprove={canApprove}
          error={decisionError}
          onClose={() => setSelectedRequest(null)}
          onDecide={decideRequest}
        />
      )}
    </main>
  );
}

const filterClass = "h-11 w-full rounded-lg border border-[#dce4dc] bg-white px-3 text-sm text-[#34443a] outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10";

function VacationRow({ request, employee, onOpen }: { request: VacationRequest; employee?: Employee; onOpen: () => void }) {
  return (
    <tr className="hover:bg-[#fbfcfa]">
      <td className="px-4 py-3.5 text-sm font-medium">{employee ? `${employee.firstName} ${employee.lastName}` : "Unbekannter Mitarbeiter"}</td>
      <td className="px-3 py-3.5 text-sm tabular-nums text-[#526056]">{employee?.personnelNumber ?? "–"}</td>
      <td className="px-3 py-3.5 text-sm">{formatDate(request.startDate)}</td>
      <td className="px-3 py-3.5 text-sm">{formatDate(request.endDate)}</td>
      <td className="px-3 py-3.5 text-sm tabular-nums">{request.daysRequested}</td>
      <td className="px-3 py-3.5 text-xs text-[#68766d]">{formatTimestamp(request.requestedAt)}</td>
      <td className="px-3 py-3.5"><StatusBadge status={request.status} /></td>
      <td className="max-w-52 truncate px-3 py-3.5 text-xs text-[#68766d]">{request.comment || "–"}</td>
      <td className="px-3 py-3.5 text-right"><button type="button" onClick={onOpen} className="rounded-md px-3 py-2 text-xs font-semibold text-[#286044] hover:bg-[#eaf2eb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]">Antrag öffnen</button></td>
    </tr>
  );
}

function VacationCard({ request, employee, onOpen }: { request: VacationRequest; employee?: Employee; onOpen: () => void }) {
  return (
    <article className="rounded-xl border border-[#e0e7e0] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{employee ? `${employee.firstName} ${employee.lastName}` : "Unbekannter Mitarbeiter"}</h2>
          <p className="mt-1 text-xs text-[#77847b]">{employee?.personnelNumber ?? "–"} · {request.daysRequested} Tage</p>
        </div>
        <StatusBadge status={request.status} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-[#edf0ec] pt-3">
        <Detail label="Von" value={formatDate(request.startDate)} />
        <Detail label="Bis" value={formatDate(request.endDate)} />
        <Detail label="Beantragt am" value={formatTimestamp(request.requestedAt)} />
        <Detail label="Bemerkung" value={request.comment || "–"} />
      </dl>
      <button type="button" onClick={onOpen} className="mt-4 min-h-10 w-full rounded-lg border border-[#ccdbcf] text-sm font-semibold text-[#286044] hover:bg-[#f4f8f4]">Antrag öffnen</button>
    </article>
  );
}

function VacationCalendar({ year, month, calendar, requests, employees, onMonthChange, onOpen }: {
  year: number;
  month: number;
  calendar: { firstWeekday: number; dayCount: number };
  requests: VacationRequest[];
  employees: Employee[];
  onMonthChange: (value: string) => void;
  onOpen: (request: VacationRequest) => void;
}) {
  const monthValue = String(month + 1).padStart(2, "0");
  const monthLabel = months[month]?.label ?? "";
  const days = [
    ...Array.from({ length: calendar.firstWeekday }, (_, index) => ({ key: `leer-${index}`, day: 0 })),
    ...Array.from({ length: calendar.dayCount }, (_, index) => ({ key: `tag-${index + 1}`, day: index + 1 })),
  ];
  const dayNames = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  function getEvents(day: number) {
    const date = `${year}-${monthValue}-${String(day).padStart(2, "0")}`;
    return requests.flatMap((request) => {
      if (request.startDate > date || request.endDate < date) return [];
      const employee = employees.find((entry) => entry.id === request.employeeId);
      if (!employee?.isActive) return [];
      const workday = getScheduledWorkdays(employee, date, date)[0];
      return workday ? [{ request, employee, shift: workday.shift }] : [];
    });
  }

  function moveMonth(offset: number) {
    const date = new Date(Date.UTC(year, month + offset, 1));
    onMonthChange(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <section className="mt-6" aria-label="Urlaubskalender">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-[#668071]">URLAUBSKALENDER</p>
          <h2 className="mt-1 text-lg font-semibold capitalize">{monthLabel} {year}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => moveMonth(-1)} aria-label="Vorheriger Monat" className="flex size-10 items-center justify-center rounded-lg border border-[#dce4dc] bg-white text-[#526056] hover:bg-[#f2f6f2]">
            <ArrowIcon direction="left" />
          </button>
          <input type="month" aria-label="Kalendermonat" value={`${year}-${monthValue}`} onChange={(event) => event.target.value && onMonthChange(event.target.value)} className="h-10 rounded-lg border border-[#dce4dc] bg-white px-3 text-sm outline-none focus:border-[#71937d]" />
          <button type="button" onClick={() => moveMonth(1)} aria-label="Nächster Monat" className="flex size-10 items-center justify-center rounded-lg border border-[#dce4dc] bg-white text-[#526056] hover:bg-[#f2f6f2]">
            <ArrowIcon direction="right" />
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#68766d]">
        <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-[#398557]" />Genehmigt</span>
        <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-[#d6a52d]" />Beantragt</span>
        <span className="text-[#77847b]">Zähler zeigen genehmigten Urlaub · Anträge sind separat markiert</span>
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-[#e0e7e0] bg-white md:block">
        <div className="grid grid-cols-7 border-b border-[#edf0ec] bg-[#f8faf7]">
          {dayNames.map((name, index) => <div key={name} className={`px-2 py-2.5 text-center text-xs font-semibold ${index > 4 ? "text-[#8d6b26]" : "text-[#77847b]"}`}>{name}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map(({ key, day }) => {
            if (!day) return <div key={key} className="min-h-28 border-b border-r border-[#edf0ec] bg-[#fafbf9]" />;
            const events = getEvents(day);
            const approvedCount = events.filter((event) => event.request.status === "Genehmigt").length;
            const pendingCount = events.filter((event) => event.request.status === "Beantragt").length;
            const weekday = (calendar.firstWeekday + day - 1) % 7;
            return (
              <div key={key} className={`min-h-28 min-w-0 border-b border-r border-[#edf0ec] p-2 ${weekday > 4 ? "bg-[#fffdf7]" : "bg-white"}`}>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold tabular-nums">{day}</span>
                  {approvedCount > 0 && <span className="rounded-full bg-[#e7f3e9] px-1.5 py-0.5 text-[9px] font-semibold text-[#256440]">{approvedCount} im Urlaub</span>}
                </div>
                {pendingCount > 0 && <p className="mt-0.5 text-[9px] text-[#886719]">{pendingCount} beantragt</p>}
                <div className="mt-1.5 space-y-1">
                  {events.map((event) => (
                    <button key={event.request.id} type="button" onClick={() => onOpen(event.request)} className={`block w-full truncate rounded px-1.5 py-1 text-left text-[9px] font-medium ${event.request.status === "Genehmigt" ? "bg-[#e7f3e9] text-[#256440]" : "bg-[#fff3d9] text-[#886719]"}`}>
                      {event.employee.firstName} {event.employee.lastName} · {event.shift}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2 md:hidden">
        {Array.from({ length: calendar.dayCount }, (_, index) => index + 1).map((day) => {
          const events = getEvents(day);
          if (events.length === 0) return null;
          const approvedCount = events.filter((event) => event.request.status === "Genehmigt").length;
          const date = `${year}-${monthValue}-${String(day).padStart(2, "0")}`;
          return (
            <article key={day} className="rounded-lg border border-[#e0e7e0] bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">{formatDate(date)}</p>
                <span className="text-xs text-[#256440]">{approvedCount} genehmigt</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {events.map((event) => <button key={event.request.id} type="button" onClick={() => onOpen(event.request)} className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${event.request.status === "Genehmigt" ? "bg-[#e7f3e9] text-[#256440]" : "bg-[#fff3d9] text-[#886719]"}`}>{event.employee.firstName} {event.employee.lastName} · {event.shift}</button>)}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function VacationDetailDialog({ request, employee, area, impacts, hasShortage, canApprove, error, onClose, onDecide }: {
  request: VacationRequest;
  employee: Employee;
  area: WorkArea | null;
  impacts: VacationImpact[];
  hasShortage: boolean;
  canApprove: boolean;
  error: string;
  onClose: () => void;
  onDecide: (status: "Genehmigt" | "Abgelehnt" | "Storniert") => void;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#10251c]/50 p-3 backdrop-blur-[2px] sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="vacation-detail-title" className="mx-auto my-2 flex max-h-[calc(100dvh-1.5rem)] max-w-3xl flex-col overflow-hidden rounded-xl border border-[#e0e7e0] bg-white shadow-2xl sm:my-6 sm:max-h-[calc(100dvh-3rem)]">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#e8ede8] px-5 py-4 sm:px-7">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.14em] text-[#668071]">ANTRAGSDETAILS</p>
            <h2 id="vacation-detail-title" className="mt-1 text-xl font-semibold">{employee.firstName} {employee.lastName}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Dialog schließen" className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[#68766d] hover:bg-[#f2f5f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-7">
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
            <Detail label="Personalnummer" value={employee.personnelNumber} />
            <Detail label="Bereich" value={area?.name ?? "Kein Bereich"} />
            <Detail label="Von" value={formatDate(request.startDate)} />
            <Detail label="Bis" value={formatDate(request.endDate)} />
            <Detail label="Urlaubstage" value={`${request.daysRequested}`} />
            <Detail label="Beantragt am" value={formatTimestamp(request.requestedAt)} />
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#859189]">Status</p><div className="mt-1"><StatusBadge status={request.status} /></div></div>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Bemerkung</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-[#68766d]">{request.comment || "Keine Bemerkung angegeben."}</p>
          </div>

          <section aria-labelledby="besetzungsfolgen-title">
            <div className="mb-3">
              <h3 id="besetzungsfolgen-title" className="text-sm font-semibold">Auswirkung auf die Personalbesetzung</h3>
              <p className="mt-1 text-xs text-[#77847b]">Nur tatsächliche Arbeitstage laut persönlichem Schichtplan.</p>
            </div>
            {hasShortage && (
              <p role="alert" className="mb-3 rounded-lg border border-[#efb8ad] bg-[#fff0ec] px-3.5 py-3 text-sm font-semibold text-[#a33e31]">
                Achtung: Durch die Genehmigung wird die Mindestbesetzung unterschritten.
              </p>
            )}
            {impacts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[#cfd9d0] px-4 py-5 text-sm text-[#68766d]">Für diesen Mitarbeiter sind in diesem Zeitraum keine geplanten Arbeitstage vorhanden.</p>
            ) : (
              <div className="space-y-2">
                {impacts.map((impact) => (
                  <article key={impact.date} className="rounded-lg border border-[#e0e7e0] bg-[#fbfcfa] p-3.5 sm:flex sm:items-center sm:justify-between sm:gap-4">
                    <div>
                      <p className="text-sm font-semibold">{formatDate(impact.date)} · {impact.area?.name ?? "Kein Bereich"} · {impact.shift}schicht</p>
                      <p className="mt-1 text-xs text-[#68766d]">Vor Urlaub: {impact.before} verfügbar · Nach Genehmigung: {impact.after} verfügbar · Mindestbesetzung: {impact.minimum}</p>
                    </div>
                    <TrafficBadge status={impact.trafficLight} />
                  </article>
                ))}
              </div>
            )}
          </section>
          {error && <p role="alert" className="rounded-lg border border-[#f0c8bd] bg-[#fff2ed] px-3 py-2.5 text-sm text-[#9f422d]">{error}</p>}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[#e8ede8] bg-white px-5 py-4 sm:flex-row sm:justify-between sm:px-7">
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-[#dce4dc] px-4 text-sm font-medium text-[#526056] hover:bg-[#f6f8f5]">Schließen</button>
          {canApprove && request.status === "Beantragt" && (
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button type="button" onClick={() => onDecide("Abgelehnt")} className="min-h-11 rounded-lg border border-[#e7c8c2] px-4 text-sm font-semibold text-[#9f422d] hover:bg-[#fff4f1]">Ablehnen</button>
              <button type="button" onClick={() => onDecide("Genehmigt")} className="min-h-11 rounded-lg bg-[#174c37] px-5 text-sm font-semibold text-white hover:bg-[#103d2b]">Genehmigen</button>
            </div>
          )}
          {canApprove && request.status === "Genehmigt" && (
            <button type="button" onClick={() => onDecide("Storniert")} className="min-h-11 rounded-lg border border-[#e7c8c2] px-4 text-sm font-semibold text-[#9f422d] hover:bg-[#fff4f1]">
              Genehmigung zurücknehmen
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: VacationStatus }) {
  return <span className={`inline-flex w-fit shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${statusStyles[status]}`}>{status}</span>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#859189]">{label}</p><p className="mt-1 break-words text-sm font-medium text-[#34443a]">{value}</p></div>;
}

function EmptyState() {
  return <div className="rounded-xl border border-dashed border-[#cfd9d0] bg-white px-5 py-12 text-center text-sm text-[#68766d]">Keine Urlaubsanträge für diese Filter gefunden.</div>;
}

function TrafficBadge({ status }: { status: TrafficLight }) {
  const label = status === "red" ? "Unterbesetzt" : status === "yellow" ? "Knapp besetzt" : "Ausreichend";
  const dot = status === "red" ? "bg-[#c54d3f]" : status === "yellow" ? "bg-[#d6a52d]" : "bg-[#398557]";
  return <span className={`mt-2 inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold sm:mt-0 ${trafficStyles[status]}`}><span className={`size-1.5 rounded-full ${dot}`} />{label}</span>;
}

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{direction === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}</svg>;
}
