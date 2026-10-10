import { addDaysToKey, dateKeyToUtc } from "./calendar";
import type { ActiveShift } from "@/app/schichtplan/rotation";

export const shiftTimes: Record<ActiveShift, { start: number; end: number; nextDay: boolean }> = {
  Früh: { start: 6, end: 14, nextDay: false },
  Spät: { start: 14, end: 22, nextDay: false },
  Nacht: { start: 22, end: 6, nextDay: true },
};

const berlinParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function berlinTime(date: string, hour: number) {
  const wallTime = dateKeyToUtc(date).getTime() + hour * 3_600_000;
  let instant = wallTime;
  for (let iteration = 0; iteration < 3; iteration++) {
    const parts = Object.fromEntries(berlinParts.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
    const rendered = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    instant += wallTime - rendered;
  }
  return instant;
}

export function shiftInterval(date: string, shift: ActiveShift) {
  const times = shiftTimes[shift];
  return { start: berlinTime(date, times.start),
    end: berlinTime(times.nextDay ? addDaysToKey(date, 1) : date, times.end) };
}

export function intervalsOverlap(first: { start: number; end: number }, second: { start: number; end: number }) {
  return first.start < second.end && second.start < first.end;
}

export function shiftTimeLabel(shift: ActiveShift) {
  const times = shiftTimes[shift];
  return `${String(times.start).padStart(2, "0")}:00–${String(times.end).padStart(2, "0")}:00${times.nextDay ? " (Folgetag)" : ""}`;
}
