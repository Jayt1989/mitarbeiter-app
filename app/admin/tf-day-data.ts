export type TfDayAccountSummary = {
  employeeId: string;
  year: number;
  hasAccount: boolean;
  entitlement: number;
  approvedDays: number;
  pendingDays: number;
  remainingDays: number;
};

export function canRequestTfDay(
  permissions: { requestVacation?: boolean },
  account?: Pick<TfDayAccountSummary, "entitlement" | "remainingDays">,
) {
  return permissions.requestVacation === true &&
    (account?.entitlement ?? 0) > 0 &&
    (account?.remainingDays ?? 0) > 0;
}

export function summarizeTfDayBalance(
  entitlement: number,
  approvedDays: number,
  pendingDays: number,
) {
  return {
    approvedDays,
    pendingDays,
    remainingDays: entitlement - approvedDays - pendingDays,
  };
}

export function tfDayRequestError(
  entitlement: number,
  committedDays: number,
  requestedDays: number,
  year: number,
) {
  if (requestedDays === 0) return null;
  if (entitlement === 0) return `Für ${year} sind keine TF-Tage hinterlegt.`;
  if (committedDays + requestedDays > entitlement) {
    const remaining = Math.max(0, entitlement - committedDays);
    return `Für ${year} steht nur noch ${remaining} ${remaining === 1 ? "TF-Tag" : "TF-Tage"} zur Verfügung.`;
  }
  return null;
}
