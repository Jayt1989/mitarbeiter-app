import type { ShiftSwapStatus } from "@prisma/client";
import type { AuthorizationContext } from "./authorization";
import type { Shift } from "@/app/schichtplan/rotation";

export const openSwapStatuses = ["ANGEFRAGT", "PARTNER_BESTAETIGT"] as const;
export const swapStatusLabels: Record<ShiftSwapStatus, string> = {
  ANGEFRAGT: "Angefragt",
  PARTNER_BESTAETIGT: "Partner bestätigt",
  PARTNER_ABGELEHNT: "Partner abgelehnt",
  GENEHMIGT: "Genehmigt",
  ABGELEHNT: "Abgelehnt",
  STORNIERT: "Storniert",
};
export type SwapAction = "confirm" | "decline" | "approve" | "reject" | "cancel";

export class ShiftSwapError extends Error {
  constructor(message: string, public readonly status = 409, public readonly warnings: string[] = []) {
    super(message);
  }
}

export function canReviewShiftSwaps(context: AuthorizationContext) {
  return (context.role === "ADMIN" || context.role === "FOREMAN") &&
    context.permissions.approveShiftSwap === true;
}

export function canRequestShiftSwaps(context: AuthorizationContext) {
  return context.employeeId !== null && context.permissions.requestShiftSwap === true;
}

type SwapState = { requesterId: string; partnerId: string; status: ShiftSwapStatus };

export function swapTransition(
  context: AuthorizationContext, swap: SwapState, action: SwapAction,
): ShiftSwapStatus {
  const ownAccess = canRequestShiftSwaps(context);
  if (action === "confirm" || action === "decline") {
    if (!ownAccess || context.employeeId !== swap.partnerId) {
      throw new ShiftSwapError("Nur der Tauschpartner darf diese Anfrage beantworten.", 403);
    }
    if (swap.status !== "ANGEFRAGT") throw new ShiftSwapError("Die Anfrage wurde bereits beantwortet.");
    return action === "confirm" ? "PARTNER_BESTAETIGT" : "PARTNER_ABGELEHNT";
  }
  if (action === "cancel") {
    if (!ownAccess || context.employeeId !== swap.requesterId) {
      throw new ShiftSwapError("Nur der Antragsteller darf die Anfrage stornieren.", 403);
    }
    if (!openSwapStatuses.some((status) => status === swap.status)) {
      throw new ShiftSwapError("Nur offene, noch nicht genehmigte Anfragen können storniert werden.");
    }
    return "STORNIERT";
  }
  if (!canReviewShiftSwaps(context)) throw new ShiftSwapError("Keine Berechtigung zur Freigabe.", 403);
  if (swap.status !== "PARTNER_BESTAETIGT") {
    throw new ShiftSwapError("Zuerst muss der Tauschpartner zustimmen.");
  }
  return action === "approve" ? "GENEHMIGT" : "ABGELEHNT";
}

export type SwapDayFacts = {
  name: string;
  active: boolean;
  shift: Shift | null;
  vacation: boolean;
  absence: boolean;
  manual: boolean;
  assignment: boolean;
  openSwap: boolean;
  additionalShift?: boolean;
};

export function swapDayWarnings(facts: SwapDayFacts): string[] {
  const prefix = `${facts.name}: `;
  const warnings: string[] = [];
  if (!facts.active) warnings.push(`${prefix}Mitarbeiter ist inaktiv.`);
  if (!facts.shift || facts.shift === "Frei") warnings.push(`${prefix}Keine Arbeitsschicht an diesem Tag.`);
  if (facts.vacation) warnings.push(`${prefix}Es besteht ein offener oder genehmigter Urlaubsantrag.`);
  if (facts.absence) warnings.push(`${prefix}An diesem Tag liegt eine Abwesenheit vor.`);
  if (facts.manual) warnings.push(`${prefix}Es besteht bereits eine manuelle Schichtzuweisung.`);
  if (facts.assignment) warnings.push(`${prefix}Es besteht ein temporärer Einsatz.`);
  if (facts.openSwap) warnings.push(`${prefix}Es besteht bereits eine offene Tauschanfrage für diesen Tag.`);
  if (facts.additionalShift) warnings.push(`${prefix}Es besteht eine Zusatzschicht. Diese muss über die Zusatzschichtplanung geändert werden.`);
  return warnings;
}
