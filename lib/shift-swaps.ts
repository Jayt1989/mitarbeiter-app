import { Prisma, type PrismaClient, type ShiftSwapRequest } from "@prisma/client";
import { prisma } from "./prisma";
import type { AuthorizationContext } from "./authorization";
import { employeeRelations, fromShiftCode, toEmployeeDto, toShiftCode } from "./employee-mapper";
import { toEmployeeShiftPlan } from "@/app/mitarbeiter/schedule";
import { getShiftForDate } from "@/app/schichtplan/rotation";
import { berlinTodayKey, dateKeyToUtc } from "./calendar";
import { notificationDate, swapApprovalNotification } from "./notification-messages";
import { createNotification, notifyUsersWithPermission } from "./notifications";
import { recordAuditLog } from "./audit";
import {
  canRequestShiftSwaps, canReviewShiftSwaps, openSwapStatuses,
  ShiftSwapError, swapDayWarnings, swapTransition, type SwapAction,
} from "./shift-swap-rules";

export const swapRelations = {
  requester: { select: { firstName: true, lastName: true } },
  partner: { select: { firstName: true, lastName: true } },
} satisfies Prisma.ShiftSwapRequestInclude;
type SwapRecord = Prisma.ShiftSwapRequestGetPayload<{ include: typeof swapRelations }>;

export function toSwapDto(record: SwapRecord) {
  return {
    id: record.id,
    requesterId: record.requesterId,
    partnerId: record.partnerId,
    requesterName: `${record.requester.firstName} ${record.requester.lastName}`,
    partnerName: `${record.partner.firstName} ${record.partner.lastName}`,
    date: record.date.toISOString().slice(0, 10),
    requesterOriginalShift: fromShiftCode(record.requesterOriginalShift),
    partnerOriginalShift: fromShiftCode(record.partnerOriginalShift),
    requesterArea: record.requesterArea,
    partnerArea: record.partnerArea,
    status: record.status,
    comment: record.comment ?? "",
    partnerDecidedAt: record.partnerDecidedAt?.toISOString() ?? null,
    approvedAt: record.approvedAt?.toISOString() ?? null,
    rejectedAt: record.rejectedAt?.toISOString() ?? null,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}
export type ShiftSwapDto = ReturnType<typeof toSwapDto>;

type SwapDatabase = Pick<Prisma.TransactionClient,
  "employee" | "vacationRequest" | "absence" | "temporaryAssignment" | "shiftSwapRequest" |
  "shiftAssignment" | "notification" | "auditLog" | "user"
>;

function assertDate(date: Date) {
  if (date.toISOString().slice(0, 10) < berlinTodayKey()) {
    throw new ShiftSwapError("Ein Schichttausch ist nur für heute oder zukünftige Tage möglich.", 400);
  }
}

export async function loadSwapDays(
  db: SwapDatabase, date: Date, employeeIds?: string[], ignoreSwapId?: string,
) {
  const employees = await db.employee.findMany({
    where: employeeIds ? { id: { in: employeeIds } } : { isActive: true },
    include: employeeRelations,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const ids = employees.map((employee) => employee.id);
  const overlap = { employeeId: { in: ids }, startDate: { lte: date }, endDate: { gte: date } };
  const [vacations, absences, assignments, swaps] = await Promise.all([
    db.vacationRequest.findMany({
      where: { ...overlap, status: { in: ["REQUESTED", "APPROVED"] } },
      select: { employeeId: true },
    }),
    db.absence.findMany({ where: overlap, select: { employeeId: true } }),
    db.temporaryAssignment.findMany({
      where: { ...overlap, cancelledAt: null }, select: { employeeId: true },
    }),
    db.shiftSwapRequest.findMany({
      where: {
        date, status: { in: [...openSwapStatuses] },
        OR: [{ requesterId: { in: ids } }, { partnerId: { in: ids } }],
        ...(ignoreSwapId ? { id: { not: ignoreSwapId } } : {}),
      },
      select: { requesterId: true, partnerId: true },
    }),
  ]);
  return employees.map((record) => {
    const employee = toEmployeeDto(record);
    const shift = getShiftForDate(date, toEmployeeShiftPlan(employee));
    const facts = {
      name: `${record.firstName} ${record.lastName}`,
      active: record.isActive,
      shift,
      vacation: vacations.some((entry) => entry.employeeId === record.id),
      absence: absences.some((entry) => entry.employeeId === record.id),
      manual: record.shiftAssignments.some((entry) =>
        entry.source === "MANUAL" && entry.date.getTime() === date.getTime(),
      ),
      assignment: assignments.some((entry) => entry.employeeId === record.id),
      openSwap: swaps.some((entry) => entry.requesterId === record.id || entry.partnerId === record.id),
      additionalShift: record.additionalShifts.some((entry) => entry.date.getTime() === date.getTime()),
    };
    return {
      id: record.id,
      name: facts.name,
      area: record.departments.find((entry) => entry.isPrimary)?.department.name ?? null,
      shift,
      warnings: swapDayWarnings(facts),
    };
  });
}
export type SwapDay = Awaited<ReturnType<typeof loadSwapDays>>[number];

export async function checkSwap(
  db: SwapDatabase, requesterId: string, partnerId: string, date: Date, existing?: ShiftSwapRequest,
) {
  assertDate(date);
  if (requesterId === partnerId) throw new ShiftSwapError("Du kannst nicht mit dir selbst tauschen.", 400);
  const days = await loadSwapDays(db, date, [requesterId, partnerId], existing?.id);
  const requester = days.find((day) => day.id === requesterId);
  const partner = days.find((day) => day.id === partnerId);
  if (!requester || !partner) throw new ShiftSwapError("Mitarbeiter nicht gefunden.", 404);
  const warnings = [...requester.warnings, ...partner.warnings];
  if (requester.shift && requester.shift === partner.shift) {
    warnings.push("Beide Mitarbeiter haben dieselbe Schicht. Es gibt nichts zu tauschen.");
  }
  if (existing && (
    requester.shift !== fromShiftCode(existing.requesterOriginalShift) ||
    partner.shift !== fromShiftCode(existing.partnerOriginalShift)
  )) {
    warnings.push("Der Schichtplan wurde seit der Anfrage geändert. Bitte stornieren und neu anfragen.");
  }
  if (warnings.length) throw new ShiftSwapError("Der Schichttausch ist derzeit nicht möglich.", 409, warnings);
  if (!requester.shift || requester.shift === "Frei" || !partner.shift || partner.shift === "Frei") {
    throw new ShiftSwapError("Beide Mitarbeiter benötigen eine Arbeitsschicht.");
  }
  return { requester, partner, requesterShift: toShiftCode(requester.shift), partnerShift: toShiftCode(partner.shift) };
}

async function notifySwap(
  db: SwapDatabase, swap: ShiftSwapRequest, employeeId: string,
  type: "SWAP_REQUESTED" | "SWAP_PARTNER_CONFIRMED" | "SWAP_PARTNER_REJECTED" | "SWAP_APPROVED" | "SWAP_REJECTED" | "SWAP_CANCELLED",
  message: string,
) {
  await createNotification(db, {
    employeeId, title: "Schichttausch",
    message: `Schichttausch am ${notificationDate(swap.date)}: ${message}`,
    type, link: "/schichttausch",
  });
}

export async function createSwap(
  db: SwapDatabase, context: AuthorizationContext,
  input: { partnerId: string; date: string; comment?: string },
) {
  if (!canRequestShiftSwaps(context) || !context.employeeId) {
    throw new ShiftSwapError("Keine Berechtigung für eigene Tauschanfragen.", 403);
  }
  const date = dateKeyToUtc(input.date);
  const checked = await checkSwap(db, context.employeeId, input.partnerId, date);
  const swap = await db.shiftSwapRequest.create({
    data: {
      requesterId: context.employeeId, partnerId: input.partnerId, date,
      requesterOriginalShift: checked.requesterShift, partnerOriginalShift: checked.partnerShift,
      requesterArea: checked.requester.area, partnerArea: checked.partner.area,
      comment: input.comment?.trim() || null,
    },
    include: swapRelations,
  });
  await notifySwap(db, swap, swap.partnerId, "SWAP_REQUESTED",
    `${checked.requester.name} möchte ${checked.requester.shift} gegen deine Schicht ${checked.partner.shift} tauschen. Bitte bestätigen oder ablehnen.`);
  await recordAuditLog({
    actorUserId: context.userId, action: "shift_swap.request",
    entityType: "ShiftSwapRequest", entityId: swap.id, newValues: toSwapDto(swap),
  }, db);
  return toSwapDto(swap);
}

export async function decideSwap(
  db: SwapDatabase, context: AuthorizationContext, id: string, action: SwapAction,
) {
  const existing = await db.shiftSwapRequest.findUnique({ where: { id }, include: swapRelations });
  if (!existing) throw new ShiftSwapError("Tauschanfrage nicht gefunden.", 404);
  const status = swapTransition(context, existing, action);
  if (action === "confirm" || action === "approve") {
    await checkSwap(db, existing.requesterId, existing.partnerId, existing.date, existing);
  }
  const now = new Date();
  const changed = await db.shiftSwapRequest.updateMany({
    where: { id, status: existing.status, updatedAt: existing.updatedAt },
    data: {
      status,
      ...((action === "confirm" || action === "decline") ? { partnerDecidedAt: now } : {}),
      ...((action === "approve" || action === "reject") ? { approvedById: context.userId } : {}),
      ...(action === "approve" ? { approvedAt: now } : {}),
      ...((action === "reject" || action === "decline") ? { rejectedAt: now } : {}),
      ...(action === "cancel" ? { cancelledAt: now } : {}),
    },
  });
  if (!changed.count) throw new ShiftSwapError("Die Anfrage wurde inzwischen geändert. Bitte neu laden.");
  if (action === "approve") {
    for (const [employeeId, shift] of [
      [existing.requesterId, existing.partnerOriginalShift],
      [existing.partnerId, existing.requesterOriginalShift],
    ] as const) {
      await db.shiftAssignment.upsert({
        where: { employeeId_date: { employeeId, date: existing.date } },
        create: { employeeId, date: existing.date, shift, source: "MANUAL", note: `Schichttausch ${existing.id}` },
        update: { shift, source: "MANUAL", note: `Schichttausch ${existing.id}` },
      });
    }
  }
  const swap = await db.shiftSwapRequest.findUniqueOrThrow({ where: { id }, include: swapRelations });
  const requesterName = `${swap.requester.firstName} ${swap.requester.lastName}`;
  const partnerName = `${swap.partner.firstName} ${swap.partner.lastName}`;
  if (action === "confirm" || action === "decline") {
    await notifySwap(db, swap, swap.requesterId,
      action === "confirm" ? "SWAP_PARTNER_CONFIRMED" : "SWAP_PARTNER_REJECTED",
      action === "confirm" ? `${partnerName} hat zugestimmt. Die Freigabe durch Admin/Vorarbeiter steht noch aus.`
        : `${partnerName} hat die Anfrage abgelehnt. Deine Schicht bleibt unverändert.`);
    if (action === "confirm") {
      await notifyUsersWithPermission(db, "approveShiftSwap", (userId) =>
        swapApprovalNotification(userId, {
          id: swap.id, requesterName, partnerName,
        }));
    }
  } else if (action === "cancel") {
    await notifySwap(db, swap, swap.partnerId, "SWAP_CANCELLED",
      `${requesterName} hat die Anfrage storniert. Deine Schicht bleibt unverändert.`);
  } else {
    for (const employeeId of [swap.requesterId, swap.partnerId]) {
      const oldShift = employeeId === swap.requesterId ? swap.requesterOriginalShift : swap.partnerOriginalShift;
      const newShift = employeeId === swap.requesterId ? swap.partnerOriginalShift : swap.requesterOriginalShift;
      await notifySwap(db, swap, employeeId, action === "approve" ? "SWAP_APPROVED" : "SWAP_REJECTED",
        action === "approve" ? `Der Tausch wurde genehmigt. Deine Schicht wurde von ${fromShiftCode(oldShift)} auf ${fromShiftCode(newShift)} geändert.`
          : "Der Tausch wurde abgelehnt. Deine Schicht bleibt unverändert.");
    }
  }
  await recordAuditLog({
    actorUserId: context.userId, action: `shift_swap.${action}`,
    entityType: "ShiftSwapRequest", entityId: id, oldValues: toSwapDto(existing), newValues: toSwapDto(swap),
  }, db);
  return toSwapDto(swap);
}

export async function swapTransaction<T>(
  work: (db: Prisma.TransactionClient) => Promise<T>,
  db: Pick<PrismaClient, "$transaction"> = prisma,
) {
  return db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listSwaps(
  context: AuthorizationContext, review = false,
  db: Pick<Prisma.TransactionClient, "shiftSwapRequest"> = prisma,
) {
  if (review ? !canReviewShiftSwaps(context) : !canRequestShiftSwaps(context)) {
    throw new ShiftSwapError("Keine Berechtigung für Schichttausch.", 403);
  }
  let where: Prisma.ShiftSwapRequestWhereInput | undefined;
  if (!review) {
    const employeeId = context.employeeId;
    if (!employeeId) throw new ShiftSwapError("Kein Mitarbeiter zugeordnet.", 403);
    where = { OR: [{ requesterId: employeeId }, { partnerId: employeeId }] };
  }
  const records = await db.shiftSwapRequest.findMany({
    where,
    include: swapRelations,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return records.map(toSwapDto);
}
