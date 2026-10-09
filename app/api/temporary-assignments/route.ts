import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthorizationContext,
  hasPermission,
  type AuthorizationContext,
} from "@/lib/authorization";
import { recordAuditLog } from "@/lib/audit";
import { labelToShiftCode, toAreaConfiguration } from "@/lib/area-mapper";
import { fromShiftCode } from "@/lib/employee-mapper";
import { createNotification } from "@/lib/notifications";
import { assignmentNotification } from "@/lib/notification-messages";
import {
  temporaryAssignmentRelations,
  toTemporaryAssignmentDto,
} from "@/lib/assignment-mapper";
import {
  assignmentsConflict,
  checkAssignmentQualification,
  isValidDateKey,
  type TemporaryAssignment,
  type TemporaryAssignmentInput,
} from "@/app/admin/assignments-data";
import type { ActiveShift } from "@/app/schichtplan/rotation";

const activeShifts: readonly ActiveShift[] = ["Früh", "Spät", "Nacht"];
const maxNoteLength = 500;

function canSeeAll(context: AuthorizationContext) {
  return (
    hasPermission(context, "editAssignments") ||
    hasPermission(context, "teamShiftPlan") ||
    hasPermission(context, "viewEmployees") ||
    hasPermission(context, "viewReports")
  );
}

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

type ValidationResult =
  | { ok: true; input: TemporaryAssignmentInput }
  | { ok: false; error: string; status: number };

async function validateInput(body: unknown, ignoreId?: string): Promise<ValidationResult> {
  const raw = (body ?? {}) as Record<string, unknown>;
  const shift = raw.shift === null || raw.shift === undefined || raw.shift === ""
    ? null
    : (raw.shift as ActiveShift);
  const note = typeof raw.note === "string" ? raw.note.trim() : "";

  if (typeof raw.employeeId !== "string" || !raw.employeeId) {
    return { ok: false, error: "Bitte einen Mitarbeiter auswählen.", status: 400 };
  }
  if (typeof raw.areaId !== "string" || !raw.areaId) {
    return { ok: false, error: "Bitte einen Einsatzbereich auswählen.", status: 400 };
  }
  if (!isValidDateKey(raw.startDate) || !isValidDateKey(raw.endDate)) {
    return { ok: false, error: "Bitte ein gültiges Von- und Bis-Datum angeben.", status: 400 };
  }
  if (raw.startDate > raw.endDate) {
    return { ok: false, error: "Das Bis-Datum darf nicht vor dem Von-Datum liegen.", status: 400 };
  }
  if (shift !== null && !activeShifts.includes(shift)) {
    return { ok: false, error: "Ungültige Schicht.", status: 400 };
  }
  if (note.length > maxNoteLength) {
    return { ok: false, error: `Die Bemerkung darf höchstens ${maxNoteLength} Zeichen lang sein.`, status: 400 };
  }

  const [employee, department] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: raw.employeeId },
      include: { departments: { where: { isPrimary: true } } },
    }),
    prisma.department.findUnique({ where: { id: raw.areaId } }),
  ]);
  if (!employee || !employee.isActive) {
    return { ok: false, error: "Mitarbeiter nicht gefunden oder inaktiv.", status: 404 };
  }
  if (!department || !department.active) {
    return { ok: false, error: "Einsatzbereich nicht gefunden oder inaktiv.", status: 404 };
  }
  if (employee.departments[0]?.departmentId === department.id) {
    return { ok: false, error: "Der Einsatzbereich entspricht dem Hauptbereich des Mitarbeiters.", status: 400 };
  }

  const input: TemporaryAssignmentInput = {
    employeeId: employee.id,
    areaId: department.id,
    startDate: raw.startDate,
    endDate: raw.endDate,
    shift,
    note,
  };

  const existing = await prisma.temporaryAssignment.findMany({
    where: {
      employeeId: employee.id,
      cancelledAt: null,
      startDate: { lte: toDate(input.endDate) },
      endDate: { gte: toDate(input.startDate) },
      ...(ignoreId ? { id: { not: ignoreId } } : {}),
    },
    include: temporaryAssignmentRelations,
  });
  const conflict = existing
    .map(toTemporaryAssignmentDto)
    .find((entry) => assignmentsConflict(entry, { ...input, cancelledAt: null }));
  if (conflict) {
    return {
      ok: false,
      error: `Überschneidung mit bestehendem Einsatz in ${conflict.areaName} (${conflict.startDate} bis ${conflict.endDate}${conflict.shift ? `, ${conflict.shift}` : ""}).`,
      status: 409,
    };
  }

  return { ok: true, input };
}

async function getQualificationCheck(input: TemporaryAssignmentInput) {
  const [departments, qualifications] = await Promise.all([
    prisma.department.findMany({ include: { minimumStaffing: true } }),
    prisma.employeeQualification.findMany({ where: { employeeId: input.employeeId } }),
  ]);
  return checkAssignmentQualification(
    { qualifications: Object.fromEntries(qualifications.map((entry) => [entry.qualificationId, entry.level])) },
    input.areaId,
    input.shift,
    toAreaConfiguration(departments),
  );
}

function auditValues(
  context: AuthorizationContext,
  assignment: TemporaryAssignment,
  areaName: string | null,
) {
  return {
    benutzer: context.login,
    mitarbeiter: assignment.employeeName,
    mitarbeiterId: assignment.employeeId,
    bereich: areaName,
    zeitraum: { von: assignment.startDate, bis: assignment.endDate },
    schicht: assignment.shift ?? "Alle Schichten",
    bemerkung: assignment.note,
    zeitpunkt: new Date().toISOString(),
  };
}

function unauthorized() {
  return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
}

export async function GET() {
  const context = await getAuthorizationContext();
  if (!context) return unauthorized();

  const seeAll = canSeeAll(context);
  if (!seeAll && !hasPermission(context, "ownShiftPlan")) return forbidden();

  const records = await prisma.temporaryAssignment.findMany({
    where: seeAll ? undefined : { employeeId: context.employeeId ?? "__none__" },
    include: temporaryAssignmentRelations,
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(records.map(toTemporaryAssignmentDto));
}

export async function POST(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) return unauthorized();
  if (!hasPermission(context, "editAssignments")) return forbidden();

  const validation = await validateInput(await request.json().catch(() => null));
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }
  const { input } = validation;

  const created = await prisma.$transaction(async (tx) => {
    const record = await tx.temporaryAssignment.create({
      data: {
        employeeId: input.employeeId,
        departmentId: input.areaId,
        startDate: toDate(input.startDate),
        endDate: toDate(input.endDate),
        shift: input.shift ? labelToShiftCode[input.shift] : null,
        note: input.note || null,
        createdById: context.userId,
      },
      include: temporaryAssignmentRelations,
    });
    await createNotification(tx, assignmentNotification({
      ...record, shift: record.shift ? fromShiftCode(record.shift) : null,
    }, "created"));
    return record;
  });
  const dto = toTemporaryAssignmentDto(created);

  await recordAuditLog({
    actorUserId: context.userId,
    action: "assignment.create",
    entityType: "TemporaryAssignment",
    entityId: dto.id,
    oldValues: auditValues(context, dto, dto.primaryAreaName),
    newValues: auditValues(context, dto, dto.areaName),
  });

  return NextResponse.json(
    { assignment: dto, qualificationCheck: await getQualificationCheck(input) },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) return unauthorized();
  if (!hasPermission(context, "editAssignments")) return forbidden();

  const body = (await request.json().catch(() => null)) as
    | (Partial<TemporaryAssignmentInput> & { id?: string; action?: "update" | "cancel" })
    | null;
  if (!body?.id || typeof body.id !== "string") {
    return NextResponse.json({ error: "Kein Einsatz angegeben." }, { status: 400 });
  }

  const existingRecord = await prisma.temporaryAssignment.findUnique({
    where: { id: body.id },
    include: temporaryAssignmentRelations,
  });
  if (!existingRecord) {
    return NextResponse.json({ error: "Einsatz nicht gefunden." }, { status: 404 });
  }
  if (existingRecord.cancelledAt) {
    return NextResponse.json({ error: "Der Einsatz wurde bereits storniert." }, { status: 409 });
  }
  const before = toTemporaryAssignmentDto(existingRecord);

  if (body.action === "cancel") {
    const cancelled = await prisma.$transaction(async (tx) => {
      const changed = await tx.temporaryAssignment.updateMany({
        where: { id: before.id, cancelledAt: null, updatedAt: existingRecord.updatedAt },
        data: { cancelledAt: new Date() },
      });
      if (changed.count === 0) return null;
      const record = await tx.temporaryAssignment.findUniqueOrThrow({
        where: { id: before.id }, include: temporaryAssignmentRelations,
      });
      await createNotification(tx, assignmentNotification({
        ...record, shift: record.shift ? fromShiftCode(record.shift) : null,
      }, "cancelled"));
      return record;
    });
    if (!cancelled) {
      return NextResponse.json({ error: "Der Einsatz wurde inzwischen geändert. Bitte neu laden." }, { status: 409 });
    }
    const dto = toTemporaryAssignmentDto(cancelled);

    await recordAuditLog({
      actorUserId: context.userId,
      action: "assignment.cancel",
      entityType: "TemporaryAssignment",
      entityId: dto.id,
      oldValues: auditValues(context, before, before.areaName),
      newValues: auditValues(context, dto, dto.primaryAreaName),
    });

    return NextResponse.json({ assignment: dto, qualificationCheck: null });
  }

  const validation = await validateInput(
    { ...body, employeeId: before.employeeId },
    before.id,
  );
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }
  const { input } = validation;

  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.temporaryAssignment.updateMany({
      where: { id: before.id, cancelledAt: null, updatedAt: existingRecord.updatedAt },
      data: {
        departmentId: input.areaId,
        startDate: toDate(input.startDate),
        endDate: toDate(input.endDate),
        shift: input.shift ? labelToShiftCode[input.shift] : null,
        note: input.note || null,
      },
    });
    if (changed.count === 0) return null;
    const record = await tx.temporaryAssignment.findUniqueOrThrow({
      where: { id: before.id }, include: temporaryAssignmentRelations,
    });
    const hasChanges = before.areaId !== input.areaId ||
      before.startDate !== input.startDate || before.endDate !== input.endDate ||
      before.shift !== input.shift || before.note !== input.note;
    if (hasChanges) {
      await createNotification(tx, assignmentNotification({
        ...record, shift: record.shift ? fromShiftCode(record.shift) : null,
      }, "updated", {
        ...existingRecord, shift: existingRecord.shift ? fromShiftCode(existingRecord.shift) : null,
      }));
    }
    return record;
  });
  if (!updated) {
    return NextResponse.json({ error: "Der Einsatz wurde inzwischen geändert. Bitte neu laden." }, { status: 409 });
  }
  const dto = toTemporaryAssignmentDto(updated);

  await recordAuditLog({
    actorUserId: context.userId,
    action: "assignment.update",
    entityType: "TemporaryAssignment",
    entityId: dto.id,
    oldValues: auditValues(context, before, before.areaName),
    newValues: auditValues(context, dto, dto.areaName),
  });

  return NextResponse.json({ assignment: dto, qualificationCheck: await getQualificationCheck(input) });
}
