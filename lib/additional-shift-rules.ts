import { z } from "zod";
import { isValidDateKey } from "@/app/admin/assignments-data";
import { dateKeyToUtc } from "./calendar";
import { permitted } from "./access-policy";
import type { AuthorizationContext } from "./authorization";

export const additionalShiftPermissions = [
  "viewAdditionalShifts", "planAdditionalShifts", "releaseAdditionalShifts", "cancelAdditionalShifts",
] as const;
export type AdditionalShiftPermission = (typeof additionalShiftPermissions)[number];
export const additionalShiftInput = z.object({
  date: z.string().refine(isValidDateKey, "Bitte ein gültiges Datum auswählen.")
    .refine((date) => isValidDateKey(date) && [0, 6].includes(dateKeyToUtc(date).getUTCDay()), "Nur Samstag und Sonntag sind möglich."),
  shift: z.enum(["EARLY", "LATE", "NIGHT"]),
  departmentId: z.string().min(1).max(100),
  note: z.string().trim().max(500).default(""),
});
export const additionalShiftBatch = additionalShiftInput.extend({
  employeeIds: z.array(z.string().min(1).max(100)).min(1).max(100)
    .refine((ids) => new Set(ids).size === ids.length, "Mitarbeiter dürfen nur einmal gewählt werden."),
});
export type AdditionalShiftInput = z.infer<typeof additionalShiftInput>;
export type AdditionalShiftBatch = z.infer<typeof additionalShiftBatch>;
export type AdditionalShiftIssue = { employeeId: string; employeeName: string; message: string; blocking: boolean };
export class AdditionalShiftError extends Error {
  constructor(message: string, public readonly status = 400, public readonly issues: AdditionalShiftIssue[] = []) {
    super(message);
  }
}
export function canAdditionalShift(context: AuthorizationContext, permission: AdditionalShiftPermission) {
  return (context.role === "ADMIN" || context.role === "FOREMAN") && permitted(context, permission);
}
export function requireAdditionalShift(context: AuthorizationContext, permission: AdditionalShiftPermission) {
  if (!canAdditionalShift(context, permission)) throw new AdditionalShiftError("Keine Berechtigung für diese Zusatzschicht-Funktion.", 403);
}
