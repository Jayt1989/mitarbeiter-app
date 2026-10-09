import type { AuthorizationContext } from "./authorization";
import type { Shift } from "@/app/schichtplan/rotation";

export const performanceAreas = [
  { id: "PICKING", label: "Kommissionieren", workstations: ["K01", "K02", "K03"] },
  { id: "PACKING", label: "Verpackung", workstations: ["VP1", "VP2", "VP3"] },
] as const;

export type PerformanceAreaId = (typeof performanceAreas)[number]["id"];

export const performanceAreaLabels: Record<PerformanceAreaId, string> = {
  PICKING: "Kommissionieren",
  PACKING: "Verpackung",
};

export const MAX_QUANTITY = 1_000_000;
/** Obergrenze je Eintrag und Summe je Schichttag (16 Stunden). */
export const MAX_SHIFT_MINUTES = 16 * 60;
export const MAX_NOTE_LENGTH = 500;
/** Bis zu dieser Stunde (Europe/Berlin) zählt eine Nachtschicht noch zum Vortag. */
export const NIGHT_SHIFT_END_HOUR = 6;

export class PerformanceError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export function canRecordPerformance(context: AuthorizationContext) {
  return context.employeeId !== null && context.permissions.recordPerformance === true;
}

export function canViewPerformance(context: AuthorizationContext) {
  return (context.role === "ADMIN" || context.role === "FOREMAN") &&
    context.permissions.viewPerformance === true;
}

export type PerformanceInput = {
  area: PerformanceAreaId;
  workstation: string;
  quantity: number;
  durationMinutes: number;
  note: string | null;
};

function wholeNumber(raw: string, label: string) {
  const value = raw.trim();
  if (!/^\d+$/.test(value)) throw new PerformanceError(`${label} muss eine ganze Zahl sein.`);
  return Number(value);
}

/** Prüft die Formulardaten. Datum, Mitarbeiter und Schicht kommen nie aus dem Formular. */
export function parsePerformanceInput(fields: {
  area: string; workstation: string; quantity: string; hours: string; minutes: string; note: string;
}): PerformanceInput {
  const area = performanceAreas.find((entry) => entry.id === fields.area);
  if (!area) throw new PerformanceError("Bitte einen Bereich auswählen.");
  if (!(area.workstations as readonly string[]).includes(fields.workstation)) {
    throw new PerformanceError(`Bitte einen Arbeitsplatz für ${area.label} auswählen.`);
  }
  if (!fields.quantity.trim()) throw new PerformanceError("Bitte eine Menge eingeben.");
  const quantity = wholeNumber(fields.quantity, "Die Menge");
  if (quantity < 1) throw new PerformanceError("Die Menge muss größer als 0 sein.");
  if (quantity > MAX_QUANTITY) throw new PerformanceError("Die Menge ist unplausibel hoch.");

  if (!fields.hours.trim() && !fields.minutes.trim()) {
    throw new PerformanceError("Bitte die Arbeitszeit eingeben.");
  }
  const hours = fields.hours.trim() ? wholeNumber(fields.hours, "Die Stunden") : 0;
  const minutes = fields.minutes.trim() ? wholeNumber(fields.minutes, "Die Minuten") : 0;
  if (minutes > 59) throw new PerformanceError("Die Minuten müssen zwischen 0 und 59 liegen.");
  const durationMinutes = hours * 60 + minutes;
  if (durationMinutes < 1) throw new PerformanceError("Die Arbeitszeit muss größer als 0 sein.");
  if (durationMinutes > MAX_SHIFT_MINUTES) {
    throw new PerformanceError("Die Arbeitszeit darf höchstens 16 Stunden betragen.");
  }

  const note = fields.note.trim();
  if (note.length > MAX_NOTE_LENGTH) {
    throw new PerformanceError(`Die Bemerkung darf höchstens ${MAX_NOTE_LENGTH} Zeichen lang sein.`);
  }
  return { area: area.id, workstation: fields.workstation, quantity, durationMinutes, note: note || null };
}

export type PlannedDay = {
  shift: Shift | null;
  vacation: boolean;
  absence: boolean;
};

export type ResolvedShift =
  | { ok: true; dateKey: string; shift: Exclude<Shift, "Frei"> }
  | { ok: false; dateKey: string; reason: string };

/**
 * Ermittelt den Schichttag für die Erfassung: normalerweise heute; vor 6 Uhr gehört die Arbeit
 * zur Nachtschicht des Vortags, sofern dort eine geplant war.
 */
export function resolvePerformanceShift(
  todayKey: string,
  hour: number,
  yesterdayKey: string,
  dayInfo: (dateKey: string) => PlannedDay,
): ResolvedShift {
  if (hour < NIGHT_SHIFT_END_HOUR) {
    const yesterday = dayInfo(yesterdayKey);
    if (yesterday.shift === "Nacht" && !yesterday.vacation && !yesterday.absence) {
      return { ok: true, dateKey: yesterdayKey, shift: "Nacht" };
    }
  }
  const today = dayInfo(todayKey);
  if (today.vacation) return { ok: false, dateKey: todayKey, reason: "Du hast heute Urlaub. Eine Leistungserfassung ist nicht möglich." };
  if (today.absence) return { ok: false, dateKey: todayKey, reason: "Für heute ist eine Abwesenheit eingetragen. Eine Leistungserfassung ist nicht möglich." };
  if (today.shift === null || today.shift === "Frei") {
    return { ok: false, dateKey: todayKey, reason: "Für heute ist keine Schicht geplant. Bitte wende dich an deinen Vorarbeiter." };
  }
  return { ok: true, dateKey: todayKey, shift: today.shift };
}

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} Min.`;
  return rest === 0 ? `${hours} Std.` : `${hours} Std. ${rest} Min.`;
}

/** Menge pro Stunde, auf eine Nachkommastelle gerundet. */
export function quantityPerHour(quantity: number, minutes: number) {
  return minutes > 0 ? Math.round((quantity * 600) / minutes) / 10 : 0;
}

export type PerformanceSummary = {
  key: string;
  label: string;
  detail: string | null;
  entries: number;
  quantity: number;
  durationMinutes: number;
  perHour: number;
};

/** Summiert Menge und Zeit je Schlüssel, sortiert nach Menge absteigend. */
export function summarizePerformance<T extends { quantity: number; durationMinutes: number }>(
  rows: readonly T[],
  group: (row: T) => { key: string; label: string; detail?: string | null },
): PerformanceSummary[] {
  const totals = new Map<string, PerformanceSummary>();
  for (const row of rows) {
    const { key, label, detail = null } = group(row);
    const current = totals.get(key) ?? { key, label, detail, entries: 0, quantity: 0, durationMinutes: 0, perHour: 0 };
    current.entries += 1;
    current.quantity += row.quantity;
    current.durationMinutes += row.durationMinutes;
    totals.set(key, current);
  }
  return [...totals.values()]
    .map((entry) => ({ ...entry, perHour: quantityPerHour(entry.quantity, entry.durationMinutes) }))
    .sort((a, b) => b.quantity - a.quantity || a.label.localeCompare(b.label, "de"));
}

export const MAX_REPORT_DAYS = 93;

/** Liest den Auswertungsfilter aus der URL; ungültige Werte fallen auf heute bzw. „alle“ zurück. */
export function parsePerformanceFilter(
  params: { von?: string; bis?: string; bereich?: string; schicht?: string },
  todayKey: string,
  isValidDateKey: (value: unknown) => value is string,
) {
  let from = isValidDateKey(params.von) ? params.von : todayKey;
  let to = isValidDateKey(params.bis) ? params.bis : from;
  if (to < from) [from, to] = [to, from];
  const spanDays = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  const limited = spanDays >= MAX_REPORT_DAYS;
  if (limited) {
    from = new Date(Date.parse(`${to}T00:00:00Z`) - (MAX_REPORT_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  }
  const area = performanceAreas.find((entry) => entry.id === params.bereich)?.id ?? null;
  const shift = (["Früh", "Spät", "Nacht"] as const).find((entry) => entry === params.schicht) ?? null;
  return { from, to, area, shift, limited };
}
