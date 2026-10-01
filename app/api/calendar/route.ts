import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { recordAuditLog } from "@/lib/audit";
import { loadCalendarData } from "@/lib/calendar-server";
import { isGermanState } from "@/lib/holidays";

export async function GET() {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  return NextResponse.json(await loadCalendarData(hasPermission(context, "editCalendar")));
}

export async function PUT(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  if (!hasPermission(context, "editCalendar")) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { state?: unknown } | null;
  if (!isGermanState(body?.state)) {
    return NextResponse.json({ error: "Ungültiges Bundesland." }, { status: 400 });
  }

  const before = await prisma.calendarSettings.findUnique({ where: { id: "default" } });
  const updated = await prisma.calendarSettings.upsert({
    where: { id: "default" },
    update: { state: body.state },
    create: { id: "default", country: "DE", state: body.state },
  });

  await recordAuditLog({
    actorUserId: context.userId,
    action: "calendar.settings_update",
    entityType: "CalendarSettings",
    entityId: updated.id,
    oldValues: before ? { country: before.country, state: before.state } : null,
    newValues: { country: updated.country, state: updated.state },
  });

  return NextResponse.json(await loadCalendarData(true));
}
