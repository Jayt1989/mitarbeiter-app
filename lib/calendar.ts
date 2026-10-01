import {
  DEFAULT_COUNTRY,
  DEFAULT_STATE,
  getHoliday,
  type GermanState,
  type Holiday,
} from "./holidays";

/**
 * Kalendertage werden überall als „YYYY-MM-DD“ geführt und intern als UTC-Mitternacht gerechnet.
 * Nur „heute“ wird aus der aktuellen Uhrzeit in Europe/Berlin abgeleitet.
 */
export const CALENDAR_TIME_ZONE = "Europe/Berlin";

export function berlinNowParts(now: Date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: CALENDAR_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    year: Number(parts.year),
    hour: Number(parts.hour),
  };
}

export function berlinTodayKey() {
  return berlinNowParts().dateKey;
}

export function currentBerlinYear() {
  return berlinNowParts().year;
}

export function dateKeyToUtc(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export function addDaysToKey(dateKey: string, days: number) {
  const date = dateKeyToUtc(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Gleicher Kalendertag in einem anderen Jahr (29.02. wird zum 28.02.). */
export function moveDateKeyToYear(dateKey: string, year: number) {
  const month = Number(dateKey.slice(5, 7));
  const day = Number(dateKey.slice(8, 10));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

/** Kalenderwoche nach ISO 8601; das Wochenjahr kann vom Kalenderjahr abweichen. */
export function isoWeekInfo(dateKey: string) {
  const date = dateKeyToUtc(dateKey);
  const weekday = (date.getUTCDay() + 6) % 7;
  const monday = addDaysToKey(dateKey, -weekday);
  const thursday = dateKeyToUtc(addDaysToKey(monday, 3));
  const weekYear = thursday.getUTCFullYear();
  const january4 = `${String(weekYear).padStart(4, "0")}-01-04`;
  const firstMonday = addDaysToKey(january4, -((dateKeyToUtc(january4).getUTCDay() + 6) % 7));
  const week = 1 + Math.round(
    (dateKeyToUtc(monday).getTime() - dateKeyToUtc(firstMonday).getTime()) / (7 * 24 * 60 * 60 * 1000),
  );
  return { weekYear, week, monday, sunday: addDaysToKey(monday, 6) };
}

export function yearOptions(selectedYear: number, currentYear: number = currentBerlinYear()) {
  const start = Math.min(selectedYear, currentYear - 1);
  const end = Math.max(selectedYear, currentYear + 3);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export const companyDayTypes = [
  { id: "CLOSURE", label: "Betriebsruhe" },
  { id: "INVENTORY", label: "Inventur" },
  { id: "PLANT_HOLIDAY", label: "Werksurlaub" },
  { id: "STAFF_MEETING", label: "Betriebsversammlung" },
  { id: "SPECIAL_WORKDAY", label: "Sonderarbeitstag" },
  { id: "OTHER", label: "Sonstiger Sondertag" },
] as const;

export type CompanyDayType = (typeof companyDayTypes)[number]["id"];

export function companyDayTypeLabel(type: CompanyDayType) {
  return companyDayTypes.find((entry) => entry.id === type)?.label ?? type;
}

export function isCompanyDayType(value: unknown): value is CompanyDayType {
  return companyDayTypes.some((entry) => entry.id === value);
}

export type CompanyDay = {
  id: string;
  name: string;
  date: string;
  type: CompanyDayType;
  note: string;
  active: boolean;
};

export type CalendarData = {
  country: string;
  state: GermanState;
  companyDays: CompanyDay[];
};

export const defaultCalendarData: CalendarData = {
  country: DEFAULT_COUNTRY,
  state: DEFAULT_STATE,
  companyDays: [],
};

export type CalendarMarks = {
  holiday: Holiday | null;
  companyDays: CompanyDay[];
};

/** Feiertag und aktive Sondertage eines Kalendertags – reine Markierung, ändert keine Schicht. */
export function getCalendarMarks(dateKey: string, calendar: CalendarData): CalendarMarks {
  return {
    holiday: getHoliday(dateKey, calendar.state),
    companyDays: calendar.companyDays.filter((entry) => entry.active && entry.date === dateKey),
  };
}
