import type { Employee } from "../mitarbeiter/data";
import { toEmployeeShiftPlan } from "../mitarbeiter/schedule";
import { getShiftForDate } from "../schichtplan/rotation";
import { DEFAULT_STATE, isHoliday, type GermanState } from "../../lib/holidays";

export const vacationStatuses = [
  "Beantragt",
  "Genehmigt",
  "Abgelehnt",
  "Storniert",
] as const;

export type VacationStatus = (typeof vacationStatuses)[number];

export type VacationRequest = {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  daysRequested: number;
  requestedAt: string;
  status: VacationStatus;
  comment: string;
  decidedAt?: string;
};

export type ScheduledWorkday = {
  date: string;
  shift: "Früh" | "Spät" | "Nacht";
};

export const sampleVacationRequests: VacationRequest[] = [
  {
    id: "vacation-2001",
    employeeId: "employee-1001",
    startDate: "2026-10-12",
    endDate: "2026-10-13",
    daysRequested: 2,
    requestedAt: "2026-09-15T08:30:00.000Z",
    status: "Genehmigt",
    comment: "Familienbesuch",
    decidedAt: "2026-09-17T10:00:00.000Z",
  },
  {
    id: "vacation-2002",
    employeeId: "employee-1003",
    startDate: "2026-10-05",
    endDate: "2026-10-06",
    daysRequested: 2,
    requestedAt: "2026-09-01T09:15:00.000Z",
    status: "Genehmigt",
    comment: "",
    decidedAt: "2026-09-03T11:00:00.000Z",
  },
  {
    id: "vacation-2003",
    employeeId: "employee-1003",
    startDate: "2026-10-19",
    endDate: "2026-10-23",
    daysRequested: 5,
    requestedAt: "2026-09-22T07:45:00.000Z",
    status: "Beantragt",
    comment: "Herbstferien",
  },
  {
    id: "vacation-2004",
    employeeId: "employee-1002",
    startDate: "2026-09-07",
    endDate: "2026-09-11",
    daysRequested: 5,
    requestedAt: "2026-08-18T12:10:00.000Z",
    status: "Abgelehnt",
    comment: "Bitte einen späteren Zeitraum wählen.",
    decidedAt: "2026-08-20T09:00:00.000Z",
  },
  {
    id: "vacation-2005",
    employeeId: "employee-1004",
    startDate: "2026-11-02",
    endDate: "2026-11-06",
    daysRequested: 5,
    requestedAt: "2026-09-25T10:20:00.000Z",
    status: "Genehmigt",
    comment: "",
    decidedAt: "2026-09-26T08:00:00.000Z",
  },
];

function parseDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

export function getScheduledWorkdays(
  employee: Employee,
  startDate: string,
  endDate: string,
): ScheduledWorkday[] {
  if (!employee.isActive || startDate > endDate) return [];

  const workdays: ScheduledWorkday[] = [];
  const date = parseDate(startDate);
  const lastDate = parseDate(endDate);
  const plan = toEmployeeShiftPlan(employee);

  while (date <= lastDate) {
    const shift = getShiftForDate(date, plan);
    if (shift && shift !== "Frei") {
      workdays.push({ date: date.toISOString().slice(0, 10), shift });
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return workdays;
}

/** Arbeitstage laut Schichtplan, die als Urlaubstag zählen – gesetzliche Feiertage nicht. */
export function getVacationWorkdays(
  employee: Employee,
  startDate: string,
  endDate: string,
  state: GermanState = DEFAULT_STATE,
): ScheduledWorkday[] {
  return getScheduledWorkdays(employee, startDate, endDate).filter(
    (workday) => !isHoliday(workday.date, state),
  );
}

export function countVacationDays(
  employee: Employee,
  startDate: string,
  endDate: string,
  state: GermanState = DEFAULT_STATE,
): number {
  return getVacationWorkdays(employee, startDate, endDate, state).length;
}

export function countVacationDaysInYear(
  employee: Employee,
  request: VacationRequest,
  year: number,
  state: GermanState = DEFAULT_STATE,
): number {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const startDate = request.startDate < yearStart ? yearStart : request.startDate;
  const endDate = request.endDate > yearEnd ? yearEnd : request.endDate;

  if (startDate > endDate) return 0;
  return countVacationDays(employee, startDate, endDate, state);
}

export function requestsOverlap(
  firstStart: string,
  firstEnd: string,
  secondStart: string,
  secondEnd: string,
) {
  return firstStart <= secondEnd && firstEnd >= secondStart;
}
