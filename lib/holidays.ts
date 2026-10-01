/** Gesetzliche Feiertage in Deutschland – zentrale Berechnung für Client und Server. */

export const germanStates = [
  { code: "BW", name: "Baden-Württemberg" },
  { code: "BY", name: "Bayern" },
  { code: "BE", name: "Berlin" },
  { code: "BB", name: "Brandenburg" },
  { code: "HB", name: "Bremen" },
  { code: "HH", name: "Hamburg" },
  { code: "HE", name: "Hessen" },
  { code: "MV", name: "Mecklenburg-Vorpommern" },
  { code: "NI", name: "Niedersachsen" },
  { code: "NW", name: "Nordrhein-Westfalen" },
  { code: "RP", name: "Rheinland-Pfalz" },
  { code: "SL", name: "Saarland" },
  { code: "SN", name: "Sachsen" },
  { code: "ST", name: "Sachsen-Anhalt" },
  { code: "SH", name: "Schleswig-Holstein" },
  { code: "TH", name: "Thüringen" },
] as const;

export type GermanState = (typeof germanStates)[number]["code"];

export const DEFAULT_COUNTRY = "DE";
export const DEFAULT_STATE: GermanState = "NW";

export type Holiday = {
  date: string;
  name: string;
};

export function isGermanState(value: unknown): value is GermanState {
  return germanStates.some((state) => state.code === value);
}

export function germanStateName(code: string) {
  return germanStates.find((state) => state.code === code)?.name ?? code;
}

function key(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

/** Ostersonntag nach der Gaußschen Osterformel (gregorianisch, anonymer Algorithmus). */
function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day);
}

function easterOffset(year: number, days: number) {
  return new Date(easterSunday(year) + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Buß- und Bettag: Mittwoch vor dem 23. November. */
function repentanceDay(year: number) {
  const date = new Date(Date.UTC(year, 10, 22));
  while (date.getUTCDay() !== 3) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

type HolidayRule = {
  name: string;
  date: (year: number) => string;
  states: readonly GermanState[] | "all";
  fromYear?: number;
};

const rules: HolidayRule[] = [
  { name: "Neujahr", date: (y) => key(y, 1, 1), states: "all" },
  { name: "Heilige Drei Könige", date: (y) => key(y, 1, 6), states: ["BW", "BY", "ST"] },
  { name: "Internationaler Frauentag", date: (y) => key(y, 3, 8), states: ["BE"], fromYear: 2019 },
  { name: "Internationaler Frauentag", date: (y) => key(y, 3, 8), states: ["MV"], fromYear: 2023 },
  { name: "Karfreitag", date: (y) => easterOffset(y, -2), states: "all" },
  { name: "Ostersonntag", date: (y) => easterOffset(y, 0), states: ["BB"] },
  { name: "Ostermontag", date: (y) => easterOffset(y, 1), states: "all" },
  { name: "Tag der Arbeit", date: (y) => key(y, 5, 1), states: "all" },
  { name: "Christi Himmelfahrt", date: (y) => easterOffset(y, 39), states: "all" },
  { name: "Pfingstsonntag", date: (y) => easterOffset(y, 49), states: ["BB"] },
  { name: "Pfingstmontag", date: (y) => easterOffset(y, 50), states: "all" },
  { name: "Fronleichnam", date: (y) => easterOffset(y, 60), states: ["BW", "BY", "HE", "NW", "RP", "SL"] },
  { name: "Mariä Himmelfahrt", date: (y) => key(y, 8, 15), states: ["SL"] },
  { name: "Weltkindertag", date: (y) => key(y, 9, 20), states: ["TH"], fromYear: 2019 },
  { name: "Tag der Deutschen Einheit", date: (y) => key(y, 10, 3), states: "all" },
  {
    name: "Reformationstag",
    date: (y) => key(y, 10, 31),
    states: ["BB", "MV", "SN", "ST", "TH", "HB", "HH", "NI", "SH"],
  },
  { name: "Allerheiligen", date: (y) => key(y, 11, 1), states: ["BW", "BY", "NW", "RP", "SL"] },
  { name: "Buß- und Bettag", date: repentanceDay, states: ["SN"] },
  { name: "1. Weihnachtstag", date: (y) => key(y, 12, 25), states: "all" },
  { name: "2. Weihnachtstag", date: (y) => key(y, 12, 26), states: "all" },
];

const cache = new Map<string, Holiday[]>();

export function getHolidays(year: number, state: GermanState = DEFAULT_STATE): Holiday[] {
  const cacheKey = `${state}-${year}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const holidays = rules
    .filter((rule) => (rule.states === "all" || rule.states.includes(state)) && year >= (rule.fromYear ?? 0))
    .map((rule) => ({ date: rule.date(year), name: rule.name }))
    .sort((left, right) => left.date.localeCompare(right.date));
  cache.set(cacheKey, holidays);
  return holidays;
}

/** Feiertag für einen Kalendertag im Format YYYY-MM-DD. */
export function getHoliday(dateKey: string, state: GermanState = DEFAULT_STATE): Holiday | null {
  const year = Number(dateKey.slice(0, 4));
  return getHolidays(year, state).find((holiday) => holiday.date === dateKey) ?? null;
}

export function isHoliday(dateKey: string, state: GermanState = DEFAULT_STATE) {
  return getHoliday(dateKey, state) !== null;
}
