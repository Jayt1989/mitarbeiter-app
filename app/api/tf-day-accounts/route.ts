import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { recordAuditLog } from "@/lib/audit";
import { employeeRelations, toEmployeeDto } from "@/lib/employee-mapper";
import { loadCalendarState } from "@/lib/calendar-server";
import { countScheduledWorkdaysInYear } from "@/app/urlaub/vacation-data";
import { summarizeTfDayBalance, type TfDayAccountSummary } from "@/app/admin/tf-day-data";

const MAX_TF_DAYS = 365;
class TfDayEntitlementError extends Error {}

function isValidYear(year: unknown): year is number {
  return typeof year === "number" && Number.isInteger(year) && year >= 1900 && year <= 2200;
}

async function loadSummaries(year: number, employeeIds?: string[]): Promise<TfDayAccountSummary[]> {
  const from = new Date(`${year}-01-01T00:00:00.000Z`);
  const to = new Date(`${year}-12-31T00:00:00.000Z`);
  const where = employeeIds ? { id: { in: employeeIds }, isActive: true } : { isActive: true };
  const [employees, accounts, requests, calendarState] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: employeeRelations,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.tfDayAccount.findMany({ where: { year } }),
    prisma.vacationRequest.findMany({
      where: {
        employeeId: employeeIds ? { in: employeeIds } : undefined,
        requestType: "TF_DAY",
        status: { in: ["REQUESTED", "APPROVED"] },
        startDate: { lte: to },
        endDate: { gte: from },
      },
    }),
    loadCalendarState(),
  ]);

  return employees.map((record) => {
    const employee = toEmployeeDto(record);
    const account = accounts.find((entry) => entry.employeeId === record.id);
    const employeeRequests = requests.filter((entry) => entry.employeeId === record.id);
    const daysFor = (entry: (typeof employeeRequests)[number]) =>
      countScheduledWorkdaysInYear(
        employee,
        entry.startDate.toISOString().slice(0, 10),
        entry.endDate.toISOString().slice(0, 10),
        year,
        calendarState,
      );
    const approvedDays = employeeRequests
      .filter((entry) => entry.status === "APPROVED")
      .reduce((sum, entry) => sum + daysFor(entry), 0);
    const pendingDays = employeeRequests
      .filter((entry) => entry.status === "REQUESTED")
      .reduce((sum, entry) => sum + daysFor(entry), 0);
    const entitlement = account?.entitlement ?? 0;

    return {
      employeeId: record.id,
      year,
      hasAccount: Boolean(account),
      entitlement,
      ...summarizeTfDayBalance(entitlement, approvedDays, pendingDays),
    };
  });
}

export async function GET(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const canManage = ["ADMIN", "FOREMAN"].includes(context.role) &&
    hasPermission(context, "manageTfDayEntitlements");
  const canSeeOthers = canManage || hasPermission(context, "otherVacations") ||
    hasPermission(context, "approveVacation");
  const canSeeOwn = hasPermission(context, "ownVacation") || hasPermission(context, "requestVacation");
  if (!canSeeOthers && !canSeeOwn) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  if (!canSeeOthers && !context.employeeId) {
    return NextResponse.json({ error: "Kein Mitarbeiterkonto zugeordnet" }, { status: 403 });
  }

  const year = Number(new URL(request.url).searchParams.get("year"));
  if (!isValidYear(year)) return NextResponse.json({ error: "Ungültiges Jahr" }, { status: 400 });

  return NextResponse.json(await loadSummaries(year, canSeeOthers ? undefined : [context.employeeId!]));
}

export async function POST(request: Request) {
  const timingStartedAt = Date.now();
  let timingLastAt = timingStartedAt;
  const timings: Record<string, number> = {};
  const timingMark = (name: string) => {
    const now = Date.now();
    timings[name] = now - timingLastAt;
    timingLastAt = now;
  };

  const context = await getAuthorizationContext();
  timingMark("authorization");
  if (!context) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  if (!["ADMIN", "FOREMAN"].includes(context.role) ||
    !hasPermission(context, "manageTfDayEntitlements")) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as {
    employeeId?: unknown;
    year?: unknown;
    entitlement?: unknown;
  } | null;
  timingMark("parseBody");
  if (
    typeof body?.employeeId !== "string" ||
    !isValidYear(body.year) ||
    typeof body.entitlement !== "number" ||
    !Number.isInteger(body.entitlement) ||
    body.entitlement < 0 ||
    body.entitlement > MAX_TF_DAYS
  ) {
    return NextResponse.json({ error: "Bitte Mitarbeiter, Jahr und Anspruch (0–365) prüfen." }, { status: 400 });
  }
  const employeeId = body.employeeId;
  const year = body.year;
  const entitlement = body.entitlement;

  const employeeRecord = await prisma.employee.findFirst({
    where: { id: employeeId, isActive: true },
    include: employeeRelations,
  });
  timingMark("employee");
  if (!employeeRecord) return NextResponse.json({ error: "Aktiver Mitarbeiter nicht gefunden." }, { status: 404 });

  const calendarState = await loadCalendarState();
  timingMark("calendar");
  const employee = toEmployeeDto(employeeRecord);
  try {
    const { account, old } = await prisma.$transaction(async (tx) => {
      const old = await tx.tfDayAccount.findUnique({
        where: { employeeId_year: { employeeId, year } },
      });
      const approved = await tx.vacationRequest.findMany({
        where: {
          employeeId,
          requestType: "TF_DAY",
          status: "APPROVED",
          startDate: { lte: new Date(`${year}-12-31T00:00:00.000Z`) },
          endDate: { gte: new Date(`${year}-01-01T00:00:00.000Z`) },
        },
      });
      const approvedDays = approved.reduce((sum, entry) => sum + countScheduledWorkdaysInYear(
        employee,
        entry.startDate.toISOString().slice(0, 10),
        entry.endDate.toISOString().slice(0, 10),
        year,
        calendarState,
      ), 0);
      if (entitlement < approvedDays) {
        throw new TfDayEntitlementError(`Der Anspruch kann nicht unter die bereits genehmigten ${approvedDays} TF-Tage gesenkt werden.`);
      }
      const account = await tx.tfDayAccount.upsert({
        where: { employeeId_year: { employeeId, year } },
        update: { entitlement },
        create: {
          employeeId,
          year,
          entitlement,
        },
      });
      return { account, old };
    }, { isolationLevel: "Serializable" });
    timingMark("transaction");

    await recordAuditLog({
      actorUserId: context.userId,
      action: old ? "tfDayAccount.update" : "tfDayAccount.create",
      entityType: "TfDayAccount",
      entityId: account.id,
      oldValues: old ? { year: old.year, entitlement: old.entitlement } : null,
      newValues: { employeeId: account.employeeId, year: account.year, entitlement: account.entitlement },
    });
    timingMark("audit");

    const summary = (await loadSummaries(account.year, [account.employeeId]))[0];
    timingMark("summary");

    console.log("[TF_TIMING]", {
      ...timings,
      total: Date.now() - timingStartedAt,
    });

    return NextResponse.json(summary);
  } catch (error) {
    console.log("[TF_TIMING_ERROR]", {
      ...timings,
      total: Date.now() - timingStartedAt,
    });

    if (error instanceof TfDayEntitlementError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "TF-Tage wurden gleichzeitig geändert. Bitte neu laden." }, { status: 409 });
    }
    throw error;
  }
}
