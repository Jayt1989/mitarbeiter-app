import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { recordAuditLog } from "@/lib/audit";
import { employeeRelations, toEmployeeDto } from "@/lib/employee-mapper";
import { toVacationRequestDto } from "@/lib/vacation-mapper";
import { loadCalendarState } from "@/lib/calendar-server";
import { shiftModelLabels } from "@/app/schichtplan/rotation";
import { countVacationDaysInYear } from "@/app/urlaub/vacation-data";
import {
  isValidYear,
  MAX_VACATION_DAYS,
  type VacationYearEntry,
  type VacationYearRow,
} from "@/app/admin/vacation-years-data";

async function authorize() {
  const context = await getAuthorizationContext();
  if (!context) {
    return { context: null, error: NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 }) } as const;
  }
  if (!hasPermission(context, "manageVacationYears")) {
    return { context: null, error: NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 }) } as const;
  }
  return { context, error: null } as const;
}

async function loadRows(previousYear: number, nextYear: number): Promise<VacationYearRow[]> {
  const [records, accounts, approved, state] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true },
      include: employeeRelations,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.vacationAccount.findMany({ where: { year: { in: [previousYear, nextYear] } } }),
    prisma.vacationRequest.findMany({
      where: {
        status: "APPROVED",
        startDate: { lte: new Date(`${previousYear}-12-31T00:00:00.000Z`) },
        endDate: { gte: new Date(`${previousYear}-01-01T00:00:00.000Z`) },
      },
    }),
    loadCalendarState(),
  ]);

  return records.map((record) => {
    const employee = toEmployeeDto(record);
    const previous = accounts.find((entry) => entry.employeeId === employee.id && entry.year === previousYear);
    const next = accounts.find((entry) => entry.employeeId === employee.id && entry.year === nextYear);
    const annualAllowance = previous?.annualAllowance ?? employee.annualLeaveAllowance;
    const carryOverDays = previous?.carryOverDays ?? employee.carryOverLeaveDays;
    const approvedDays = approved
      .filter((entry) => entry.employeeId === employee.id)
      .map(toVacationRequestDto)
      .reduce((sum, request) => sum + countVacationDaysInYear(employee, request, previousYear, state), 0);

    return {
      employeeId: employee.id,
      name: `${employee.lastName}, ${employee.firstName}`,
      personnelNumber: employee.personnelNumber,
      shiftModel: shiftModelLabels[employee.shiftModel],
      shiftGroup: employee.shiftGroup,
      previous: {
        hasAccount: Boolean(previous),
        annualAllowance,
        carryOverDays,
        approvedDays,
        remainingDays: annualAllowance + carryOverDays - approvedDays,
      },
      next: {
        exists: Boolean(next),
        annualAllowance: next?.annualAllowance ?? annualAllowance,
        carryOverDays: next?.carryOverDays ?? 0,
      },
    };
  });
}

export async function GET(request: Request) {
  const { error } = await authorize();
  if (error) return error;

  const year = Number(new URL(request.url).searchParams.get("year"));
  if (!isValidYear(year) || !isValidYear(year - 1)) {
    return NextResponse.json({ error: "Ungültiges Jahr" }, { status: 400 });
  }

  return NextResponse.json(await loadRows(year - 1, year));
}

export async function POST(request: Request) {
  const { context, error } = await authorize();
  if (error) return error;

  const body = (await request.json().catch(() => null)) as {
    year?: unknown;
    entries?: unknown;
    confirmCarryOver?: unknown;
  } | null;
  if (!isValidYear(body?.year) || !Array.isArray(body.entries)) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const year = body.year;
  const isDays = (value: unknown): value is number =>
    typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_VACATION_DAYS;

  const entries = body.entries as Partial<VacationYearEntry>[];
  if (!entries.every((entry) => typeof entry.employeeId === "string" && isDays(entry.annualAllowance) && isDays(entry.carryOverDays))) {
    return NextResponse.json({ error: "Bitte gültige Urlaubstage (0–365) angeben." }, { status: 400 });
  }
  if (entries.some((entry) => (entry.carryOverDays ?? 0) > 0) && body.confirmCarryOver !== true) {
    return NextResponse.json(
      { error: "Die Übernahme von Resturlaub muss ausdrücklich bestätigt werden." },
      { status: 400 },
    );
  }

  const activeIds = new Set(
    (await prisma.employee.findMany({ where: { isActive: true }, select: { id: true } })).map((entry) => entry.id),
  );
  let saved = 0;

  for (const entry of entries as VacationYearEntry[]) {
    if (!activeIds.has(entry.employeeId)) continue;
    const before = await prisma.vacationAccount.findUnique({
      where: { employeeId_year: { employeeId: entry.employeeId, year } },
    });
    const account = await prisma.vacationAccount.upsert({
      where: { employeeId_year: { employeeId: entry.employeeId, year } },
      update: { annualAllowance: entry.annualAllowance, carryOverDays: entry.carryOverDays },
      create: {
        employeeId: entry.employeeId,
        year,
        annualAllowance: entry.annualAllowance,
        carryOverDays: entry.carryOverDays,
      },
    });
    saved += 1;

    await recordAuditLog({
      actorUserId: context.userId,
      action: before ? "vacationAccount.update" : "vacationAccount.create",
      entityType: "VacationAccount",
      entityId: account.id,
      oldValues: before
        ? { year, annualAllowance: before.annualAllowance, carryOverDays: before.carryOverDays }
        : null,
      newValues: {
        employeeId: account.employeeId,
        year,
        annualAllowance: account.annualAllowance,
        carryOverDays: account.carryOverDays,
      },
    });
  }

  return NextResponse.json({ saved, rows: await loadRows(year - 1, year) });
}
