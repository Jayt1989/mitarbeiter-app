import { Prisma, type PrismaClient } from "@prisma/client";
import { recordAuditLog } from "./audit";

type Db = Prisma.TransactionClient | PrismaClient;

/** Konten, die nie endgültig gelöscht werden dürfen (Haupt-Admin). */
export const protectedPersonnelNumbers = ["MA-1001"] as const;

export function isProtectedPersonnelNumber(value: string | null | undefined) {
  const normalized = value?.trim().toLocaleUpperCase("de");
  return !!normalized && protectedPersonnelNumbers.some((entry) => entry === normalized);
}

export type DeletionBlockerCode = "protected" | "self" | "admin" | "active" | "approvedSwaps" | "actionsForOthers";
export type DeletionBlocker = { code: DeletionBlockerCode; message: string };

export type DeletionImpactItem = { key: string; label: string; count: number; detail?: string };

export type EmployeeDeletionPreview = {
  employee: {
    id: string;
    name: string;
    personnelNumber: string;
    isActive: boolean;
    login: string | null;
    role: string | null;
  };
  /** Gründe, die ein Löschen ausschließen. */
  blockers: DeletionBlocker[];
  /** Historische Daten des Mitarbeiters, die nur mit ausdrücklicher Bestätigung mitgelöscht werden. */
  historical: DeletionImpactItem[];
  /** Unkritische Stammdaten, die zusammen mit dem Mitarbeiter entfernt werden. */
  removed: DeletionImpactItem[];
  /** Daten, die erhalten bleiben. */
  retained: DeletionImpactItem[];
  canDelete: boolean;
  /** Aktiv und weder geschützt noch das eigene Konto. */
  canDeactivate: boolean;
  requiresHistoryConfirmation: boolean;
  /** Prüfsumme, damit zwischen Vorschau und Löschen keine neuen Daten unbemerkt mitgelöscht werden. */
  fingerprint: string;
};

export class EmployeeDeletionError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

type Actor = { userId: string | null; employeeId: string | null };

const roleLabels: Record<string, string> = { ADMIN: "Admin", FOREMAN: "Vorarbeiter", EMPLOYEE: "Mitarbeiter" };

export async function analyzeEmployeeDeletion(
  db: Db,
  employeeId: string,
  actor: Actor | null,
): Promise<EmployeeDeletionPreview | null> {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    include: { user: { select: { id: true, login: true, active: true, role: { select: { code: true } } } } },
  });
  if (!employee) return null;
  const userId = employee.user?.id ?? null;
  const ownSwap = { OR: [{ requesterId: employeeId }, { partnerId: employeeId }] };
  const forOthers = { employeeId: { not: employeeId } };
  const none = Promise.resolve(0);

  const [
    vacationRequests, approvedVacations, absences, temporaryAssignments, manualAssignments,
    openOrClosedSwaps, approvedSwaps, rotationAssignments, vacationAccounts, qualifications,
    permissions, departments, notifications, auditAboutEmployee, auditByUser,
    decidedForOthers, absencesForOthers, assignmentsForOthers, companyDays, reviewedSwaps,
    performanceEntries,
  ] = await Promise.all([
    db.vacationRequest.count({ where: { employeeId } }),
    db.vacationRequest.count({ where: { employeeId, status: "APPROVED" } }),
    db.absence.count({ where: { employeeId } }),
    db.temporaryAssignment.count({ where: { employeeId } }),
    db.shiftAssignment.count({ where: { employeeId, source: "MANUAL" } }),
    db.shiftSwapRequest.count({ where: { ...ownSwap, status: { not: "GENEHMIGT" } } }),
    db.shiftSwapRequest.count({ where: { ...ownSwap, status: "GENEHMIGT" } }),
    db.shiftAssignment.count({ where: { employeeId, source: "ROTATION" } }),
    db.vacationAccount.count({ where: { employeeId } }),
    db.employeeQualification.count({ where: { employeeId } }),
    db.employeePermission.count({ where: { employeeId } }),
    db.employeeDepartment.count({ where: { employeeId } }),
    db.notification.count({ where: { employeeId } }),
    db.auditLog.count({
      where: { OR: [{ entityId: employeeId }, ...(userId ? [{ entityId: userId }] : [])] },
    }),
    userId ? db.auditLog.count({ where: { actorUserId: userId } }) : none,
    userId ? db.vacationRequest.count({ where: { approvedById: userId, ...forOthers } }) : none,
    userId ? db.absence.count({ where: { recordedById: userId, ...forOthers } }) : none,
    userId ? db.temporaryAssignment.count({ where: { createdById: userId, ...forOthers } }) : none,
    userId ? db.companyDay.count({ where: { createdById: userId } }) : none,
    userId ? db.shiftSwapRequest.count({ where: { approvedById: userId } }) : none,
    db.performanceEntry.count({ where: { employeeId } }),
  ]);

  const blockers: DeletionBlocker[] = [];
  const isProtected = isProtectedPersonnelNumber(employee.personnelNumber) || isProtectedPersonnelNumber(employee.user?.login);
  const isSelf = actor?.employeeId === employeeId || (!!actor?.userId && actor.userId === userId);
  if (isProtected) {
    blockers.push({ code: "protected", message: `Das Admin-Konto ${protectedPersonnelNumbers.join(", ")} ist geschützt und kann nicht gelöscht werden.` });
  }
  if (isSelf) {
    blockers.push({ code: "self", message: "Du kannst dein eigenes Konto nicht löschen." });
  }
  if (employee.user?.role.code === "ADMIN") {
    blockers.push({ code: "admin", message: "Admin-Konten können nicht gelöscht werden. Bitte vorher die Rolle ändern." });
  }
  if (employee.isActive || employee.user?.active) {
    blockers.push({ code: "active", message: "Der Mitarbeiter ist noch aktiv. Bitte zuerst deaktivieren." });
  }
  if (approvedSwaps) {
    blockers.push({ code: "approvedSwaps", message:
      `${approvedSwaps} genehmigte(r) Schichttausch(e) wirken im Schichtplan eines anderen Mitarbeiters. Bitte nur deaktivieren.`,
    });
  }
  const actionsForOthers = decidedForOthers + absencesForOthers + assignmentsForOthers + companyDays + reviewedSwaps;
  if (actionsForOthers) {
    blockers.push({ code: "actionsForOthers", message:
      `Das Konto hat ${actionsForOthers} Eintrag/Einträge für andere Mitarbeiter oder den Betrieb genehmigt bzw. erfasst. ` +
        "Beim Löschen ginge die Nachvollziehbarkeit verloren. Bitte nur deaktivieren.",
    });
  }

  const historical: DeletionImpactItem[] = [
    { key: "vacationRequests", label: "Urlaubsanträge", count: vacationRequests,
      detail: approvedVacations ? `davon ${approvedVacations} genehmigt` : undefined },
    { key: "absences", label: "Abwesenheiten (Krankheit, Schulung …)", count: absences },
    { key: "temporaryAssignments", label: "Temporäre Einsätze", count: temporaryAssignments },
    { key: "manualAssignments", label: "Manuelle Schichtzuweisungen / Overrides", count: manualAssignments },
    { key: "performanceEntries", label: "Erfasste Leistungen", count: performanceEntries },
    { key: "shiftSwaps", label: "Nicht genehmigte Schichttausch-Anfragen", count: openOrClosedSwaps,
      detail: openOrClosedSwaps ? "auch beim jeweiligen Tauschpartner nicht mehr sichtbar" : undefined },
  ].filter((item) => item.count > 0);

  const removed: DeletionImpactItem[] = [
    { key: "user", label: "Benutzerkonto (Login)", count: userId ? 1 : 0, detail: employee.user?.login },
    { key: "rotationAssignments", label: "Automatisch erzeugte Rotationsschichten", count: rotationAssignments },
    { key: "vacationAccounts", label: "Urlaubskonten", count: vacationAccounts },
    { key: "qualifications", label: "Qualifikationen", count: qualifications },
    { key: "permissions", label: "Einzelberechtigungen", count: permissions },
    { key: "departments", label: "Bereichszuordnungen", count: departments },
    { key: "notifications", label: "Benachrichtigungen", count: notifications },
  ].filter((item) => item.count > 0);

  const retained: DeletionImpactItem[] = [
    { key: "auditLogs", label: "Audit-Log-Einträge (bleiben unverändert erhalten)", count: auditAboutEmployee + auditByUser },
  ].filter((item) => item.count > 0);

  const fingerprint = [...historical, ...removed].map((item) => `${item.key}:${item.count}`).join("|");

  return {
    employee: {
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      personnelNumber: employee.personnelNumber,
      isActive: employee.isActive,
      login: employee.user?.login ?? null,
      role: employee.user ? roleLabels[employee.user.role.code] ?? employee.user.role.code : null,
    },
    blockers,
    historical,
    removed,
    retained,
    canDelete: blockers.length === 0,
    canDeactivate: (employee.isActive || !!employee.user?.active) && !isProtected && !isSelf,
    requiresHistoryConfirmation: historical.length > 0,
    fingerprint,
  };
}

export type DeleteEmployeeInput = {
  confirmation: string;
  confirmHistory: boolean;
  fingerprint: string;
};

/**
 * Löscht einen deaktivierten Mitarbeiter samt Benutzerkonto endgültig.
 * Alle Prüfungen laufen erneut innerhalb einer serialisierbaren Transaktion.
 */
export async function deleteEmployeePermanently(
  db: PrismaClient,
  actor: Actor,
  employeeId: string,
  input: DeleteEmployeeInput,
) {
  return db.$transaction(async (tx) => {
    const preview = await analyzeEmployeeDeletion(tx, employeeId, actor);
    if (!preview) throw new EmployeeDeletionError("Mitarbeiter nicht gefunden.", 404);
    if (!preview.canDelete) throw new EmployeeDeletionError(preview.blockers.map((blocker) => blocker.message).join(" "), 409);
    if (input.confirmation.trim() !== preview.employee.personnelNumber) {
      throw new EmployeeDeletionError("Zur Bestätigung bitte die Personalnummer exakt eingeben.");
    }
    if (input.fingerprint !== preview.fingerprint) {
      throw new EmployeeDeletionError(
        "Die verknüpften Daten haben sich inzwischen geändert. Bitte die Übersicht erneut prüfen.", 409,
      );
    }
    if (preview.requiresHistoryConfirmation && !input.confirmHistory) {
      throw new EmployeeDeletionError("Bitte bestätige ausdrücklich, dass die historischen Daten mitgelöscht werden.");
    }

    // Schichttausch-Anfragen sind mit RESTRICT verknüpft und werden daher explizit entfernt.
    await tx.shiftSwapRequest.deleteMany({
      where: { OR: [{ requesterId: employeeId }, { partnerId: employeeId }], status: { not: "GENEHMIGT" } },
    });
    await tx.user.deleteMany({ where: { employeeId } });
    await tx.employee.delete({ where: { id: employeeId } });

    await recordAuditLog({
      actorUserId: actor.userId,
      action: "employee.delete",
      entityType: "Employee",
      entityId: employeeId,
      oldValues: {
        name: preview.employee.name,
        personnelNumber: preview.employee.personnelNumber,
        login: preview.employee.login,
        role: preview.employee.role,
        deleted: Object.fromEntries([...preview.historical, ...preview.removed].map((item) => [item.key, item.count])),
        historyConfirmed: preview.requiresHistoryConfirmation,
      },
    }, tx);
    return preview.employee;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
}

/** IDs von Mitarbeitern, die bereits endgültig gelöscht wurden (für Seed und Massen-Speichern). */
export async function deletedEmployeeIds(db: Db, ids: readonly string[]) {
  if (!ids.length) return new Set<string>();
  const rows = await db.auditLog.findMany({
    where: { action: "employee.delete", entityType: "Employee", entityId: { in: [...ids] } },
    select: { entityId: true },
  });
  return new Set(rows.map((row) => row.entityId).filter((id): id is string => !!id));
}
