export const shiftRotation = ["Früh", "Nacht", "Spät"] as const;
const twoShiftRotation = ["Früh", "Spät"] as const;

export type ActiveShift = (typeof shiftRotation)[number];
export type TwoShift = (typeof twoShiftRotation)[number];
export type Shift = ActiveShift | "Frei";
export type ShiftModelId =
  | "3-schicht"
  | "2-schicht"
  | "nur-frueh"
  | "nur-spaet"
  | "individuell";

export const shiftModelOptions = [
  { id: "3-schicht", label: "3-Schicht", startOptions: shiftRotation },
  { id: "2-schicht", label: "2-Schicht", startOptions: twoShiftRotation },
  { id: "nur-frueh", label: "Nur Früh" },
  { id: "nur-spaet", label: "Nur Spät" },
  { id: "individuell", label: "Individuell" },
] as const;

export const shiftModelLabels: Record<ShiftModelId, string> = {
  "3-schicht": "3-Schicht",
  "2-schicht": "2-Schicht",
  "nur-frueh": "Nur Früh",
  "nur-spaet": "Nur Spät",
  individuell: "Individuell",
};

export function describeShiftModel(employee: EmployeeShiftPlan) {
  const label = shiftModelLabels[employee.model];
  return "startShift" in employee
    ? `${label} · Start ${employee.startShift}`
    : label;
}

type EmployeeShiftBase = { employeeId: string };

export type EmployeeShiftPlan =
  | (EmployeeShiftBase & {
      model: "3-schicht";
      startShift: ActiveShift;
      anchorMonday: string;
    })
  | (EmployeeShiftBase & {
      model: "2-schicht";
      startShift: TwoShift;
      anchorMonday: string;
    })
  | (EmployeeShiftBase & { model: "nur-frueh" })
  | (EmployeeShiftBase & { model: "nur-spaet" })
  | (EmployeeShiftBase & {
      model: "individuell";
      assignments: Readonly<Record<string, Shift>>;
    });

const dayInMilliseconds = 24 * 60 * 60 * 1000;
const weekInMilliseconds = 7 * dayInMilliseconds;

function mondayFor(date: Date) {
  const monday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday;
}

function shiftForWeek<T extends string>(
  monday: Date,
  anchorMonday: string,
  startShift: T,
  rotation: readonly T[],
): T {
  const anchor = new Date(`${anchorMonday}T00:00:00.000Z`);
  const weekOffset = Math.round(
    (monday.getTime() - anchor.getTime()) / weekInMilliseconds,
  );
  const startIndex = rotation.indexOf(startShift);
  const rotationIndex =
    (startIndex + ((weekOffset % rotation.length) + rotation.length)) %
    rotation.length;

  return rotation[rotationIndex];
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function getShiftForDate(
  date: Date,
  employee: EmployeeShiftPlan,
): Shift | null {
  if (employee.model === "individuell") {
    return employee.assignments[dateKey(date)] ?? null;
  }

  const weekday = date.getUTCDay();

  if (weekday === 6) {
    return "Frei";
  }

  if (weekday === 0) {
    if (employee.model !== "3-schicht") {
      return "Frei";
    }

    const upcomingMonday = mondayFor(date);
    upcomingMonday.setUTCDate(upcomingMonday.getUTCDate() + 7);
    const upcomingShift = shiftForWeek(
      upcomingMonday,
      employee.anchorMonday,
      employee.startShift,
      shiftRotation,
    );

    return upcomingShift === "Nacht" ? "Nacht" : "Frei";
  }

  if (employee.model === "3-schicht") {
    return shiftForWeek(
      mondayFor(date),
      employee.anchorMonday,
      employee.startShift,
      shiftRotation,
    );
  }

  if (employee.model === "2-schicht") {
    return shiftForWeek(
      mondayFor(date),
      employee.anchorMonday,
      employee.startShift,
      twoShiftRotation,
    );
  }

  return employee.model === "nur-frueh" ? "Früh" : "Spät";
}