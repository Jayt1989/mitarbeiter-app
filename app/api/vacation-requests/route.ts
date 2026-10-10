import { NextResponse } from "next/server";
import { assertNoAdditionalPeriod } from "@/lib/additional-shift-conflicts";
import { AdditionalShiftError } from "@/lib/additional-shift-rules";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { recordAuditLog } from "@/lib/audit";
import { employeeRelations, toEmployeeDto } from "@/lib/employee-mapper";
import { labelToStatus, toVacationRequestDto } from "@/lib/vacation-mapper";
import { getVacationWorkdays, requestsOverlap } from "@/app/urlaub/vacation-data";
import { loadCalendarState } from "@/lib/calendar-server";
import { createNotification } from "@/lib/notifications";
import { vacationNotification } from "@/lib/notification-messages";

export async function GET() {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const canSeeOthers = hasPermission(context, "otherVacations") || hasPermission(context, "approveVacation");
  const canSeeOwn = hasPermission(context, "ownVacation");
  if (!canSeeOthers && !canSeeOwn) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }
  if (!canSeeOthers && !context.employeeId) {
    return NextResponse.json({ error: "Kein Mitarbeiterkonto zugeordnet" }, { status: 403 });
  }

  const requests = await prisma.vacationRequest.findMany({
    where: canSeeOthers ? undefined : { employeeId: { in: context.employeeId ? [context.employeeId] : [] } },
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

  const body = (await request.json()) as { startDate: string; endDate: string; comment?: string };
  if (!body.startDate || !body.endDate || body.startDate > body.endDate) {
    return NextResponse.json({ error: "Ungültiger Zeitraum" }, { status: 400 });
  }

  const employeeRecord = await prisma.employee.findUnique({
    where: { id: context.employeeId },
    include: employeeRelations,
  });
  if (!employeeRecord) {
    return NextResponse.json({ error: "Mitarbeiter nicht gefunden" }, { status: 404 });
  }
  const employee = toEmployeeDto(employeeRecord);

  const workdays = getVacationWorkdays(
    employee,
    body.startDate,
    body.endDate,
    await loadCalendarState(),
  );
  if (workdays.length === 0) {
    return NextResponse.json(
      { error: "Keine Urlaubstage im gewählten Zeitraum (freie Tage und Feiertage zählen nicht)." },
      { status: 400 },
    );
  }

  const existingRequests = await prisma.vacationRequest.findMany({
    where: { employeeId: employee.id, status: { in: ["REQUESTED", "APPROVED"] } },
  });
  const overlaps = existingRequests.some((entry) =>
    requestsOverlap(
      body.startDate,
      body.endDate,
      entry.startDate.toISOString().slice(0, 10),
      entry.endDate.toISOString().slice(0, 10),
    ),
  );
  if (overlaps) {
    return NextResponse.json(
      { error: "Der Zeitraum überschneidet sich mit einem offenen oder genehmigten Antrag." },
      { status: 409 },
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    await assertNoAdditionalPeriod(tx, employee.id, body.startDate, body.endDate);
    return tx.vacationRequest.create({
    data: {
      employeeId: employee.id,
      startDate: new Date(`${body.startDate}T00:00:00.000Z`),
      endDate: new Date(`${body.endDate}T00:00:00.000Z`),
      daysRequested: workdays.length,
      comment: body.comment?.trim() || null,
    },
    });
  }, { isolationLevel: "Serializable" });

  await recordAuditLog({
    actorUserId: context.userId,
    action: "vacation.request",
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
    action: body.status === "Genehmigt" ? "vacation.approve" : body.status === "Abgelehnt" ? "vacation.reject" : "vacation.cancel",
    entityType: "VacationRequest",
    entityId: updated.id,
    oldValues: toVacationRequestDto(existing),
    newValues: toVacationRequestDto(updated),
  });

  return NextResponse.json(toVacationRequestDto(updated));
}

function conflictResponse(error: unknown) {
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
