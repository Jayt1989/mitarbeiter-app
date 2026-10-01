import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { recordAuditLog } from "@/lib/audit";
import { isCompanyDayType, type CompanyDayType } from "@/lib/calendar";
import { toCompanyDayDto } from "@/lib/calendar-server";
import { isValidDateKey } from "@/app/admin/assignments-data";

type CompanyDayInput = {
  name: string;
  date: string;
  type: CompanyDayType;
  note: string;
  active: boolean;
};

function parseInput(body: unknown): CompanyDayInput | string {
  const raw = (body ?? {}) as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const note = typeof raw.note === "string" ? raw.note.trim() : "";
  if (!name || name.length > 120) return "Bitte einen Namen (max. 120 Zeichen) angeben.";
  if (!isValidDateKey(raw.date)) return "Bitte ein gültiges Datum angeben.";
  if (!isCompanyDayType(raw.type)) return "Ungültiger Typ.";
  if (note.length > 500) return "Die Bemerkung darf höchstens 500 Zeichen lang sein.";
  return { name, date: raw.date, type: raw.type, note, active: raw.active !== false };
}

async function authorize() {
  const context = await getAuthorizationContext();
  if (!context) {
    return { context: null, error: NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 }) } as const;
  }
  if (!hasPermission(context, "editCalendar")) {
    return { context: null, error: NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 }) } as const;
  }
  return { context, error: null } as const;
}

export async function POST(request: Request) {
  const { context, error } = await authorize();
  if (error) return error;

  const input = parseInput(await request.json().catch(() => null));
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });

  const created = await prisma.companyDay.create({
    data: {
      name: input.name,
      date: new Date(`${input.date}T00:00:00.000Z`),
      type: input.type,
      note: input.note || null,
      active: input.active,
      createdById: context.userId,
    },
  });
  const dto = toCompanyDayDto(created);

  await recordAuditLog({
    actorUserId: context.userId,
    action: "companyDay.create",
    entityType: "CompanyDay",
    entityId: dto.id,
    newValues: dto,
  });

  return NextResponse.json(dto, { status: 201 });
}

export async function PATCH(request: Request) {
  const { context, error } = await authorize();
  if (error) return error;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body?.id !== "string") {
    return NextResponse.json({ error: "Kein Sondertag angegeben." }, { status: 400 });
  }
  const before = await prisma.companyDay.findUnique({ where: { id: body.id } });
  if (!before) return NextResponse.json({ error: "Sondertag nicht gefunden." }, { status: 404 });

  const input = parseInput(body);
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });

  const updated = await prisma.companyDay.update({
    where: { id: body.id },
    data: {
      name: input.name,
      date: new Date(`${input.date}T00:00:00.000Z`),
      type: input.type,
      note: input.note || null,
      active: input.active,
    },
  });
  const dto = toCompanyDayDto(updated);

  await recordAuditLog({
    actorUserId: context.userId,
    action: "companyDay.update",
    entityType: "CompanyDay",
    entityId: dto.id,
    oldValues: toCompanyDayDto(before),
    newValues: dto,
  });

  return NextResponse.json(dto);
}
