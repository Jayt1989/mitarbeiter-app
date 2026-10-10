import { AbsenceStatus, VacationStatus, type PerformanceArea, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";
import type { AuthorizationContext } from "@/lib/authorization";
import { employeeRelations, fromShiftCode, toEmployeeDto, toShiftCode } from "@/lib/employee-mapper";
import { toEmployeeShiftPlan } from "@/app/mitarbeiter/schedule";
import { getShiftForDate } from "@/app/schichtplan/rotation";
import { addDaysToKey, berlinNowParts, dateKeyToUtc } from "@/lib/calendar";
import {
  MAX_SHIFT_MINUTES,
  PerformanceError,
  canRecordPerformance,
  canManagePerformanceTargets,
  canViewPerformance,
  parseWorkstationTarget,
  performanceMetrics,
  performanceAreaLabels,
  resolvePerformanceShift,
  type PerformanceAreaId,
  type PerformanceInput,
  type ResolvedShift,
  type PerformanceWorkstation,
} from "@/lib/performance-rules";

type Db = Prisma.TransactionClient;

export type PerformanceEntryDto = {
  id: string;
  workDate: string;
  shift: string;
  area: PerformanceAreaId;
  areaLabel: string;
  workstation: string;
  quantity: number;
  durationMinutes: number;
  targetPerHour: number | null;
  perHour: number;
  achievement: number | null;
  note: string | null;
  createdAt: string;
};

type EntryRecord = Prisma.PerformanceEntryGetPayload<object>;

function toDto(entry: EntryRecord): PerformanceEntryDto {
  return {
    id: entry.id,
    workDate: entry.workDate.toISOString().slice(0, 10),
    shift: fromShiftCode(entry.shift),
    area: entry.area,
    areaLabel: performanceAreaLabels[entry.area],
    workstation: entry.workstation,
    quantity: entry.quantity,
    durationMinutes: entry.durationMinutes,
    targetPerHour: entry.targetPerHour,
    ...performanceMetrics(entry),
    note: entry.note,
    createdAt: entry.createdAt.toISOString(),
  };
}

export async function listPerformanceWorkstations(): Promise<PerformanceWorkstation[]> {
  return prisma.performanceWorkstation.findMany({
    select: { code: true, area: true, targetPerHour: true },
    orderBy: { code: "asc" },
  });
}

export async function updatePerformanceTarget(
  context: AuthorizationContext, code: string, rawTarget: string,
) {
  if (!canManagePerformanceTargets(context)) {
    throw new PerformanceError("Du hast keine Berechtigung, Sollwerte zu ändern.", 403);
  }
  const targetPerHour = parseWorkstationTarget(code, rawTarget);
  await prisma.$transaction(async (tx) => {
    const workstation = await tx.performanceWorkstation.findUnique({ where: { code } });
    if (!workstation) throw new PerformanceError("Der Arbeitsplatz wurde nicht gefunden.", 404);
    await tx.performanceWorkstation.update({ where: { code }, data: { targetPerHour } });
    await recordAuditLog({
      actorUserId: context.userId,
      action: "performance.target.update",
      entityType: "PerformanceWorkstation",
      entityId: code,
      oldValues: { targetPerHour: workstation.targetPerHour },
      newValues: { targetPerHour },
    }, tx);
  });
}

function assertCanRecord(context: AuthorizationContext): string {
  if (!canRecordPerformance(context)) {
    throw new PerformanceError("Du hast keine Berechtigung, Leistungen zu erfassen.", 403);
  }
  return context.employeeId!;
}

/** Schichttag und Schicht werden ausschließlich serverseitig aus Login, Uhrzeit und Schichtplan ermittelt. */
async function resolveShiftForEmployee(db: Db, employeeId: string, now: Date) {
  const record = await db.employee.findUnique({ where: { id: employeeId }, include: employeeRelations });
  if (!record || !record.isActive) throw new PerformanceError("Dein Mitarbeiterkonto ist nicht aktiv.", 403);

  const { dateKey: todayKey, hour } = berlinNowParts(now);
  const yesterdayKey = addDaysToKey(todayKey, -1);
  const range = { startDate: { lte: dateKeyToUtc(todayKey) }, endDate: { gte: dateKeyToUtc(yesterdayKey) } };
  const [vacations, absences] = await Promise.all([
    db.vacationRequest.findMany({ where: { employeeId, status: VacationStatus.APPROVED, ...range } }),
    db.absence.findMany({ where: { employeeId, status: { not: AbsenceStatus.REQUESTED }, ...range } }),
  ]);
  const employee = toEmployeeDto(record);
  const plan = toEmployeeShiftPlan(employee);
  const covers = (dateKey: string) => (entry: { startDate: Date; endDate: Date }) =>
    entry.startDate <= dateKeyToUtc(dateKey) && entry.endDate >= dateKeyToUtc(dateKey);

  const resolved = resolvePerformanceShift(todayKey, hour, yesterdayKey, (dateKey) => ({
    shift: getShiftForDate(dateKeyToUtc(dateKey), plan),
    vacation: vacations.some(covers(dateKey)),
    absence: absences.some(covers(dateKey)),
  }));
  return { record, resolved };
}

export type RecordingOverview = {
  employeeName: string;
  personnelNumber: string;
  resolved: ResolvedShift;
  entries: PerformanceEntryDto[];
  workstations: PerformanceWorkstation[];
};

export async function loadRecordingOverview(
  context: AuthorizationContext, now = new Date(),
): Promise<RecordingOverview> {
  const employeeId = assertCanRecord(context);
  const { record, resolved } = await resolveShiftForEmployee(prisma, employeeId, now);
  const showDetails = canViewPerformance(context);
  const entries = showDetails ? await prisma.performanceEntry.findMany({
    where: { employeeId, workDate: dateKeyToUtc(resolved.dateKey) },
    orderBy: { createdAt: "desc" },
  }) : [];
  return {
    employeeName: `${record.firstName} ${record.lastName}`,
    personnelNumber: record.personnelNumber,
    resolved,
    entries: entries.map(toDto),
    workstations: showDetails ? await listPerformanceWorkstations() : [],
  };
}

export async function createPerformanceEntry(
  context: AuthorizationContext, input: PerformanceInput, now = new Date(),
) {
  const employeeId = assertCanRecord(context);
  return prisma.$transaction(async (tx) => {
    const { resolved } = await resolveShiftForEmployee(tx, employeeId, now);
    if (!resolved.ok) throw new PerformanceError(resolved.reason, 409);
    const workDate = dateKeyToUtc(resolved.dateKey);

    const booked = await tx.performanceEntry.aggregate({
      where: { employeeId, workDate },
      _sum: { durationMinutes: true },
    });
    if ((booked._sum.durationMinutes ?? 0) + input.durationMinutes > MAX_SHIFT_MINUTES) {
      throw new PerformanceError(
        "Die erfasste Arbeitszeit dieser Schicht würde 16 Stunden überschreiten. Bitte Angaben prüfen.",
        409,
      );
    }

    const workstation = await tx.performanceWorkstation.findUnique({ where: { code: input.workstation } });
    if (!workstation || workstation.area !== input.area) {
      throw new PerformanceError("Der Arbeitsplatz ist für diesen Bereich nicht eingerichtet.", 409);
    }
    const entry = await tx.performanceEntry.create({
      data: {
        employeeId,
        workDate,
        shift: toShiftCode(resolved.shift),
        area: input.area as PerformanceArea,
        workstation: input.workstation,
        quantity: input.quantity,
        durationMinutes: input.durationMinutes,
        targetPerHour: workstation.targetPerHour,
        note: input.note,
        createdById: context.userId,
      },
    });
    await recordAuditLog({
      actorUserId: context.userId,
      action: "performance.create",
      entityType: "PerformanceEntry",
      entityId: entry.id,
      newValues: {
        employeeId,
        workDate: resolved.dateKey,
        shift: resolved.shift,
        area: input.area,
        workstation: input.workstation,
        quantity: input.quantity,
        durationMinutes: input.durationMinutes,
        targetPerHour: entry.targetPerHour,
        note: input.note,
      },
    }, tx);
    return toDto(entry);
  });
}

/** Eigene Einträge können nur für den aktuellen Schichttag zurückgenommen werden. */
export async function deleteOwnPerformanceEntry(
  context: AuthorizationContext, entryId: string, now = new Date(),
) {
  const employeeId = assertCanRecord(context);
  await prisma.$transaction(async (tx) => {
    const entry = await tx.performanceEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.employeeId !== employeeId) {
      throw new PerformanceError("Der Eintrag wurde nicht gefunden.", 404);
    }
    const { resolved } = await resolveShiftForEmployee(tx, employeeId, now);
    if (entry.workDate.toISOString().slice(0, 10) !== resolved.dateKey) {
      throw new PerformanceError("Nur Einträge der aktuellen Schicht können gelöscht werden.", 409);
    }
    await tx.performanceEntry.delete({ where: { id: entry.id } });
    await recordAuditLog({
      actorUserId: context.userId,
      action: "performance.delete",
      entityType: "PerformanceEntry",
      entityId: entry.id,
      oldValues: toDto(entry),
    }, tx);
  });
}

export type PerformanceFilter = {
  from: string;
  to: string;
  area: PerformanceAreaId | null;
  shift: "Früh" | "Spät" | "Nacht" | null;
};

export type PerformanceReportRow = PerformanceEntryDto & {
  employeeId: string;
  employeeName: string;
  personnelNumber: string;
};

export async function listPerformance(filter: PerformanceFilter): Promise<PerformanceReportRow[]> {
  const records = await prisma.performanceEntry.findMany({
    where: {
      workDate: { gte: dateKeyToUtc(filter.from), lte: dateKeyToUtc(filter.to) },
      ...(filter.area ? { area: filter.area as PerformanceArea } : {}),
      ...(filter.shift ? { shift: toShiftCode(filter.shift) } : {}),
    },
    include: { employee: { select: { firstName: true, lastName: true, personnelNumber: true } } },
    orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
    take: 2000,
  });
  return records.map((record) => ({
    ...toDto(record),
    employeeId: record.employeeId,
    employeeName: `${record.employee.firstName} ${record.employee.lastName}`,
    personnelNumber: record.employee.personnelNumber,
  }));
}
