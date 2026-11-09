import { NextResponse } from "next/server";
import { assertNoAdditionalPeriod } from "@/lib/additional-shift-conflicts";
import { AdditionalShiftError } from "@/lib/additional-shift-rules";
import { isValidDateKey } from "@/app/admin/assignments-data";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { recordAuditLog } from "@/lib/audit";
import { employeeRelations, toEmployeeDto } from "@/lib/employee-mapper";
import { labelToStatus, toVacationRequestDto } from "@/lib/vacation-mapper";
import {
  countScheduledWorkdaysInYear,
  getVacationWorkdays,
  requestsOverlap,
} from "@/app/urlaub/vacation-data";
import { loadCalendarState } from "@/lib/calendar-server";
import { createNotification, notifyUsersWithPermission } from "@/lib/notifications";
import { tfDayRequestNotification, vacationNotification, vacationRequestNotification } from "@/lib/notification-messages";
import { tfDayRequestError } from "@/app/admin/tf-day-data";

class VacationRequestOverlapError extends Error {}
class TfDayBalanceError extends Error {}
class TfDayConflictError extends Error {}

function isValidVacationDateKey(value: unknown): value is string {
  if (!isValidDateKey(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return date.toISOString().slice(0, 10) === value;
}

async function assertNoTfDayConflicts(
  tx: Prisma.TransactionClient,
  employeeId: string,
  startDate: string,
  endDate: string,
) {
  const from = new Date(`${startDate}T00:00:00.000Z`);
  const to = new Date(`${endDate}T00:00:00.000Z`);
  const [absence, assignment, swap] = await Promise.all([
    tx.absence.findFirst({
      where: { employeeId, startDate: { lte: to }, endDate: { gte: from } },
      select: { id: true },
    }),
    tx.temporaryAssignment.findFirst({
      where: { employeeId, cancelledAt: null, startDate: { lte: to }, endDate: { gte: from } },
      select: { id: true },
    }),
    tx.shiftSwapRequest.findFirst({
      where: {
        date: { gte: from, lte: to },
        status: { in: ["ANGEFRAGT", "PARTNER_BESTAETIGT", "GENEHMIGT"] },
        OR: [{ requesterId: employeeId }, { partnerId: employeeId }],
      },
      select: { id: true },
    }),
  ]);
  if (absence || assignment || swap) {
    throw new TfDayConflictError("Der TF-Zeitraum kollidiert mit einer Abwesenheit, einem temporären Einsatz oder einem Schichttausch.");
  }
}

export async function GET() {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const canSeeOthers = hasPermission(context, "otherVacations") || hasPermission(context, "approveVacation");
  const canSeeOwnVacation = hasPermission(context, "ownVacation");
  const canSeeOwn = canSeeOwnVacation || hasPermission(context, "requestVacation");
  if (!canSeeOthers && !canSeeOwn) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }
  if (!canSeeOthers && !context.employeeId) {
    return NextResponse.json({ error: "Kein Mitarbeiterkonto zugeordnet" }, { status: 403 });
  }

  const requests = await prisma.vacationRequest.findMany({
    where: canSeeOthers ? undefined : {
      employeeId: { in: context.employeeId ? [context.employeeId] : [] },
      ...(!canSeeOwnVacation ? { requestType: "TF_DAY" as const } : {}),
    },
    orderBy: { requestedAt: "desc" },
  });

  return NextResponse.json(requests.map(toVacationRequestDto));
}

async function requestVacation(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  if (!hasPermission(context, "requestVacation") || !context.employeeId) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as {
    startDate?: unknown;
    endDate?: unknown;
    comment?: unknown;
    requestType?: unknown;
  } | null;
  const requestType = body?.requestType ?? "VACATION";
  if (
    typeof body?.startDate !== "string" ||
    typeof body.endDate !== "string" ||
    !isValidVacationDateKey(body.startDate) ||
    !isValidVacationDateKey(body.endDate) ||
    body.startDate > body.endDate ||
    (requestType !== "VACATION" && requestType !== "TF_DAY") ||
    (body.comment !== undefined && typeof body.comment !== "string")
  ) {
    return NextResponse.json({ error: "Ungültiger Zeitraum" }, { status: 400 });
  }
  const startDate = body.startDate;
  const endDate = body.endDate;
  const comment = body.comment;

  const employeeRecord = await prisma.employee.findUnique({
    where: { id: context.employeeId },
    include: employeeRelations,
  });
  if (!employeeRecord) {
    return NextResponse.json({ error: "Mitarbeiter nicht gefunden" }, { status: 404 });
  }
  const employee = toEmployeeDto(employeeRecord);
  const calendarState = await loadCalendarState();

  const workdays = getVacationWorkdays(
    employee,
    startDate,
    endDate,
    calendarState,
  );
  if (workdays.length === 0) {
    return NextResponse.json(
      { error: "Keine Urlaubstage im gewählten Zeitraum (freie Tage und Feiertage zählen nicht)." },
      { status: 400 },
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const currentRequests = await tx.vacationRequest.findMany({
      where: { employeeId: employee.id, status: { in: ["REQUESTED", "APPROVED"] } },
    });
    if (currentRequests.some((entry) => requestsOverlap(
      startDate,
      endDate,
      entry.startDate.toISOString().slice(0, 10),
      entry.endDate.toISOString().slice(0, 10),
    ))) {
      throw new VacationRequestOverlapError("Der Zeitraum überschneidet sich mit einem offenen oder genehmigten Antrag.");
    }
    await assertNoAdditionalPeriod(tx, employee.id, startDate, endDate);

    if (requestType === "TF_DAY") {
      await assertNoTfDayConflicts(tx, employee.id, startDate, endDate);
      for (let year = Number(startDate.slice(0, 4)); year <= Number(endDate.slice(0, 4)); year += 1) {
        const account = await tx.tfDayAccount.findUnique({
          where: { employeeId_year: { employeeId: employee.id, year } },
        });
        const committed = currentRequests
          .filter((entry) => entry.requestType === "TF_DAY")
          .reduce((sum, entry) => sum + countScheduledWorkdaysInYear(
            employee,
            entry.startDate.toISOString().slice(0, 10),
            entry.endDate.toISOString().slice(0, 10),
            year,
            calendarState,
          ), 0);
        const requestedForYear = countScheduledWorkdaysInYear(employee, startDate, endDate, year, calendarState);
        if (requestedForYear === 0) continue;
        const entitlement = account?.entitlement ?? 0;
        const balanceError = tfDayRequestError(entitlement, committed, requestedForYear, year);
        if (balanceError) throw new TfDayBalanceError(balanceError);
      }
    }

    const record = await tx.vacationRequest.create({
      data: {
        employeeId: employee.id,
        requestType,
        startDate: new Date(`${startDate}T00:00:00.000Z`),
        endDate: new Date(`${endDate}T00:00:00.000Z`),
        daysRequested: workdays.length,
        comment: comment?.trim() || null,
      },
    });
    const employeeName = `${employee.firstName} ${employee.lastName}`;
    await notifyUsersWithPermission(tx, "approveVacation", (userId) =>
      requestType === "TF_DAY"
        ? tfDayRequestNotification(userId, employeeName, record)
        : vacationRequestNotification(userId, employeeName, record));
    return record;
  }, { isolationLevel: "Serializable" });

  await recordAuditLog({
    actorUserId: context.userId,
    action: requestType === "TF_DAY" ? "tfDay.request" : "vacation.request",
    entityType: "VacationRequest",
    entityId: created.id,
    newValues: toVacationRequestDto(created),
  });

  return NextResponse.json(toVacationRequestDto(created), { status: 201 });
}

async function decideVacation(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  if (!hasPermission(context, "approveVacation")) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const body = (await request.json()) as {
    id: string;
    status: "Genehmigt" | "Abgelehnt" | "Storniert";
  };
  if (!["Genehmigt", "Abgelehnt", "Storniert"].includes(body.status)) {
    return NextResponse.json({ error: "Ungültiger Urlaubsstatus" }, { status: 400 });
  }
  const existing = await prisma.vacationRequest.findUnique({ where: { id: body.id } });
  if (!existing) {
    return NextResponse.json({ error: "Antrag nicht gefunden" }, { status: 404 });
  }

  const status = labelToStatus[body.status];
  if (existing.status === status) {
    return NextResponse.json(toVacationRequestDto(existing));
  }
  const updated = await prisma.$transaction(async (tx) => {
    if (status === "APPROVED") {
      await assertNoAdditionalPeriod(tx, existing.employeeId,
        existing.startDate.toISOString().slice(0, 10), existing.endDate.toISOString().slice(0, 10));
      if (existing.requestType === "TF_DAY") {
        await assertNoTfDayConflicts(
          tx,
          existing.employeeId,
          existing.startDate.toISOString().slice(0, 10),
          existing.endDate.toISOString().slice(0, 10),
        );
        const employeeRecord = await tx.employee.findUnique({
          where: { id: existing.employeeId },
          include: employeeRelations,
        });
        if (!employeeRecord) throw new TfDayBalanceError("Mitarbeiter nicht gefunden.");
        const employee = toEmployeeDto(employeeRecord);
        const calendarState = await loadCalendarState();
        const currentRequests = await tx.vacationRequest.findMany({
          where: {
            employeeId: existing.employeeId,
            requestType: "TF_DAY",
            status: { in: ["REQUESTED", "APPROVED"] },
          },
        });
        for (let year = Number(existing.startDate.toISOString().slice(0, 4));
          year <= Number(existing.endDate.toISOString().slice(0, 4)); year += 1) {
          const requestedForYear = countScheduledWorkdaysInYear(
            employee,
            existing.startDate.toISOString().slice(0, 10),
            existing.endDate.toISOString().slice(0, 10),
            year,
            calendarState,
          );
          if (requestedForYear === 0) continue;
          const account = await tx.tfDayAccount.findUnique({
            where: { employeeId_year: { employeeId: existing.employeeId, year } },
          });
          const committed = currentRequests.reduce((sum, entry) => sum + countScheduledWorkdaysInYear(
            employee,
            entry.startDate.toISOString().slice(0, 10),
            entry.endDate.toISOString().slice(0, 10),
            year,
            calendarState,
          ), 0);
          if (!account || committed > account.entitlement) {
            throw new TfDayBalanceError(`Der TF-Antrag überschreitet den verfügbaren Anspruch für ${year}.`);
          }
        }
      }
    }
    const changed = await tx.vacationRequest.updateMany({
      where: { id: existing.id, status: existing.status },
      data: { status, decidedAt: new Date(), approvedById: context.userId },
    });
    if (changed.count === 0) return null;
    const record = await tx.vacationRequest.findUniqueOrThrow({ where: { id: existing.id } });
    if (status === "APPROVED" || status === "REJECTED") {
      await createNotification(tx, vacationNotification(record, status));
    }
    return record;
  }, { isolationLevel: "Serializable" });
  if (!updated) {
    return NextResponse.json({ error: "Der Antrag wurde inzwischen geändert. Bitte neu laden." }, { status: 409 });
  }

  await recordAuditLog({
    actorUserId: context.userId,
    action: updated.requestType === "TF_DAY"
      ? body.status === "Genehmigt" ? "tfDay.approve" : body.status === "Abgelehnt" ? "tfDay.reject" : "tfDay.cancel"
      : body.status === "Genehmigt" ? "vacation.approve" : body.status === "Abgelehnt" ? "vacation.reject" : "vacation.cancel",
    entityType: "VacationRequest",
    entityId: updated.id,
    oldValues: toVacationRequestDto(existing),
    newValues: toVacationRequestDto(updated),
  });

  return NextResponse.json(toVacationRequestDto(updated));
}

function conflictResponse(error: unknown) {
  if (error instanceof VacationRequestOverlapError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof TfDayBalanceError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof TfDayConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof AdditionalShiftError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
    return NextResponse.json({ error: "Die Planung wurde gleichzeitig geändert. Bitte neu laden und erneut prüfen." }, { status: 409 });
  }
  throw error;
}
export async function POST(request: Request) {
  try { return await requestVacation(request); } catch (error) { return conflictResponse(error); }
}
export async function PATCH(request: Request) {
  try { return await decideVacation(request); } catch (error) { return conflictResponse(error); }
}
