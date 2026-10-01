import type { Employee } from "../mitarbeiter/data";
import type { ActiveShift, Shift } from "../schichtplan/rotation";
import type { AreaConfiguration } from "./areas-data";
import { QUALIFIED_LEVEL_THRESHOLD } from "./qualifications-data";
import { berlinTodayKey } from "@/lib/calendar";

export const assignmentStatuses = ["Geplant", "Aktiv", "Beendet", "Storniert"] as const;
export type AssignmentStatus = (typeof assignmentStatuses)[number];

export type TemporaryAssignment = {
  id: string;
  employeeId: string;
  employeeName: string;
  primaryAreaId: string | null;
  primaryAreaName: string | null;
  areaId: string;
  areaName: string;
  startDate: string;
  endDate: string;
  shift: ActiveShift | null;
  note: string;
  createdByLogin: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
};

export type TemporaryAssignmentInput = {
  employeeId: string;
  areaId: string;
  startDate: string;
  endDate: string;
  shift: ActiveShift | null;
  note: string;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    datePattern.test(value) &&
    !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime())
  );
}

export function getAssignmentStatus(
  assignment: Pick<TemporaryAssignment, "startDate" | "endDate" | "cancelledAt">,
  todayKey: string,
): AssignmentStatus {
  if (assignment.cancelledAt) return "Storniert";
  if (todayKey < assignment.startDate) return "Geplant";
  if (todayKey > assignment.endDate) return "Beendet";
  return "Aktiv";
}

type ConflictCandidate = Pick<
  TemporaryAssignment,
  "employeeId" | "startDate" | "endDate" | "shift" | "cancelledAt"
> & { id?: string };

/** Zwei Einsätze widersprechen sich, wenn sich Zeitraum und Schicht überschneiden. */
export function assignmentsConflict(first: ConflictCandidate, second: ConflictCandidate) {
  if (first.id && first.id === second.id) return false;
  if (first.cancelledAt || second.cancelledAt) return false;
  if (first.employeeId !== second.employeeId) return false;
  const datesOverlap = first.startDate <= second.endDate && second.startDate <= first.endDate;
  const shiftsOverlap = first.shift === null || second.shift === null || first.shift === second.shift;
  return datesOverlap && shiftsOverlap;
}

/** Liefert den gültigen Einsatz für Mitarbeiter, Tag und tatsächliche Schicht. */
export function getAssignmentForDay(
  employeeId: string,
  dateKey: string,
  shift: Shift | null,
  assignments: readonly TemporaryAssignment[],
): TemporaryAssignment | null {
  if (shift === null || shift === "Frei") return null;
  return (
    assignments.find(
      (assignment) =>
        !assignment.cancelledAt &&
        assignment.employeeId === employeeId &&
        assignment.startDate <= dateKey &&
        assignment.endDate >= dateKey &&
        (assignment.shift === null || assignment.shift === shift),
    ) ?? null
  );
}

export type QualificationCheck = {
  qualificationId: string | null;
  level: number;
  status: "Geeignet" | "Eingeschränkt" | "Nicht qualifiziert" | "Keine Vorgabe";
};

/** Prüft die Qualifikation, die laut Mindestbesetzung im Zielbereich verlangt wird. */
export function checkAssignmentQualification(
  employee: Pick<Employee, "qualifications">,
  areaId: string,
  shift: ActiveShift | null,
  areaConfiguration: AreaConfiguration,
): QualificationCheck {
  const areaMinimums = areaConfiguration.minimums[areaId];
  const shiftsToCheck: ActiveShift[] = shift ? [shift] : ["Früh", "Spät", "Nacht"];
  const qualificationId =
    shiftsToCheck
      .map((entry) => areaMinimums?.[entry]?.qualificationId ?? null)
      .find((entry): entry is string => entry !== null) ?? null;

  if (!qualificationId) return { qualificationId: null, level: 0, status: "Keine Vorgabe" };

  const level = employee.qualifications?.[qualificationId] ?? 0;
  return {
    qualificationId,
    level,
    status:
      level >= QUALIFIED_LEVEL_THRESHOLD
        ? "Geeignet"
        : level > 0
          ? "Eingeschränkt"
          : "Nicht qualifiziert",
  };
}

export function todayKey() {
  return berlinTodayKey();
}
