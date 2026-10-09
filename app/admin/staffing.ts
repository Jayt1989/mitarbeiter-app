import type { Employee } from "../mitarbeiter/data";
import { toEmployeeShiftPlan } from "../mitarbeiter/schedule";
import { getShiftForDate, type ActiveShift, type Shift } from "../schichtplan/rotation";
import {
  absenceTypes,
  sampleAbsences,
  type AbsenceEntry,
  type AbsenceType,
} from "./staffing-data";
import type { VacationRequest } from "../urlaub/vacation-data";
import {
  sampleAreaConfiguration,
  type AreaConfiguration,
  type WorkArea,
} from "./areas-data";
import { QUALIFIED_LEVEL_THRESHOLD } from "./qualifications-data";
import { getAssignmentForDay, type TemporaryAssignment } from "./assignments-data";

export const staffedShifts: readonly ActiveShift[] = ["Früh", "Spät", "Nacht"];
export type TrafficLight = "green" | "yellow" | "red";
export type AttendanceStatus =
  | "Verfügbar"
  | AbsenceType
  | "Frei"
  | "Nicht geplant"
  | "Inaktiv";

export type EmployeeDay = {
  employee: Employee;
  shift: Shift | null;
  status: AttendanceStatus;
  absenceType: AbsenceType | null;
  /** Tatsächlicher Bereich an diesem Tag (Hauptbereich oder temporärer Einsatz). */
  effectiveAreaId: string | null;
  assignment: TemporaryAssignment | null;
};

export type ShiftStaffing = {
  planned: number;
  available: number;
  minimum: number;
  trafficLight: TrafficLight;
  areas: AreaShiftStaffing[];
};

export type AreaShiftStaffing = {
  area: WorkArea;
  planned: number;
  available: number;
  minimum: number;
  missing: number;
  extra: number;
  trafficLight: TrafficLight;
  staffingTrafficLight: TrafficLight;
  qualificationId: string | null;
  qualifiedAvailable: number;
  requiredQualified: number;
  qualifiedTrafficLight: TrafficLight | null;
};

export type DailyStaffing = {
  date: Date;
  totalEmployees: number;
  plannedTotal: number;
  availableTotal: number;
  freeTotal: number;
  absenceCounts: Record<AbsenceType, number>;
  shifts: Record<ActiveShift, ShiftStaffing>;
  overallTrafficLight: TrafficLight;
  employees: EmployeeDay[];
};

export type WeeklyStaffing = {
  weekNumber: number;
  startDate: Date;
  endDate: Date;
  days: DailyStaffing[];
};

export function getStaffingAbsences(
  requests: readonly VacationRequest[],
  recordedAbsences: readonly AbsenceEntry[] = sampleAbsences,
): AbsenceEntry[] {
  return [
    ...recordedAbsences,
    ...requests
      .filter((request) => request.status === "Genehmigt")
      .map((request) => ({
        employeeId: request.employeeId,
        startDate: request.startDate,
        endDate: request.endDate,
        type: "Urlaub" as const,
        approval: "Genehmigt" as const,
      })),
  ];
}

export function getTrafficLight(available: number, minimum: number): TrafficLight {
  if (available < minimum) return "red";
  if (available <= minimum + 1) return "yellow";
  return "green";
}

const trafficSeverity: Record<TrafficLight, number> = { green: 0, yellow: 1, red: 2 };

function worseTrafficLight(first: TrafficLight, second: TrafficLight): TrafficLight {
  return trafficSeverity[second] > trafficSeverity[first] ? second : first;
}

/** Wie viele Qualifikationsstufen ein Mitarbeiter für eine Qualifikation mitbringt. */
function qualificationLevelOf(employee: Employee, qualificationId: string): number {
  return employee.qualifications?.[qualificationId] ?? 0;
}

export function getAbsenceForDate(
  employeeId: string,
  dateKey: string,
  absences: readonly AbsenceEntry[],
): AbsenceType | null {
  const absence = absences.find(
    (entry) =>
      entry.employeeId === employeeId &&
      entry.startDate <= dateKey &&
      entry.endDate >= dateKey &&
      (entry.type !== "Urlaub" || entry.approval === "Genehmigt"),
  );

  return absence?.type ?? null;
}

export function getDailyStaffing(
  date: Date,
  employees: readonly Employee[],
  absences: readonly AbsenceEntry[],
  areaConfiguration: AreaConfiguration = sampleAreaConfiguration,
  assignments: readonly TemporaryAssignment[] = [],
): DailyStaffing {
  const normalizedDate = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dateKey = normalizedDate.toISOString().slice(0, 10);
  const dailyEmployees = employees.map((employee): EmployeeDay => {
    if (!employee.isActive) {
      return {
        employee,
        shift: null,
        status: "Inaktiv",
        absenceType: null,
        effectiveAreaId: employee.areaId,
        assignment: null,
      };
    }

    const shift = getShiftForDate(normalizedDate, toEmployeeShiftPlan(employee));
    const absenceType = getAbsenceForDate(employee.id, dateKey, absences);
    const status: AttendanceStatus = absenceType
      ? absenceType
      : shift === null
        ? "Nicht geplant"
        : shift === "Frei"
          ? "Frei"
          : "Verfügbar";
    const assignment = getAssignmentForDay(employee.id, dateKey, shift, assignments);

    return {
      employee,
      shift,
      status,
      absenceType,
      effectiveAreaId: assignment?.areaId ?? employee.areaId,
      assignment,
    };
  });
  const activeEmployees = dailyEmployees.filter(
    ({ employee }) => employee.isActive,
  );
  const absenceCounts = Object.fromEntries(
    absenceTypes.map((type) => [
      type,
      activeEmployees.filter((employee) => employee.absenceType === type).length,
    ]),
  ) as Record<AbsenceType, number>;
  const shifts = Object.fromEntries(
    staffedShifts.map((shift) => {
      const scheduled = activeEmployees.filter((employee) => employee.shift === shift);
      const available = scheduled.filter((employee) => employee.absenceType === null).length;
      const areaSummaries = areaConfiguration.areas
        .filter((area) => area.active)
        .map((area): AreaShiftStaffing => {
          const areaScheduled = scheduled.filter(
            (employee) => employee.effectiveAreaId === area.id,
          );
          const areaAvailable = areaScheduled.filter(
            (employee) => employee.absenceType === null,
          ).length;
          const shiftMinimum = areaConfiguration.minimums[area.id]?.[shift];
          const minimum = shiftMinimum?.minimum ?? 0;
          const qualificationId = shiftMinimum?.qualificationId ?? null;
          const requiredQualified = shiftMinimum?.minimumQualified ?? 0;
          const qualifiedAvailable = qualificationId
            ? areaScheduled.filter(
                (employee) =>
                  employee.absenceType === null &&
                  qualificationLevelOf(employee.employee, qualificationId) >= QUALIFIED_LEVEL_THRESHOLD,
              ).length
            : 0;
          const staffingTrafficLight = getTrafficLight(areaAvailable, minimum);
          const qualifiedTrafficLight =
            qualificationId && requiredQualified > 0
              ? getTrafficLight(qualifiedAvailable, requiredQualified)
              : null;
          const trafficLight = qualifiedTrafficLight
            ? worseTrafficLight(staffingTrafficLight, qualifiedTrafficLight)
            : staffingTrafficLight;

          return {
            area,
            planned: areaScheduled.length,
            available: areaAvailable,
            minimum,
            missing: Math.max(0, minimum - areaAvailable),
            extra: Math.max(0, areaAvailable - minimum),
            trafficLight,
            staffingTrafficLight,
            qualificationId,
            qualifiedAvailable,
            requiredQualified,
            qualifiedTrafficLight,
          };
        });
      const minimum = areaSummaries.reduce((sum, area) => sum + area.minimum, 0);
      const trafficLight = areaSummaries.some((area) => area.trafficLight === "red")
        ? "red"
        : areaSummaries.some((area) => area.trafficLight === "yellow")
          ? "yellow"
          : "green";

      return [
        shift,
        {
          planned: scheduled.length,
          available,
          minimum,
          trafficLight,
          areas: areaSummaries,
        },
      ];
    }),
  ) as Record<ActiveShift, ShiftStaffing>;
  const plannedTotal = staffedShifts.reduce(
    (total, shift) => total + shifts[shift].planned,
    0,
  );
  const availableTotal = staffedShifts.reduce(
    (total, shift) => total + shifts[shift].available,
    0,
  );
  const neededShifts = staffedShifts.flatMap((shift) =>
    shifts[shift].areas.map((area) => area.trafficLight),
  );
  const overallTrafficLight = neededShifts.includes("red")
    ? "red"
    : neededShifts.includes("yellow")
      ? "yellow"
      : "green";

  return {
    date: normalizedDate,
    totalEmployees: employees.length,
    plannedTotal,
    availableTotal,
    freeTotal: activeEmployees.filter((employee) => employee.status === "Frei").length,
    absenceCounts,
    shifts,
    overallTrafficLight,
    employees: dailyEmployees.sort((left, right) =>
      `${left.employee.lastName} ${left.employee.firstName}`.localeCompare(
        `${right.employee.lastName} ${right.employee.firstName}`,
        "de",
      ),
    ),
  };
}

function startOfWeek(date: Date) {
  const monday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function getIsoWeekNumber(date: Date) {
  const thursday = addDays(startOfWeek(date), 3);
  const firstThursday = startOfWeek(new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4)));
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 3);
  const millisecondsPerWeek = 7 * 24 * 60 * 60 * 1000;

  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / millisecondsPerWeek);
}

export function getWeeklyStaffing(
  date: Date,
  employees: readonly Employee[],
  absences: readonly AbsenceEntry[],
  areaConfiguration: AreaConfiguration = sampleAreaConfiguration,
  assignments: readonly TemporaryAssignment[] = [],
): WeeklyStaffing {
  const monday = startOfWeek(date);
  const days = Array.from({ length: 7 }, (_, index) =>
    getDailyStaffing(addDays(monday, index), employees, absences, areaConfiguration, assignments),
  );

  return {
    weekNumber: getIsoWeekNumber(monday),
    startDate: monday,
    endDate: days[6].date,
    days,
  };
}

export function formatDate(date: Date, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("de-DE", {
    ...options,
    timeZone: "UTC",
  }).format(date);
}
