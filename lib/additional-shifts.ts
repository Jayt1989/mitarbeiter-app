import { Prisma, type ShiftCode } from "@prisma/client";
import { prisma } from "./prisma";
import type { AuthorizationContext } from "./authorization";
import { employeeRelations, fromShiftCode, toEmployeeDto } from "./employee-mapper";
import { toEmployeeShiftPlan } from "@/app/mitarbeiter/schedule";
import { getShiftForDate, type ActiveShift } from "@/app/schichtplan/rotation";
import { addDaysToKey, berlinTodayKey, dateKeyToUtc } from "./calendar";
import { intervalsOverlap, shiftInterval, shiftTimeLabel } from "./shift-interval";
import { checkAssignmentQualification } from "@/app/admin/assignments-data";
import { toAreaConfiguration } from "./area-mapper";
import { recordAuditLog } from "./audit";
import { createNotification } from "./notifications";
import { notificationDate } from "./notification-messages";
import { AdditionalShiftError, requireAdditionalShift, type AdditionalShiftBatch,
  type AdditionalShiftInput, type AdditionalShiftIssue } from "./additional-shift-rules";

type Db = Prisma.TransactionClient;
export const additionalShiftRelations = {
  employee: { select: { firstName: true, lastName: true } },
  department: { select: { name: true } },
} satisfies Prisma.AdditionalShiftInclude;
type Record = Prisma.AdditionalShiftGetPayload<{ include: typeof additionalShiftRelations }>;

export function additionalShiftDto(record: Record) {
  if (record.shift === "OFF") throw new AdditionalShiftError("Ungültige Zusatzschicht in der Datenbank.", 500);
  return { id: record.id, employeeId: record.employeeId,
    employeeName: `${record.employee.firstName} ${record.employee.lastName}`,
    date: record.date.toISOString().slice(0, 10), shift: record.shift,
    departmentId: record.departmentId, departmentName: record.department.name,
    status: record.status, note: record.note ?? "", updatedAt: record.updatedAt.toISOString(),
    releasedAt: record.releasedAt?.toISOString() ?? null, cancelledAt: record.cancelledAt?.toISOString() ?? null };
}
export type AdditionalShiftDto = ReturnType<typeof additionalShiftDto>;

export async function checkAdditionalShifts(db: Db, input: AdditionalShiftBatch, ignoreId?: string) {
  const targetDate = dateKeyToUtc(input.date);
  const shift = fromShiftCode(input.shift) as ActiveShift;
  const interval = shiftInterval(input.date, shift);
  const from = addDaysToKey(input.date, -1);
  const to = addDaysToKey(input.date, 1);
  const employeeId = { in: input.employeeIds };
  const overlap = { employeeId, startDate: { lte: dateKeyToUtc(to) }, endDate: { gte: dateKeyToUtc(from) } };
  const [records, department, vacations, absences, additional, assignments, swaps] = await Promise.all([
    db.employee.findMany({ where: { id: employeeId }, include: employeeRelations }),
    db.department.findUnique({ where: { id: input.departmentId }, include: { minimumStaffing: true } }),
    db.vacationRequest.findMany({ where: { ...overlap, status: { in: ["REQUESTED", "APPROVED"] } } }),
    db.absence.findMany({ where: overlap }),
    db.additionalShift.findMany({ where: { employeeId, status: { not: "STORNIERT" },
      date: { gte: dateKeyToUtc(from), lte: dateKeyToUtc(to) }, ...(ignoreId ? { id: { not: ignoreId } } : {}) } }),
    db.temporaryAssignment.findMany({ where: { ...overlap, cancelledAt: null } }),
    db.shiftSwapRequest.findMany({ where: {
      OR: [{ requesterId: employeeId }, { partnerId: employeeId }],
      date: { gte: dateKeyToUtc(from), lte: dateKeyToUtc(to) },
      status: { in: ["ANGEFRAGT", "PARTNER_BESTAETIGT", "GENEHMIGT"] },
    } }),
  ]);
  if (!department?.active) throw new AdditionalShiftError("Der Zielbereich ist nicht aktiv oder wurde nicht gefunden.", 400);
  const issues: AdditionalShiftIssue[] = [];
  const periodConflict = (entry: { startDate: Date; endDate: Date }) => {
    const start = entry.startDate.toISOString().slice(0, 10);
    const end = entry.endDate.toISOString().slice(0, 10);
    return input.date >= start && input.date <= end ||
      shift === "Nacht" && to >= start && to <= end;
  };
  for (const id of input.employeeIds) {
    const record = records.find((entry) => entry.id === id);
    const name = record ? `${record.firstName} ${record.lastName}` : "Unbekannter Mitarbeiter";
    const issue = (message: string, blocking = true) => issues.push({ employeeId: id, employeeName: name, message, blocking });
    if (!record || !record.isActive || record.user?.active === false) {
      issue("Mitarbeiterkonto ist nicht aktiv oder nicht vorhanden.");
      continue;
    }
    const employee = toEmployeeDto(record);
    const plan = toEmployeeShiftPlan({ ...employee, additionalShifts: {} });
    for (const date of [from, input.date, to]) {
      const existing = getShiftForDate(dateKeyToUtc(date), plan);
      if (record.shiftAssignments.some((entry) => entry.date.getTime() === dateKeyToUtc(date).getTime() &&
        (entry.source === "MANUAL" || employee.shiftModel === "individuell")) && date === input.date) {
        issue("Am Zieltag besteht eine individuelle Schichtzuweisung / ShiftOverride.");
      }
      if (existing && existing !== "Frei" && intervalsOverlap(interval, shiftInterval(date, existing))) {
        issue(`Bestehende Schicht (${existing}, ${notificationDate(dateKeyToUtc(date))}) überschneidet sich.`);
      } else if (date === input.date && existing && existing !== "Frei") {
        issue("Am Zieltag besteht bereits eine normale Schicht.");
      }
    }
    if (vacations.some((entry) => entry.employeeId === id && periodConflict(entry))) issue("Offener oder genehmigter Urlaub im Schichtzeitraum.");
    if (absences.some((entry) => entry.employeeId === id && periodConflict(entry))) issue("Krankheit / Abwesenheit im Schichtzeitraum.");
    if (additional.some((entry) => entry.employeeId === id && (entry.date.getTime() === targetDate.getTime() ||
      intervalsOverlap(interval, shiftInterval(entry.date.toISOString().slice(0, 10), fromShiftCode(entry.shift) as ActiveShift))))) {
      issue("Es besteht bereits eine andere Zusatzschicht / Doppelbelegung.");
    }
    if (assignments.some((entry) => entry.employeeId === id && periodConflict(entry))) issue("Temporärer Einsatz im Schichtzeitraum.");
    if (swaps.some((entry) => (entry.requesterId === id || entry.partnerId === id) &&
      (entry.date.getTime() === targetDate.getTime() ||
        intervalsOverlap(interval, shiftInterval(entry.date.toISOString().slice(0, 10),
          fromShiftCode(entry.requesterId === id ? entry.requesterOriginalShift : entry.partnerOriginalShift) as ActiveShift))))) {
      issue("Offener oder genehmigter Schichttausch im Schichtzeitraum.");
    }
    const check = checkAssignmentQualification(employee, input.departmentId, shift, toAreaConfiguration([department]));
    if (check.status === "Nicht qualifiziert" || check.status === "Eingeschränkt") {
      issue(`Qualifikation im Zielbereich: ${check.status} (Stufe ${check.level}).`, false);
    }
  }
  return issues;
}

function assertNoConflicts(issues: AdditionalShiftIssue[]) {
  if (issues.some((issue) => issue.blocking)) throw new AdditionalShiftError("Zusatzschicht kann wegen Planungskonflikten nicht gespeichert/freigegeben werden.", 409, issues);
}
function futureDate(date: string) {
  if (date < berlinTodayKey()) throw new AdditionalShiftError("Zusatzschichten können nur für heute oder die Zukunft geplant/freigegeben werden.");
}
async function audit(db: Db, context: AuthorizationContext, action: string, record: Record, before?: Record) {
  await recordAuditLog({ actorUserId: context.userId, action: `additional_shift.${action}`,
    entityType: "AdditionalShift", entityId: record.id,
    ...(before ? { oldValues: additionalShiftDto(before) } : {}),
    newValues: additionalShiftDto(record) }, db);
}
async function notify(db: Db, record: Record, action: "released" | "updated" | "cancelled", before?: Record) {
  const shift = fromShiftCode(record.shift) as ActiveShift;
  const weekday = new Intl.DateTimeFormat("de-DE", { weekday: "long", timeZone: "UTC" }).format(record.date);
  const details = `${weekday}, ${notificationDate(record.date)}, ${shift}schicht (${shiftTimeLabel(shift)}) im Bereich ${record.department.name}`;
  const messages = {
    released: `Du wurdest für ${details} eingeplant. Zusatzschicht.`,
    updated: `Deine Zusatzschicht wurde geändert${before ? ` (bisher ${notificationDate(before.date)}, ${fromShiftCode(before.shift)}, ${before.department.name})` : ""}: ${details}.`,
    cancelled: `Deine Zusatzschicht für ${details} wurde storniert.`,
  };
  const types = { released: "ADDITIONAL_SHIFT_RELEASED", updated: "ADDITIONAL_SHIFT_UPDATED", cancelled: "ADDITIONAL_SHIFT_CANCELLED" } as const;
  await createNotification(db, { employeeId: record.employeeId, title: action === "cancelled" ? "Zusatzschicht storniert" : "Zusatzschicht",
    message: messages[action], type: types[action], link: "/schichtplan" });
}
const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 };

export async function createAdditionalShifts(context: AuthorizationContext, input: AdditionalShiftBatch) {
  requireAdditionalShift(context, "planAdditionalShifts");
  futureDate(input.date);
  return prisma.$transaction(async (db) => {
    const issues = await checkAdditionalShifts(db, input);
    assertNoConflicts(issues);
    const entries: AdditionalShiftDto[] = [];
    for (const employeeId of input.employeeIds) {
      const record = await db.additionalShift.create({
        data: { employeeId, date: dateKeyToUtc(input.date), shift: input.shift,
          departmentId: input.departmentId, note: input.note || null, createdById: context.userId },
        include: additionalShiftRelations,
      });
      await audit(db, context, "create", record);
      entries.push(additionalShiftDto(record));
    }
    return { entries, issues };
  }, transactionOptions);
}

export async function changeAdditionalShift(context: AuthorizationContext, id: string, updatedAt: string,
  action: "update" | "release" | "cancel", input?: AdditionalShiftInput) {
  requireAdditionalShift(context, action === "release" ? "releaseAdditionalShifts" : action === "cancel" ? "cancelAdditionalShifts" : "planAdditionalShifts");
  return prisma.$transaction(async (db) => {
    const before = await db.additionalShift.findUnique({ where: { id }, include: additionalShiftRelations });
    if (!before) throw new AdditionalShiftError("Zusatzschicht nicht gefunden.", 404);
    if (before.updatedAt.toISOString() !== updatedAt) throw new AdditionalShiftError("Die Zusatzschicht wurde inzwischen geändert. Bitte neu laden.", 409);
    if (before.status === "STORNIERT") throw new AdditionalShiftError("Stornierte Zusatzschichten können nicht geändert oder erneut freigegeben werden.", 409);
    if (action === "release" && before.status !== "ENTWURF") throw new AdditionalShiftError("Die Zusatzschicht ist bereits freigegeben.", 409);
    if (action === "update" && before.status === "FREIGEGEBEN") requireAdditionalShift(context, "releaseAdditionalShifts");
    const values = input ?? { date: before.date.toISOString().slice(0, 10), shift: before.shift as Exclude<ShiftCode, "OFF">,
      departmentId: before.departmentId, note: before.note ?? "" };
    let issues: AdditionalShiftIssue[] = [];
    if (action !== "cancel") {
      futureDate(values.date);
      issues = await checkAdditionalShifts(db, { ...values, employeeIds: [before.employeeId] }, id);
      assertNoConflicts(issues);
    }
    const record = await db.additionalShift.update({
      where: { id }, data: action === "cancel" ? { status: "STORNIERT", cancelledAt: new Date() }
        : action === "release" ? { status: "FREIGEGEBEN", releasedAt: new Date(), releasedById: context.userId }
        : { date: dateKeyToUtc(values.date), shift: values.shift, departmentId: values.departmentId, note: values.note || null },
      include: additionalShiftRelations,
    });
    await audit(db, context, action, record, before);
    if (action === "release" || before.status === "FREIGEGEBEN") {
      await notify(db, record, action === "release" ? "released" : action === "cancel" ? "cancelled" : "updated", before);
    }
    return { entry: additionalShiftDto(record), issues };
  }, transactionOptions);
}
