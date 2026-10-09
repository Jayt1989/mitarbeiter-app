import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { recordAuditLog } from "@/lib/audit";
import { qualificationLevels } from "@/app/admin/qualifications-data";
import { createNotification } from "@/lib/notifications";
import { qualificationNotification } from "@/lib/notification-messages";

export async function PUT(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  if (!hasPermission(context, "editQualifications")) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const body = (await request.json()) as {
    employeeId: string;
    qualificationId: string;
    level: number;
  };
  if (!qualificationLevels.includes(body.level as 0 | 1 | 2 | 3)) {
    return NextResponse.json({ error: "Ungültige Qualifikationsstufe" }, { status: 400 });
  }

  const [employee, qualification] = await Promise.all([
    prisma.employee.findUnique({ where: { id: body.employeeId } }),
    prisma.qualification.findUnique({ where: { id: body.qualificationId } }),
  ]);
  if (!employee || !qualification) {
    return NextResponse.json({ error: "Mitarbeiter oder Qualifikation nicht gefunden" }, { status: 404 });
  }

  const before = await prisma.employeeQualification.findUnique({
    where: {
      employeeId_qualificationId: {
        employeeId: body.employeeId,
        qualificationId: body.qualificationId,
      },
    },
  });

  const updated = await prisma.$transaction(async (tx) => {
    const key = { employeeId: body.employeeId, qualificationId: body.qualificationId };
    if (before) {
      const changed = await tx.employeeQualification.updateMany({
        where: { ...key, level: before.level },
        data: { level: body.level },
      });
      if (changed.count === 0) return null;
    } else {
      await tx.employeeQualification.create({ data: { ...key, level: body.level } });
    }
    if (body.level > 0 && (!before || before.level === 0)) {
      await createNotification(tx, qualificationNotification(body.employeeId, qualification.name));
    }
    return tx.employeeQualification.findUniqueOrThrow({
      where: { employeeId_qualificationId: key },
    });
  });
  if (!updated) {
    return NextResponse.json({ error: "Die Qualifikation wurde inzwischen geändert. Bitte neu laden." }, { status: 409 });
  }

  await recordAuditLog({
    actorUserId: context.userId,
    action: before ? "qualification.level_change" : "qualification.assign",
    entityType: "EmployeeQualification",
    entityId: `${body.employeeId}:${body.qualificationId}`,
    oldValues: before ? { level: before.level } : null,
    newValues: { level: updated.level, qualificationName: qualification.name },
  });

  return NextResponse.json({ employeeId: updated.employeeId, qualificationId: updated.qualificationId, level: updated.level });
}
