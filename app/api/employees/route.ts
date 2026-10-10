import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { recordAuditLog } from "@/lib/audit";
import {
  employeeRelations,
  toEmployeeDto,
  toShiftCode,
  fromShiftCode,
} from "@/lib/employee-mapper";
import type { Employee } from "@/app/mitarbeiter/data";
import {
  accountErrorResponse,
  assertNoSelfLockout,
  assertUniqueIdentity,
  canManageAccounts,
  createEmployeeWithAccount,
  normalizeEmail,
  syncLinkedUser,
  writeEmployeeCore,
} from "@/lib/user-accounts";
import { toEmployeeShiftPlan } from "@/app/mitarbeiter/schedule";
import { getShiftForDate } from "@/app/schichtplan/rotation";
import { createNotification } from "@/lib/notifications";
import { shiftNotification } from "@/lib/notification-messages";
import { isValidDateKey } from "@/app/admin/assignments-data";
import { deletedEmployeeIds } from "@/lib/employee-deletion";
import { canReadEmployeeOverview, employeeOverviewScopes, toOverviewEmployee } from "@/lib/employee-overview";
import { assertAdditionalRotation } from "@/lib/additional-shift-conflicts";
import { AdditionalShiftError } from "@/lib/additional-shift-rules";

export async function GET(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  const requestedScope = new URL(request.url).searchParams.get("scope");
  const scope = employeeOverviewScopes.find((value) => value === requestedScope);
  if (requestedScope && !scope) {
    return NextResponse.json({ error: "Unbekannte Mitarbeiteransicht" }, { status: 400 });
  }
  const allowed = scope ? canReadEmployeeOverview(context, scope)
    : hasPermission(context, "viewEmployees") || hasPermission(context, "editEmployees");
  if (!allowed) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const records = await prisma.employee.findMany({
    include: employeeRelations,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return NextResponse.json(records.map((record) => {
    const employee = toEmployeeDto(record);
    return scope ? toOverviewEmployee(employee, scope) : employee;
  }), { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  if (!canManageAccounts(context)) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as Employee[] | null;
  if (!Array.isArray(payload) || payload.some((employee) =>
    !employee || typeof employee !== "object" ||
    typeof employee.firstName !== "string" || !employee.firstName.trim() ||
    typeof employee.lastName !== "string" || !employee.lastName.trim() ||
    typeof employee.personnelNumber !== "string" || !employee.personnelNumber.trim() ||
    (employee.email !== undefined && employee.email !== null && typeof employee.email !== "string")
  )) {
    return NextResponse.json({ error: "Ungültige Mitarbeiterdaten" }, { status: 400 });
  }
  if (payload.some((employee) =>
    Object.entries(employee.individualAssignments ?? {}).some(([date, shift]) =>
      !isValidDateKey(date) || !["Früh", "Spät", "Nacht", "Frei"].includes(shift),
    ),
  )) {
    return NextResponse.json({ error: "Ungültige manuelle Schichtzuweisung" }, { status: 400 });
  }

  // Eine veraltete Liste (z. B. zweiter Browser-Tab) darf gelöschte Mitarbeiter nicht neu anlegen.
  const payloadIds = payload.map((employee) => employee.id).filter((id): id is string => !!id);
  const existingIds = new Set(
    (await prisma.employee.findMany({ where: { id: { in: payloadIds } }, select: { id: true } })).map((row) => row.id),
  );
  const deletedIds = await deletedEmployeeIds(prisma, payloadIds.filter((id) => !existingIds.has(id)));

  for (const employee of payload) {
    if (employee.id && deletedIds.has(employee.id)) continue;
    const existing = employee.id
      ? await prisma.employee.findUnique({ where: { id: employee.id }, include: employeeRelations })
      : null;
    const before = existing ? toEmployeeDto(existing) : null;

    let record: Awaited<ReturnType<typeof writeEmployeeCore>>;
    try {
      assertNoSelfLockout(context, employee);
      await assertUniqueIdentity(prisma, {
        personnelNumber: employee.personnelNumber.trim(),
        email: normalizeEmail(employee.email),
        employeeId: employee.id || undefined,
        userId: existing?.user?.id,
      });
      record = await prisma.$transaction(async (tx) => {
        const saved = await writeEmployeeCore(tx, employee);
        await assertAdditionalRotation(tx, { ...employee, id: saved.id });
        if (existing) await syncLinkedUser(tx, context, { ...employee, id: saved.id }, existing.personnelNumber);
        return saved;
      }, { timeout: 20_000, isolationLevel: "Serializable" });
    } catch (error) {
      if (error instanceof AdditionalShiftError) return NextResponse.json({ error: error.message }, { status: error.status });
      const response = accountErrorResponse(error);
      if (response) return NextResponse.json(response.body, { status: response.status });
      throw error;
    }

    if (employee.individualAssignments) {
      for (const [date, shift] of Object.entries(employee.individualAssignments)) {
        const assignmentDate = new Date(`${date}T00:00:00.000Z`);
        try {
          await prisma.$transaction(async (tx) => {
            await assertAdditionalRotation(tx, { ...employee, id: record.id });
            const key = { employeeId: record.id, date: assignmentDate };
            const assignment = await tx.shiftAssignment.findUnique({
              where: { employeeId_date: key },
            });
            const nextShift = toShiftCode(shift);
            if (assignment?.source === "MANUAL" && assignment.shift === nextShift) return;
            const previousShift = assignment?.source === "MANUAL"
              ? fromShiftCode(assignment.shift)
              : before ? getShiftForDate(assignmentDate, toEmployeeShiftPlan(before)) : null;
            if (assignment) {
              const changed = await tx.shiftAssignment.updateMany({
                where: { id: assignment.id, shift: assignment.shift, updatedAt: assignment.updatedAt },
                data: { shift: nextShift, source: "MANUAL" },
              });
              if (changed.count === 0) throw new Error("Die Schicht wurde inzwischen geändert. Bitte neu laden.");
            } else {
              await tx.shiftAssignment.create({ data: { ...key, shift: nextShift, source: "MANUAL" } });
            }
            if (previousShift !== shift) await createNotification(tx, shiftNotification(record.id, assignmentDate, previousShift, shift));
          }, { isolationLevel: "Serializable" });
        } catch (error) {
          if (error instanceof AdditionalShiftError) return NextResponse.json({ error: error.message }, { status: error.status });
          throw error;
        }
      }
    }

    await recordAuditLog({
      actorUserId: context.userId,
      action: before ? "employee.update" : "employee.create",
      entityType: "Employee",
      entityId: record.id,
      oldValues: before,
      newValues: { ...employee, account: undefined, id: record.id },
    });
  }

  const records = await prisma.employee.findMany({
    include: employeeRelations,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return NextResponse.json(records.map(toEmployeeDto));
}

/** Neuen Mitarbeiter inklusive Benutzerkonto mit Startpasswort anlegen (nur Admin). */
export async function POST(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  if (!hasPermission(context, "editEmployees") || !canManageAccounts(context)) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as
    | { employee?: Employee; startPassword?: unknown }
    | null;
  const employee = body?.employee;
  if (
    !employee || typeof employee !== "object" ||
    typeof employee.firstName !== "string" || !employee.firstName.trim() ||
    typeof employee.lastName !== "string" || !employee.lastName.trim() ||
    typeof employee.personnelNumber !== "string" || !employee.personnelNumber.trim() ||
    typeof body?.startPassword !== "string"
  ) {
    return NextResponse.json(
      { error: "Bitte Vorname, Nachname, Personalnummer und Startpasswort angeben." },
      { status: 400 },
    );
  }
  try {
    const created = await createEmployeeWithAccount(context, employee, body.startPassword);
    const records = await prisma.employee.findMany({
      include: employeeRelations,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    return NextResponse.json(
      { created, employees: records.map(toEmployeeDto) },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const response = accountErrorResponse(error);
    if (response) return NextResponse.json(response.body, { status: response.status });
    throw error;
  }
}
