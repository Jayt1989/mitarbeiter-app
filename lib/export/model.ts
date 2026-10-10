import { addDaysToKey, getCalendarMarks, isoWeekInfo } from "@/lib/calendar";
import { germanStateName } from "@/lib/holidays";
import type { Employee } from "@/app/mitarbeiter/data";
import { toEmployeeShiftPlan } from "@/app/mitarbeiter/schedule";
import { getShiftForDate, type ActiveShift } from "@/app/schichtplan/rotation";
import { getAssignmentForDay } from "@/app/admin/assignments-data";
import { getDailyStaffing, staffedShifts } from "@/app/admin/staffing";
import type { AbsenceEntry } from "@/app/admin/staffing-data";
import { qualificationLevelLabels, type QualificationLevel } from "@/app/admin/qualifications-data";
import { countVacationDaysInYear } from "@/app/urlaub/vacation-data";
import type { ExportAbsence, ExportSource } from "./source";

export const cellKinds = [
  "Früh",
  "Spät",
  "Nacht",
  "Frei",
  "Urlaub",
  "Krank",
  "Schulung",
  "Sonderurlaub",
  "Freizeitausgleich",
  "Sonstige Abwesenheit",
  "Nicht geplant",
] as const;
export type CellKind = (typeof cellKinds)[number];

/** Farben wie im Jahres-Schichtplan der App (Hintergrund / Schrift). */
export const cellColors: Record<CellKind, { bg: string; fg: string }> = {
  Früh: { bg: "#e4f0fb", fg: "#245c87" },
  Spät: { bg: "#fff0df", fg: "#9a4c16" },
  Nacht: { bg: "#29395f", fg: "#ffffff" },
  Frei: { bg: "#ecefeb", fg: "#526056" },
  Urlaub: { bg: "#ccebd2", fg: "#174c2e" },
  Krank: { bg: "#fce4e2", fg: "#9b342b" },
  Schulung: { bg: "#d9f2ef", fg: "#146b66" },
  Sonderurlaub: { bg: "#f8e3ed", fg: "#91405e" },
  Freizeitausgleich: { bg: "#f1eeea", fg: "#716454" },
  "Sonstige Abwesenheit": { bg: "#f1eeea", fg: "#716454" },
  "Nicht geplant": { bg: "#ffffff", fg: "#87928b" },
};

export const cellShortLabels: Record<CellKind, string> = {
  Früh: "F",
  Spät: "S",
  Nacht: "N",
  Frei: "fr",
  Urlaub: "U",
  Krank: "K",
  Schulung: "Sch",
  Sonderurlaub: "SU",
  Freizeitausgleich: "FZA",
  "Sonstige Abwesenheit": "Abw",
  "Nicht geplant": "",
};

export const HOLIDAY_COLOR = "#c54d3f";
export const COMPANY_DAY_COLOR = "#9272b6";
export const weekdayNames = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export type DayCell = {
  date: string;
  kind: CellKind;
  label: string;
  shift: string | null;
  assignmentArea: string | null;
  holiday: string | null;
  companyDays: string[];
  additionalShift?: boolean;
};

export type ExportDay = {
  date: string;
  holiday: string | null;
  companyDays: string[];
};

export function formatDateDe(dateKey: string, options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }) {
  return new Intl.DateTimeFormat("de-DE", { ...options, timeZone: "UTC" }).format(
    new Date(`${dateKey}T00:00:00.000Z`),
  );
}

export function formatCreatedAt(now: Date = new Date()) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(now);
}

export function daysBetween(from: string, to: string) {
  const days: string[] = [];
  for (let date = from; date <= to; date = addDaysToKey(date, 1)) days.push(date);
  return days;
}

export function employeeName(employee: Pick<Employee, "firstName" | "lastName">) {
  return `${employee.firstName} ${employee.lastName}`;
}

function covers(entry: { startDate: string; endDate: string }, dateKey: string) {
  return entry.startDate <= dateKey && entry.endDate >= dateKey;
}

/** Index für schnelle Tagesabfragen bei vielen Mitarbeitern. */
function groupByEmployee<T extends { employeeId: string }>(entries: readonly T[]) {
  const map = new Map<string, T[]>();
  for (const entry of entries) {
    const list = map.get(entry.employeeId);
    if (list) list.push(entry);
    else map.set(entry.employeeId, [entry]);
  }
  return map;
}

export function createDayResolver(source: ExportSource) {
  const vacations = groupByEmployee(source.vacations.filter((entry) => entry.status === "Genehmigt"));
  const absences = groupByEmployee(source.absences.filter((entry) => entry.status !== "Beantragt"));
  const assignments = groupByEmployee(source.assignments);
  const plans = new Map(source.employees.map((employee) => [employee.id, toEmployeeShiftPlan(employee)]));

  function day(dateKey: string): ExportDay {
    const marks = getCalendarMarks(dateKey, source.calendar);
    return {
      date: dateKey,
      holiday: marks.holiday?.name ?? null,
      companyDays: marks.companyDays.map((entry) => entry.name),
    };
  }

  function cell(employee: Employee, dateKey: string): DayCell {
    const marks = day(dateKey);
    const base = { date: dateKey, holiday: marks.holiday, companyDays: marks.companyDays, assignmentArea: null };
    if (!employee.isActive) return { ...base, kind: "Nicht geplant", label: "Inaktiv", shift: null };

    const plan = plans.get(employee.id) ?? toEmployeeShiftPlan(employee);
    const shift = getShiftForDate(new Date(`${dateKey}T00:00:00.000Z`), plan);
    // Urlaub und Abwesenheiten haben Vorrang; ein Feiertag ändert die Schicht nicht.
    if (vacations.get(employee.id)?.some((entry) => covers(entry, dateKey))) {
      return { ...base, kind: "Urlaub", label: "Urlaub", shift };
    }
    const absence = absences.get(employee.id)?.find((entry) => covers(entry, dateKey));
    if (absence) return { ...base, kind: absence.kind, label: absence.kind, shift };
    if (shift === null) return { ...base, kind: "Nicht geplant", label: "–", shift };
    if (shift === "Frei") return { ...base, kind: "Frei", label: "Frei", shift };

    const assignment = getAssignmentForDay(employee.id, dateKey, shift, assignments.get(employee.id) ?? []);
    const additional = employee.additionalShifts?.[dateKey];
    return {
      ...base,
      kind: shift,
      label: additional ? `${shift} · Zusatzschicht · ${additional.departmentName}` : assignment ? `${shift} · ${assignment.areaName}` : shift,
      shift,
      assignmentArea: additional?.departmentName ?? assignment?.areaName ?? null,
      additionalShift: !!additional,
    };
  }

  return { day, cell };
}

export function areaNameOf(source: ExportSource, areaId: string | null) {
  return areaId ? source.areaConfiguration.areas.find((area) => area.id === areaId)?.name ?? "Unbekannter Bereich" : "Ohne Bereich";
}

/* ---------- Wochenplan ---------- */

export type WeekRow = {
  employee: Employee;
  areaName: string;
  cells: DayCell[];
};

export type WeekExport = {
  weekYear: number;
  week: number;
  monday: string;
  sunday: string;
  stateName: string;
  days: ExportDay[];
  groups: { areaId: string | null; areaName: string; rows: WeekRow[] }[];
  staffing: StaffingRow[];
  qualifications: QualificationRow[];
};

export type WeekFilter = {
  areaId: string | null;
  shift: ActiveShift | null;
};

export function buildWeekExport(source: ExportSource, dateKey: string, filter: WeekFilter): WeekExport {
  const info = isoWeekInfo(dateKey);
  const resolver = createDayResolver(source);
  const dates = daysBetween(info.monday, info.sunday);
  const areas = [
    ...source.areaConfiguration.areas.map((area) => ({ id: area.id as string | null, name: area.name })),
    { id: null, name: "Ohne Bereich" },
  ];

  const rows = source.employees.map((employee) => ({
    employee,
    areaName: areaNameOf(source, employee.areaId),
    cells: dates.map((date) => resolver.cell(employee, date)),
  }));
  const filteredRows = rows.filter((row) => {
    const inArea =
      filter.areaId === null ||
      row.employee.areaId === filter.areaId ||
      row.cells.some((cell) => cell.assignmentArea === areaNameOf(source, filter.areaId));
    const hasShift = filter.shift === null || row.cells.some((cell) => cell.shift === filter.shift);
    return inArea && hasShift;
  });

  return {
    weekYear: info.weekYear,
    week: info.week,
    monday: info.monday,
    sunday: info.sunday,
    stateName: germanStateName(source.calendar.state),
    days: dates.map(resolver.day),
    groups: areas
      .map((area) => ({
        areaId: area.id,
        areaName: area.name,
        rows: filteredRows.filter((row) => row.employee.areaId === area.id),
      }))
      .filter((group) => group.rows.length > 0),
    staffing: buildStaffingRows(source, dates, filter.areaId),
    qualifications: buildQualificationRows(source, filteredRows.map((row) => row.employee)),
  };
}

/* ---------- Personalbesetzung ---------- */

export type StaffingRow = {
  date: string;
  holiday: string | null;
  areaName: string;
  planned: number;
  available: number;
  vacation: number;
  sick: number;
  early: number;
  late: number;
  night: number;
  minimum: number;
  qualified: number;
  minimumQualified: number;
  status: "Ausreichend" | "Knapp" | "Unterbesetzt";
};

const statusLabels = { green: "Ausreichend", yellow: "Knapp", red: "Unterbesetzt" } as const;

function toStaffingAbsences(source: ExportSource): AbsenceEntry[] {
  const fromAbsence = (entry: ExportAbsence): AbsenceEntry => ({
    employeeId: entry.employeeId,
    startDate: entry.startDate,
    endDate: entry.endDate,
    type: entry.kind === "Freizeitausgleich" ? "Sonstige Abwesenheit" : entry.kind,
    approval: entry.status,
  });
  return [
    ...source.vacations
      .filter((entry) => entry.status === "Genehmigt")
      .map((entry): AbsenceEntry => ({
        employeeId: entry.employeeId,
        startDate: entry.startDate,
        endDate: entry.endDate,
        type: "Urlaub",
        approval: "Genehmigt",
      })),
    ...source.absences.filter((entry) => entry.status !== "Beantragt").map(fromAbsence),
  ];
}

export function buildStaffingRows(source: ExportSource, dates: string[], areaId: string | null): StaffingRow[] {
  const absences = toStaffingAbsences(source);
  const activeEmployees = source.employees.filter((employee) => employee.isActive);
  const rows: StaffingRow[] = [];

  for (const date of dates) {
    const staffing = getDailyStaffing(
      new Date(`${date}T00:00:00.000Z`),
      activeEmployees,
      absences,
      source.areaConfiguration,
      source.assignments,
    );
    const holiday = getCalendarMarks(date, source.calendar).holiday?.name ?? null;

    for (const area of source.areaConfiguration.areas.filter((entry) => entry.active)) {
      if (areaId !== null && area.id !== areaId) continue;
      const perShift = staffedShifts.map((shift) => staffing.shifts[shift].areas.find((entry) => entry.area.id === area.id));
      const sum = (pick: (entry: NonNullable<(typeof perShift)[number]>) => number) =>
        perShift.reduce((total, entry) => total + (entry ? pick(entry) : 0), 0);
      const inArea = staffing.employees.filter((entry) => entry.effectiveAreaId === area.id);
      const lights = perShift.flatMap((entry) => (entry ? [entry.trafficLight] : []));
      const worst = lights.includes("red") ? "red" : lights.includes("yellow") ? "yellow" : "green";

      rows.push({
        date,
        holiday,
        areaName: area.name,
        planned: sum((entry) => entry.planned),
        available: sum((entry) => entry.available),
        vacation: inArea.filter((entry) => entry.absenceType === "Urlaub").length,
        sick: inArea.filter((entry) => entry.absenceType === "Krank").length,
        early: perShift[0]?.available ?? 0,
        late: perShift[1]?.available ?? 0,
        night: perShift[2]?.available ?? 0,
        minimum: sum((entry) => entry.minimum),
        qualified: sum((entry) => entry.qualifiedAvailable),
        minimumQualified: sum((entry) => entry.requiredQualified),
        status: statusLabels[worst],
      });
    }
  }
  return rows;
}

/* ---------- Qualifikationen ---------- */

export type QualificationRow = {
  name: string;
  personnelNumber: string;
  areaName: string;
  qualification: string;
  level: number;
  description: string;
};

export function buildQualificationRows(source: ExportSource, employees: readonly Employee[]): QualificationRow[] {
  return employees.flatMap((employee) =>
    Object.entries(employee.qualifications ?? {})
      .filter(([, level]) => level > 0)
      .map(([qualificationId, level]) => ({
        name: employeeName(employee),
        personnelNumber: employee.personnelNumber,
        areaName: areaNameOf(source, employee.areaId),
        qualification: source.qualificationNames.get(qualificationId) ?? "Unbekannt",
        level,
        description: qualificationLevelLabels[Math.min(3, level) as QualificationLevel],
      }))
      .sort((left, right) => left.qualification.localeCompare(right.qualification, "de")),
  );
}

/* ---------- Jahresplan ---------- */

export type YearExport = {
  year: number;
  employee: Employee;
  areaName: string;
  stateName: string;
  months: { name: string; cells: (DayCell | null)[] }[];
  holidays: ExportDay[];
  assignments: { areaName: string; startDate: string; endDate: string; shift: string; additionalShift?: boolean }[];
};

export function buildYearExport(source: ExportSource, employee: Employee, year: number): YearExport {
  const resolver = createDayResolver(source);
  const months = Array.from({ length: 12 }, (_, monthIndex) => {
    const dayCount = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    return {
      name: new Intl.DateTimeFormat("de-DE", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, monthIndex, 1))),
      cells: Array.from({ length: 31 }, (_, index) => {
        if (index >= dayCount) return null;
        const dateKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`;
        return resolver.cell(employee, dateKey);
      }),
    };
  });

  return {
    year,
    employee,
    areaName: areaNameOf(source, employee.areaId),
    stateName: germanStateName(source.calendar.state),
    months,
    holidays: daysBetween(`${year}-01-01`, `${year}-12-31`)
      .map(resolver.day)
      .filter((day) => day.holiday || day.companyDays.length > 0),
    assignments: [...source.assignments
      .filter((entry) => entry.employeeId === employee.id)
      .map((entry) => ({
        areaName: entry.areaName,
        startDate: entry.startDate,
        endDate: entry.endDate,
        shift: entry.shift ?? "Alle Schichten",
      })),
      ...Object.entries(employee.additionalShifts ?? {})
        .filter(([date]) => date >= `${year}-01-01` && date <= `${year}-12-31`)
        .map(([date, entry]) => ({
          areaName: entry.departmentName,
          startDate: date,
          endDate: date,
          shift: entry.shift,
          additionalShift: true,
        })),
    ],
  };
}

/* ---------- Urlaubsübersicht ---------- */

export type VacationAccountInput = { employeeId: string; annualAllowance: number; carryOverDays: number };

export type VacationExport = {
  year: number;
  rows: {
    name: string;
    personnelNumber: string;
    areaName: string;
    annualAllowance: number;
    carryOverDays: number;
    approved: number;
    requested: number;
    remaining: number;
  }[];
  periods: { name: string; personnelNumber: string; startDate: string; endDate: string; days: number; status: string }[];
};

export function buildVacationExport(source: ExportSource, year: number, accounts: VacationAccountInput[]): VacationExport {
  const state = source.calendar.state;
  const employees = new Map(source.employees.map((employee) => [employee.id, employee]));
  const rows = source.employees.map((employee) => {
    const account = accounts.find((entry) => entry.employeeId === employee.id);
    const own = source.vacations.filter((entry) => entry.employeeId === employee.id);
    const days = (status: string) =>
      own.filter((entry) => entry.status === status).reduce((sum, entry) => sum + countVacationDaysInYear(employee, entry, year, state), 0);
    const annualAllowance = account?.annualAllowance ?? employee.annualLeaveAllowance;
    const carryOverDays = account?.carryOverDays ?? employee.carryOverLeaveDays;
    const approved = days("Genehmigt");
    const requested = days("Beantragt");
    return {
      name: employeeName(employee),
      personnelNumber: employee.personnelNumber,
      areaName: areaNameOf(source, employee.areaId),
      annualAllowance,
      carryOverDays,
      approved,
      requested,
      remaining: annualAllowance + carryOverDays - approved - requested,
    };
  });

  return {
    year,
    rows,
    periods: source.vacations.flatMap((entry) => {
      const employee = employees.get(entry.employeeId);
      if (!employee) return [];
      return [{
        name: employeeName(employee),
        personnelNumber: employee.personnelNumber,
        startDate: entry.startDate,
        endDate: entry.endDate,
        days: countVacationDaysInYear(employee, entry, year, state),
        status: entry.status,
      }];
    }),
  };
}

/* ---------- Abwesenheitsübersicht ---------- */

export type AbsenceExport = {
  title: string;
  from: string;
  to: string;
  rows: {
    name: string;
    personnelNumber: string;
    areaName: string;
    kind: string;
    startDate: string;
    endDate: string;
    days: number;
    status: string;
  }[];
};

export function buildAbsenceExport(source: ExportSource, title: string, areaId: string | null): AbsenceExport {
  const employees = new Map(source.employees.map((employee) => [employee.id, employee]));
  const clipStart = (date: string) => (date < source.from ? source.from : date);
  const clipEnd = (date: string) => (date > source.to ? source.to : date);

  return {
    title,
    from: source.from,
    to: source.to,
    rows: source.absences.flatMap((entry) => {
      const employee = employees.get(entry.employeeId);
      if (!employee || (areaId !== null && employee.areaId !== areaId)) return [];
      return [{
        name: employeeName(employee),
        personnelNumber: employee.personnelNumber,
        areaName: areaNameOf(source, employee.areaId),
        kind: entry.kind,
        startDate: entry.startDate,
        endDate: entry.endDate,
        days: daysBetween(clipStart(entry.startDate), clipEnd(entry.endDate)).length,
        status: entry.status,
      }];
    }),
  };
}

/* ---------- Dateinamen ---------- */

export function safeFileNamePart(value: string) {
  return value
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
