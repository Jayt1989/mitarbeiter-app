import { prisma } from "@/lib/prisma";
import type { AuthorizationContext } from "@/lib/authorization";
import { isValidDateKey } from "@/app/admin/assignments-data";
import type { ActiveShift } from "@/app/schichtplan/rotation";
import { isoWeekInfo } from "@/lib/calendar";
import { getExportAccess } from "./access";
import { listPerformance, type PerformanceReportRow } from "@/lib/performance";
import { berlinTodayKey } from "@/lib/calendar";
import { canViewPerformance, parsePerformanceFilter } from "@/lib/performance-rules";
import { loadExportSource } from "./source";
import {
  buildAbsenceExport,
  buildVacationExport,
  buildWeekExport,
  buildYearExport,
  employeeName,
  safeFileNamePart,
  type AbsenceExport,
  type VacationExport,
  type WeekExport,
  type YearExport,
} from "./model";

export const exportTypes = ["week", "staffing", "year", "vacation", "absence", "performance"] as const;
export type ExportType = (typeof exportTypes)[number];

export class ExportError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type ExportResult =
  | { type: "week"; fileBase: string; data: WeekExport }
  | { type: "staffing"; fileBase: string; data: WeekExport }
  | { type: "year"; fileBase: string; data: YearExport }
  | { type: "vacation"; fileBase: string; data: VacationExport; withPeriods: boolean }
  | { type: "absence"; fileBase: string; data: AbsenceExport }
  | { type: "performance"; fileBase: string; data: { from: string; to: string; rows: PerformanceReportRow[] } };

type Params = { get(name: string): string | null };

const activeShifts: readonly ActiveShift[] = ["Früh", "Spät", "Nacht"];

function parseYear(value: string | null) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new ExportError(400, "Bitte ein gültiges Jahr wählen.");
  return year;
}

function parseArea(value: string | null) {
  return value && value !== "alle" ? value : null;
}

/** Prüft Berechtigungen serverseitig und erstellt die Exportdaten aus PostgreSQL. */
export async function buildExport(context: AuthorizationContext, params: Params): Promise<ExportResult> {
  const access = getExportAccess(context);
  const type = params.get("type") as ExportType | null;
  if (!type || !exportTypes.includes(type)) throw new ExportError(400, "Unbekannte Exportart.");

  if (type === "performance") {
    if (!access.team || !canViewPerformance(context)) {
      throw new ExportError(403, "Für den Leistungsexport fehlt die Berechtigung.");
    }
    const filter = parsePerformanceFilter({
      von: params.get("von") ?? undefined, bis: params.get("bis") ?? undefined,
      bereich: params.get("bereich") ?? undefined, schicht: params.get("schicht") ?? undefined,
    }, berlinTodayKey(), isValidDateKey);
    return {
      type, fileBase: `Leistungen_${filter.from}_${filter.to}`,
      data: { from: filter.from, to: filter.to, rows: await listPerformance(filter) },
    };
  }

  if (type === "year") {
    const year = parseYear(params.get("year"));
    const requestedId = params.get("employeeId") || context.employeeId;
    if (!requestedId) throw new ExportError(400, "Bitte einen Mitarbeiter wählen.");
    const isOwn = requestedId === context.employeeId;
    if (!(access.team || (isOwn && access.own))) {
      throw new ExportError(403, "Sie dürfen nur Ihren eigenen Jahresplan exportieren.");
    }

    const source = await loadExportSource({
      from: `${year}-01-01`,
      to: `${year}-12-31`,
      employeeIds: [requestedId],
      includeInactive: true,
    });
    const employee = source.employees[0];
    if (!employee) throw new ExportError(404, "Mitarbeiter nicht gefunden.");
    return {
      type,
      fileBase: `Jahresplan_${safeFileNamePart(employeeName(employee))}_${year}`,
      data: buildYearExport(source, employee, year),
    };
  }

  if (!access.team) throw new ExportError(403, "Für diesen Export fehlt die Berechtigung.");
  const areaId = parseArea(params.get("area"));

  if (type === "week" || type === "staffing") {
    const date = params.get("date");
    if (!isValidDateKey(date)) throw new ExportError(400, "Bitte eine gültige Kalenderwoche wählen.");
    const shiftParam = params.get("shift");
    const shift = activeShifts.includes(shiftParam as ActiveShift) ? (shiftParam as ActiveShift) : null;
    const info = isoWeekInfo(date);
    const source = await loadExportSource({
      from: info.monday,
      to: info.sunday,
      includeInactive: params.get("inactive") === "1",
    });
    const data = buildWeekExport(source, date, { areaId, shift });
    const week = String(info.week).padStart(2, "0");
    return type === "week"
      ? { type, fileBase: `Wochenschichtplan_KW${week}_${info.weekYear}`, data }
      : { type, fileBase: `Personalbesetzung_KW${week}_${info.weekYear}`, data };
  }

  if (type === "vacation") {
    const year = parseYear(params.get("year"));
    const [source, accounts] = await Promise.all([
      loadExportSource({ from: `${year}-01-01`, to: `${year}-12-31` }),
      prisma.vacationAccount.findMany({ where: { year } }),
    ]);
    if (areaId) source.employees = source.employees.filter((employee) => employee.areaId === areaId);
    return {
      type,
      fileBase: `Urlaubsuebersicht_${year}`,
      data: buildVacationExport(source, year, accounts),
      withPeriods: params.get("periods") === "1",
    };
  }

  const year = parseYear(params.get("year"));
  const month = Number(params.get("month"));
  const hasMonth = Number.isInteger(month) && month >= 1 && month <= 12;
  const monthKey = String(month).padStart(2, "0");
  const from = hasMonth ? `${year}-${monthKey}-01` : `${year}-01-01`;
  const to = hasMonth
    ? new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
    : `${year}-12-31`;
  const source = await loadExportSource({ from, to, includeInactive: true });
  const title = hasMonth
    ? new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${from}T00:00:00.000Z`))
    : String(year);
  return {
    type: "absence",
    fileBase: `Abwesenheiten_${hasMonth ? `${year}-${monthKey}` : year}`,
    data: buildAbsenceExport(source, title, areaId),
  };
}
