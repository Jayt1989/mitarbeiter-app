import type { NotificationType } from "@prisma/client";

type NotificationContent = {
  title: string;
  message: string;
  type: NotificationType;
  link: string;
};
export type NotificationInput = NotificationContent & (
  | { employeeId: string; userId?: never }
  | { userId: string; employeeId?: never }
);

export function notificationDate(date: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
  }).format(date);
}

type Period = { employeeId: string; startDate: Date; endDate: Date };
type VacationRequestPeriod = Period & { id: string };

export function vacationRequestNotification(
  userId: string,
  employeeName: string,
  request: VacationRequestPeriod,
): NotificationInput {
  return {
    userId,
    title: "Neuer Urlaubsantrag",
    message: `Neuer Urlaubsantrag von ${employeeName} für ${notificationDate(request.startDate)} bis ${notificationDate(request.endDate)}.`,
    type: "VACATION_REQUESTED",
    link: `/admin/urlaub?request=${encodeURIComponent(request.id)}`,
  };
}

export function swapApprovalNotification(
  userId: string,
  swap: { id: string; requesterName: string; partnerName: string },
): NotificationInput {
  return {
    userId,
    title: "Schichttausch wartet auf Freigabe",
    message: `Schichttausch von ${swap.requesterName} und ${swap.partnerName} wartet auf Freigabe.`,
    type: "SWAP_AWAITING_APPROVAL",
    link: `/admin/schichttausch#swap-${encodeURIComponent(swap.id)}`,
  };
}

export function vacationNotification(
  request: Period,
  status: "APPROVED" | "REJECTED",
): NotificationInput {
  const decision = status === "APPROVED" ? "genehmigt" : "abgelehnt";
  return {
    employeeId: request.employeeId,
    title: status === "APPROVED" ? "Urlaub genehmigt" : "Urlaub abgelehnt",
    message: `Dein Urlaubsantrag vom ${notificationDate(request.startDate)} bis ${notificationDate(request.endDate)} wurde ${decision}.`,
    type: status === "APPROVED" ? "VACATION_APPROVED" : "VACATION_REJECTED",
    link: "/urlaub",
  };
}

export function shiftNotification(
  employeeId: string, date: Date, before: string | null, after: string,
): NotificationInput {
  return {
    employeeId,
    title: "Schicht geändert",
    message: before
      ? `Deine Schicht am ${notificationDate(date)} wurde von ${before} auf ${after} geändert.`
      : `Für dich wurde am ${notificationDate(date)} die Schicht ${after} eingetragen.`,
    type: "SHIFT_CHANGED",
    link: "/schichtplan",
  };
}

type Assignment = Period & { department: { name: string }; shift: string | null };

export function assignmentNotification(
  assignment: Assignment,
  action: "created" | "updated" | "cancelled",
  before?: Assignment,
): NotificationInput {
  const period = (entry: Period) => entry.startDate.getTime() === entry.endDate.getTime()
    ? `am ${notificationDate(entry.startDate)}`
    : `vom ${notificationDate(entry.startDate)} bis ${notificationDate(entry.endDate)}`;
  const details = (entry: Assignment) =>
    `${period(entry)} im Bereich ${entry.department.name}${entry.shift ? ` (Schicht ${entry.shift})` : ""}`;
  const messages = {
    created: `Du bist ${details(assignment)} eingeplant.`,
    updated: `Dein temporärer Einsatz wurde geändert: ${before ? `${details(before)} → ` : ""}${details(assignment)}.`,
    cancelled: `Dein temporärer Einsatz ${details(assignment)} wurde aufgehoben.`,
  };
  const types = {
    created: "ASSIGNMENT_CREATED",
    updated: "ASSIGNMENT_UPDATED",
    cancelled: "ASSIGNMENT_CANCELLED",
  } as const;
  return {
    employeeId: assignment.employeeId,
    title: action === "created" ? "Temporärer Einsatz" : action === "updated" ? "Einsatz geändert" : "Einsatz aufgehoben",
    message: messages[action],
    type: types[action],
    link: "/schichtplan",
  };
}

export function qualificationNotification(employeeId: string, name: string): NotificationInput {
  return {
    employeeId,
    title: "Schulung / Qualifikation eingetragen",
    message: `Für dich wurde die Schulung / Qualifikation ${name} eingetragen.`,
    type: "QUALIFICATION_ADDED",
    link: "/dashboard",
  };
}
