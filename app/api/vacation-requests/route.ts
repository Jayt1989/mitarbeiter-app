import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { recordAuditLog } from "@/lib/audit";
import { employeeRelations, toEmployeeDto } from "@/lib/employee-mapper";
import { labelToStatus, toVacationRequestDto } from "@/lib/vacation-mapper";
import { getVacationWorkdays, requestsOverlap } from "@/app/urlaub/vacation-data";
import { loadCalendarState } from "@/lib/calendar-server";

export async function GET() {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const canSeeOthers = hasPermission(context, "otherVacations");
  const canSeeOwn = hasPermission(context, "ownVacation");
  if (!canSeeOthers && !canSeeOwn) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const requests = await prisma.vacationRequest.findMany({
    where: canSeeOthers ? undefined : { employeeId: context.employeeId ?? "__none__" },
    orderBy: { requestedAt: "desc" },
  });

  return NextResponse.json(requests.map(toVacationRequestDto));
}

export async function POST(request: Request) {
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

  const created = await prisma.vacationRequest.create({
    data: {
      employeeId: employee.id,
      startDate: new Date(`${body.startDate}T00:00:00.000Z`),
      endDate: new Date(`${body.endDate}T00:00:00.000Z`),
      daysRequested: workdays.length,
      comment: body.comment?.trim() || null,
    },
  });

  await recordAuditLog({
    actorUserId: context.userId,
    action: "vacation.request",
    entityType: "VacationRequest",
    entityId: created.id,
    newValues: toVacationRequestDto(created),
  });

  return NextResponse.json(toVacationRequestDto(created), { status: 201 });
}

export async function PATCH(request: Request) {
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
  const existing = await prisma.vacationRequest.findUnique({ where: { id: body.id } });
  if (!existing) {
    return NextResponse.json({ error: "Antrag nicht gefunden" }, { status: 404 });
  }

  const updated = await prisma.vacationRequest.update({
    where: { id: body.id },
    data: {
      status: labelToStatus[body.status],
      decidedAt: new Date(),
      approvedById: context.userId,
    },
  });

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
