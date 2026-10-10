import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { recordAuditLog } from "@/lib/audit";
import { toQualificationDto } from "@/lib/qualification-mapper";

function createCode(name: string) {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `${slug || "QUALIFIKATION"}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function canView(permissions: Record<string, boolean>) {
  return (
    permissions.viewQualifications ||
    permissions.editQualifications ||
    permissions.manageQualifications
  );
}

export async function GET(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  const assignmentScope = new URL(request.url).searchParams.get("scope") === "assignments";
  if (!(assignmentScope ? hasPermission(context, "editAssignments") : canView(context.permissions))) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const records = await prisma.qualification.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(records.map(toQualificationDto));
}

export async function POST(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  if (!hasPermission(context, "manageQualifications")) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const body = (await request.json()) as { name: string };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Bitte einen Namen angeben." }, { status: 400 });
  }

  const duplicate = await prisma.qualification.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (duplicate) {
    return NextResponse.json({ error: "Eine Qualifikation mit diesem Namen existiert bereits." }, { status: 409 });
  }

  const created = await prisma.qualification.create({
    data: { name, code: createCode(name) },
  });

  await recordAuditLog({
    actorUserId: context.userId,
    action: "qualification.create",
    entityType: "Qualification",
    entityId: created.id,
    newValues: toQualificationDto(created),
  });

  return NextResponse.json(toQualificationDto(created), { status: 201 });
}

export async function PATCH(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  if (!hasPermission(context, "manageQualifications")) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const body = (await request.json()) as { id: string; name?: string; active?: boolean };
  const before = await prisma.qualification.findUnique({ where: { id: body.id } });
  if (!before) {
    return NextResponse.json({ error: "Qualifikation nicht gefunden" }, { status: 404 });
  }

  const name = body.name?.trim();
  if (name !== undefined && !name) {
    return NextResponse.json({ error: "Der Name darf nicht leer sein." }, { status: 400 });
  }

  const updated = await prisma.qualification.update({
    where: { id: body.id },
    data: {
      ...(name ? { name } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    },
  });

  await recordAuditLog({
    actorUserId: context.userId,
    action: "qualification.update",
    entityType: "Qualification",
    entityId: updated.id,
    oldValues: toQualificationDto(before),
    newValues: toQualificationDto(updated),
  });

  return NextResponse.json(toQualificationDto(updated));
}

export async function DELETE(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  if (!hasPermission(context, "manageQualifications")) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Keine Qualifikation angegeben" }, { status: 400 });
  }

  const before = await prisma.qualification.findUnique({ where: { id } });
  if (!before) {
    return NextResponse.json({ error: "Qualifikation nicht gefunden" }, { status: 404 });
  }

  const [assignmentCount, minimumStaffingCount] = await Promise.all([
    prisma.employeeQualification.count({ where: { qualificationId: id } }),
    prisma.minimumStaffing.count({ where: { qualificationId: id } }),
  ]);
  if (assignmentCount > 0 || minimumStaffingCount > 0) {
    return NextResponse.json(
      { error: "Diese Qualifikation wird noch verwendet und kann nicht gelöscht werden." },
      { status: 409 },
    );
  }

  await prisma.qualification.delete({ where: { id } });

  await recordAuditLog({
    actorUserId: context.userId,
    action: "qualification.delete",
    entityType: "Qualification",
    entityId: id,
    oldValues: toQualificationDto(before),
  });

  return NextResponse.json({ success: true });
}
