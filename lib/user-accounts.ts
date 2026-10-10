import { hash, compare } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { recordAuditLog } from "./audit";
import { hasPermission, type AuthorizationContext } from "./authorization";
import { employeeRelations, shiftGroupLabelToCode, toEmployeeDto } from "./employee-mapper";
import { passwordPolicyErrors, validateNewPassword } from "./password-policy";
import { permissionOptions, type Employee, type EmployeeRole } from "@/app/mitarbeiter/data";
import { AdditionalShiftError } from "./additional-shift-rules";

const bcryptRounds = 12;
type Db = Prisma.TransactionClient;

export class AccountError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export const roleCodes: Record<EmployeeRole, string> = {
  Mitarbeiter: "EMPLOYEE",
  Vorarbeiter: "FOREMAN",
  Admin: "ADMIN",
};

export function hashPassword(password: string) {
  return hash(password, bcryptRounds);
}

/** Benutzerkonten anlegen, Rollen ändern und Passwörter zurücksetzen dürfen nur Admins. */
export function canManageAccounts(context: AuthorizationContext) {
  return context.role === "ADMIN" && hasPermission(context, "editEmployees");
}

export function normalizeEmail(email: string | null | undefined) {
  const trimmed = email?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function assertPassword(password: string) {
  const errors = passwordPolicyErrors(password);
  if (errors.length) throw new AccountError(errors.join(" "));
}

export async function assertUniqueIdentity(
  db: Db,
  input: { personnelNumber: string; email: string | null; employeeId?: string; userId?: string },
) {
  const notEmployee = input.employeeId ? { id: { not: input.employeeId } } : {};
  const notUser = input.userId ? { id: { not: input.userId } } : {};
  const [employeeNumber, userLogin] = await Promise.all([
    db.employee.findFirst({
      where: { ...notEmployee, personnelNumber: { equals: input.personnelNumber, mode: "insensitive" } },
      select: { id: true },
    }),
    db.user.findFirst({
      where: { ...notUser, login: { equals: input.personnelNumber, mode: "insensitive" } },
      select: { id: true },
    }),
  ]);
  if (employeeNumber || userLogin) {
    throw new AccountError("Diese Personalnummer ist bereits vergeben.", 409);
  }
  if (!input.email) return;
  const [employeeEmail, userEmail] = await Promise.all([
    db.employee.findFirst({
      where: { ...notEmployee, email: { equals: input.email, mode: "insensitive" } },
      select: { id: true },
    }),
    db.user.findFirst({
      where: { ...notUser, email: { equals: input.email, mode: "insensitive" } },
      select: { id: true },
    }),
  ]);
  if (employeeEmail || userEmail) {
    throw new AccountError("Diese E-Mail-Adresse ist bereits vergeben.", 409);
  }
}

/** Schreibt Stammdaten, Bereich und Einzelberechtigungen eines Mitarbeiters (ohne Benutzerkonto). */
export async function writeEmployeeCore(db: Db, employee: Employee) {
  const data = {
    firstName: employee.firstName.trim(),
    lastName: employee.lastName.trim(),
    personnelNumber: employee.personnelNumber.trim(),
    email: normalizeEmail(employee.email),
    isActive: employee.isActive,
    annualLeaveAllowance: employee.annualLeaveAllowance,
    carryOverLeaveDays: employee.carryOverLeaveDays,
    shiftModel: { connect: { code: employee.shiftModel } },
    shiftGroup: { connect: { code: shiftGroupLabelToCode(employee.shiftGroup) } },
  };
  const record = await db.employee.upsert({
    where: { id: employee.id || "__new__" },
    update: data,
    create: data,
  });

  if (employee.areaId) {
    await db.employeeDepartment.updateMany({
      where: { employeeId: record.id, isPrimary: true, departmentId: { not: employee.areaId } },
      data: { isPrimary: false },
    });
    await db.employeeDepartment.upsert({
      where: { employeeId_departmentId: { employeeId: record.id, departmentId: employee.areaId } },
      update: { isPrimary: true },
      create: { employeeId: record.id, departmentId: employee.areaId, isPrimary: true },
    });
  } else {
    await db.employeeDepartment.updateMany({
      where: { employeeId: record.id, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  for (const permission of permissionOptions) {
    const dbPermission = await db.permission.findUnique({ where: { key: permission.id } });
    if (!dbPermission) continue;
    const allowed = employee.permissions?.[permission.id] === true;
    await db.employeePermission.upsert({
      where: { employeeId_permissionId: { employeeId: record.id, permissionId: dbPermission.id } },
      update: { allowed },
      create: { employeeId: record.id, permissionId: dbPermission.id, allowed },
    });
  }
  return record;
}

/**
 * Hält ein vorhandenes Benutzerkonto mit den Stammdaten synchron:
 * Login folgt der Personalnummer (nur wenn er bisher identisch war), E-Mail, Aktiv-Status
 * und – nur für Admins – die Rolle.
 */
export async function syncLinkedUser(
  db: Db,
  context: AuthorizationContext,
  employee: Employee,
  previousPersonnelNumber: string | null,
) {
  const user = await db.user.findUnique({
    where: { employeeId: employee.id },
    select: { id: true, login: true, email: true, active: true, role: { select: { code: true } } },
  });
  if (!user) return null;

  const data: Prisma.UserUpdateInput = {};
  const personnelNumber = employee.personnelNumber.trim();
  if (previousPersonnelNumber && user.login === previousPersonnelNumber && personnelNumber !== user.login) {
    data.login = personnelNumber;
  }
  const email = normalizeEmail(employee.email)?.toLowerCase() ?? null;
  if (email !== user.email) data.email = email;
  if (employee.isActive !== user.active) data.active = employee.isActive;
  const roleCode = roleCodes[employee.role];
  if (canManageAccounts(context) && roleCode && roleCode !== user.role.code) {
    data.role = { connect: { code: roleCode } };
  }
  if (!Object.keys(data).length) return null;

  await db.user.update({ where: { id: user.id }, data });
  const changes = {
    login: data.login ? personnelNumber : undefined,
    email: data.email !== undefined ? email : undefined,
    active: data.active,
    role: data.role ? roleCode : undefined,
  };
  await recordAuditLog({
    actorUserId: context.userId,
    action: "user.update",
    entityType: "User",
    entityId: user.id,
    oldValues: { login: user.login, email: user.email, active: user.active, role: user.role.code },
    newValues: changes,
  }, db);
  return changes;
}

/** Verhindert, dass sich ein Admin selbst aussperrt (deaktivieren oder Rolle entziehen). */
export function assertNoSelfLockout(context: AuthorizationContext, employee: Employee) {
  if (!context.employeeId || employee.id !== context.employeeId) return;
  if (!employee.isActive) throw new AccountError("Du kannst dein eigenes Konto nicht deaktivieren.");
  if (canManageAccounts(context) && roleCodes[employee.role] !== context.role) {
    throw new AccountError("Du kannst deine eigene Rolle nicht ändern.");
  }
}

export async function createEmployeeWithAccount(
  context: AuthorizationContext,
  employee: Employee,
  startPassword: string,
) {
  if (!canManageAccounts(context)) throw new AccountError("Keine Berechtigung", 403);
  assertPassword(startPassword);
  const passwordHash = await hashPassword(startPassword);
  const personnelNumber = employee.personnelNumber.trim();
  const email = normalizeEmail(employee.email);

  return prisma.$transaction(async (tx) => {
    await assertUniqueIdentity(tx, { personnelNumber, email });
    const record = await writeEmployeeCore(tx, { ...employee, id: "" });
    const user = await tx.user.create({
      data: {
        login: personnelNumber,
        email: email?.toLowerCase() ?? null,
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: new Date(),
        active: employee.isActive,
        role: { connect: { code: roleCodes[employee.role] ?? "EMPLOYEE" } },
        employee: { connect: { id: record.id } },
      },
      select: { id: true, login: true, email: true, active: true, mustChangePassword: true },
    });
    const created = await tx.employee.findUniqueOrThrow({ where: { id: record.id }, include: employeeRelations });
    const dto = toEmployeeDto(created);
    await recordAuditLog({
      actorUserId: context.userId, action: "employee.create", entityType: "Employee",
      entityId: record.id, newValues: dto,
    }, tx);
    await recordAuditLog({
      actorUserId: context.userId, action: "user.create", entityType: "User", entityId: user.id,
      newValues: { ...user, employeeId: record.id, role: roleCodes[employee.role] ?? "EMPLOYEE" },
    }, tx);
    return dto;
  }, { timeout: 20_000 });
}

/** Admin vergibt ein temporäres Passwort; legt bei Bedarf das fehlende Benutzerkonto an. */
export async function resetEmployeePassword(
  context: AuthorizationContext,
  employeeId: string,
  temporaryPassword: string,
) {
  if (!canManageAccounts(context)) throw new AccountError("Keine Berechtigung", 403);
  if (context.employeeId === employeeId) {
    throw new AccountError("Dein eigenes Passwort änderst du im Profil.", 400);
  }
  assertPassword(temporaryPassword);
  const passwordHash = await hashPassword(temporaryPassword);

  return prisma.$transaction(async (tx) => {
    const employee = await tx.employee.findUnique({
      where: { id: employeeId },
      include: { user: { include: { role: true } } },
    });
    if (!employee) throw new AccountError("Mitarbeiter nicht gefunden.", 404);
    const now = new Date();

    if (employee.user) {
      await tx.user.update({
        where: { id: employee.user.id },
        data: { passwordHash, mustChangePassword: true, passwordChangedAt: now },
      });
      await recordAuditLog({
        actorUserId: context.userId, action: "user.password_reset", entityType: "User",
        entityId: employee.user.id,
        newValues: { employeeId, login: employee.user.login, mustChangePassword: true },
      }, tx);
      return { created: false };
    }

    await assertUniqueIdentity(tx, {
      personnelNumber: employee.personnelNumber, email: employee.email, employeeId,
    });
    const user = await tx.user.create({
      data: {
        login: employee.personnelNumber,
        email: employee.email?.toLowerCase() ?? null,
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: now,
        active: employee.isActive,
        role: { connect: { code: "EMPLOYEE" } },
        employee: { connect: { id: employeeId } },
      },
      select: { id: true, login: true, email: true, active: true, mustChangePassword: true },
    });
    await recordAuditLog({
      actorUserId: context.userId, action: "user.create", entityType: "User", entityId: user.id,
      newValues: { ...user, employeeId, role: "EMPLOYEE" },
    }, tx);
    return { created: true };
  });
}

/**
 * Eigenes Passwort ändern. Die Benutzer-ID stammt immer aus der Sitzung, nie aus dem Formular.
 * `currentPassword === null` ist nur bei erzwungener Erständerung (mustChangePassword) erlaubt.
 */
export async function changeOwnPassword(
  userId: string,
  currentPassword: string | null,
  newPassword: string,
  confirmation: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, login: true, active: true, passwordHash: true, mustChangePassword: true,
      employee: { select: { isActive: true } },
    },
  });
  if (!user?.active || user.employee?.isActive === false) {
    throw new AccountError("Dein Benutzerkonto ist nicht aktiv.", 403);
  }
  if (currentPassword === null) {
    if (!user.mustChangePassword) {
      throw new AccountError("Bitte ändere dein Passwort im Profil mit deinem aktuellen Passwort.", 403);
    }
  } else if (!currentPassword || !await compare(currentPassword, user.passwordHash)) {
    throw new AccountError("Das aktuelle Passwort ist nicht korrekt.");
  }

  const errors = validateNewPassword(newPassword, confirmation);
  if (errors.length) throw new AccountError(errors.join("\n"));
  if (await compare(newPassword, user.passwordHash)) {
    throw new AccountError("Das neue Passwort muss sich vom bisherigen Passwort unterscheiden.");
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    const changed = await tx.user.updateMany({
      where: { id: user.id, passwordHash: user.passwordHash },
      data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
    });
    if (!changed.count) throw new AccountError("Das Passwort wurde inzwischen geändert. Bitte erneut anmelden.", 409);
    await recordAuditLog({
      actorUserId: user.id, action: "user.password_change", entityType: "User", entityId: user.id,
      newValues: { login: user.login, firstLogin: currentPassword === null, mustChangePassword: false },
    }, tx);
  });
  return { login: user.login };
}

export function accountErrorResponse(error: unknown) {
  if (error instanceof AdditionalShiftError) return { status: error.status, body: { error: error.message } };
  if (error instanceof AccountError) return { status: error.status, body: { error: error.message } };
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return { status: 409, body: { error: "Personalnummer oder E-Mail-Adresse ist bereits vergeben." } };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
    return { status: 409, body: { error: "Die Planung wurde gleichzeitig geändert. Bitte neu laden und erneut prüfen." } };
  }
  return null;
}
