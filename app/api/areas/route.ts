import { NextResponse } from "next/server";
import { ShiftCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { recordAuditLog } from "@/lib/audit";
import { labelToShiftCode, toAreaConfiguration } from "@/lib/area-mapper";
import type { AreaConfiguration } from "@/app/admin/areas-data";

async function loadConfiguration() {
  const departments = await prisma.department.findMany({
    include: { minimumStaffing: true },
    orderBy: { name: "asc" },
  });
  return toAreaConfiguration(departments);
}

export async function GET() {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  if (!["editDepartments", "editMinimumStaffing", "viewReports", "exportReports",
    "viewEmployees", "editEmployees", "teamShiftPlan", "editAssignments", "viewQualifications",
    "editQualifications", "manageQualifications", "otherVacations", "approveVacation", "planAdditionalShifts"]
    .some((permission) => hasPermission(context, permission))) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  return NextResponse.json(await loadConfiguration());
}

export async function PUT(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  if (!hasPermission(context, "editDepartments") || !hasPermission(context, "editMinimumStaffing")) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const before = await loadConfiguration();
  const payload = (await request.json()) as AreaConfiguration;

  for (const area of payload.areas) {
    const isNewArea = !before.areas.some((existing) => existing.id === area.id);
    const department = isNewArea
      ? await prisma.department.create({ data: { code: area.id, name: area.name, active: area.active } })
      : await prisma.department.update({
          where: { id: area.id },
          data: { name: area.name, active: area.active },
        });

    const minimums = payload.minimums[area.id];
    if (minimums) {
      for (const [shiftLabel, shiftMinimum] of Object.entries(minimums) as [
        keyof typeof minimums,
        { minimum: number; qualificationId: string | null; minimumQualified: number },
      ][]) {
        const shift = labelToShiftCode[shiftLabel] ?? ShiftCode.EARLY;
        await prisma.minimumStaffing.upsert({
          where: { departmentId_shift: { departmentId: department.id, shift } },
          update: {
            minimum: shiftMinimum.minimum,
            qualificationId: shiftMinimum.qualificationId,
            minimumQualified: shiftMinimum.minimumQualified,
          },
          create: {
            departmentId: department.id,
            shift,
            minimum: shiftMinimum.minimum,
            qualificationId: shiftMinimum.qualificationId,
            minimumQualified: shiftMinimum.minimumQualified,
          },
        });
      }
    }
  }

  const after = await loadConfiguration();
  await recordAuditLog({
    actorUserId: context.userId,
    action: "areas.update",
    entityType: "Department",
    oldValues: before,
    newValues: after,
  });

  return NextResponse.json(after);
}
