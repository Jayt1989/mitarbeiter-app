import type { Prisma } from "@prisma/client";
import type { Employee } from "@/app/mitarbeiter/data";
import { toEmployeeShiftPlan } from "@/app/mitarbeiter/schedule";
import { getShiftForDate } from "@/app/schichtplan/rotation";
import { addDaysToKey, dateKeyToUtc } from "./calendar";
import { intervalsOverlap, shiftInterval } from "./shift-interval";
import { fromShiftCode } from "./employee-mapper";
import { AdditionalShiftError } from "./additional-shift-rules";

export async function assertNoAdditionalPeriod(db: Prisma.TransactionClient, employeeId: string, start: string, end: string) {
  const entries = await db.additionalShift.findMany({ where: {
    employeeId, status: { not: "STORNIERT" },
    date: { gte: dateKeyToUtc(addDaysToKey(start, -1)), lte: dateKeyToUtc(end) },
  } });
  if (entries.some((entry) => entry.date >= dateKeyToUtc(start) ||
    entry.shift === "NIGHT" && entry.date.toISOString().slice(0, 10) === addDaysToKey(start, -1))) {
    throw new AdditionalShiftError("Der Zeitraum kollidiert mit einer Zusatzschicht. Bitte diese zuerst ändern oder stornieren.", 409);
  }
}

export async function assertAdditionalRotation(db: Prisma.TransactionClient, employee: Employee) {
  const entries = await db.additionalShift.findMany({ where: { employeeId: employee.id, status: { not: "STORNIERT" } } });
  const basePlan = toEmployeeShiftPlan({ ...employee, additionalShifts: {} });
  for (const entry of entries) {
    const date = entry.date.toISOString().slice(0, 10);
    if (entry.shift === "OFF") throw new AdditionalShiftError("Ungültige Zusatzschicht.", 500);
    const additional = shiftInterval(date, fromShiftCode(entry.shift) as "Früh" | "Spät" | "Nacht");
    for (const day of [addDaysToKey(date, -1), date, addDaysToKey(date, 1)]) {
      const shift = getShiftForDate(dateKeyToUtc(day), basePlan);
      if (day === date && employee.individualAssignments?.[day] ||
        shift && shift !== "Frei" && (day === date || intervalsOverlap(additional, shiftInterval(day, shift)))) {
        throw new AdditionalShiftError("Die Schichtänderung kollidiert mit einer Zusatzschicht. Bitte diese zuerst ändern oder stornieren.", 409);
      }
    }
  }
}
