import {
  Prisma,
  ShiftCode,
  type PrismaClient,
} from "@prisma/client";
import {
  permissionOptions,
  type Employee,
  type EmployeeRole,
  type EmployeeShiftGroup,
} from "@/app/mitarbeiter/data";
import type { Shift } from "@/app/schichtplan/rotation";

export const employeeRelations = {
  shiftModel: true,
  shiftGroup: true,
  departments: { include: { department: true } },
  permissions: { include: { permission: true } },
  shiftAssignments: true,
  qualifications: true,
  user: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
} satisfies Prisma.EmployeeInclude;

export type EmployeeRecord = Prisma.EmployeeGetPayload<{
  include: typeof employeeRelations;
}>;

export function toEmployeeDto(record: EmployeeRecord): Employee {
  const rolePermissions = record.user?.role.permissions ?? [];
  const permissions = Object.fromEntries(
    permissionOptions.map(({ id }) => {
      const employeeOverride = record.permissions.find((entry) => entry.permission.key === id);
      const roleDefault = rolePermissions.find((entry) => entry.permission.key === id);
      return [id, employeeOverride?.allowed ?? roleDefault?.allowed ?? false];
    }),
  ) as Employee["permissions"];
  const individualAssignments = Object.fromEntries(
    record.shiftAssignments
      .filter((assignment) => record.shiftModel.code === "individuell" || assignment.source === "MANUAL")
      .map((assignment) => [
        assignment.date.toISOString().slice(0, 10),
        fromShiftCode(assignment.shift),
      ]),
  );
  const role: EmployeeRole = record.user?.role.code === "ADMIN"
    ? "Admin"
    : record.user?.role.code === "FOREMAN"
      ? "Vorarbeiter"
      : "Mitarbeiter";
  const shiftGroup: EmployeeShiftGroup = record.shiftGroup.code === "NONE"
    ? "Keine Gruppe"
    : `Gruppe ${record.shiftGroup.code.slice(-1)}` as EmployeeShiftGroup;
  const primaryDepartment = record.departments.find((entry) => entry.isPrimary);
  const qualifications = Object.fromEntries(
    record.qualifications.map((entry) => [entry.qualificationId, entry.level]),
  );

  return {
    id: record.id,
    firstName: record.firstName,
    lastName: record.lastName,
    personnelNumber: record.personnelNumber,
    email: record.email ?? "",
    role,
    shiftModel: record.shiftModel.code as Employee["shiftModel"],
    shiftGroup,
    areaId: primaryDepartment?.departmentId ?? null,
    isActive: record.isActive,
    annualLeaveAllowance: record.annualLeaveAllowance,
    carryOverLeaveDays: record.carryOverLeaveDays,
    permissions,
    individualAssignments,
    qualifications,
    // Nur Statusinformationen – Passwort-Hash verlässt nie den Server.
    account: record.user
      ? {
          login: record.user.login,
          active: record.user.active,
          mustChangePassword: record.user.mustChangePassword,
        }
      : null,
  };
}

export function shiftGroupLabelToCode(label: EmployeeShiftGroup): string {
  return label === "Keine Gruppe" ? "NONE" : label.slice(-1);
}

export function fromShiftCode(shift: ShiftCode): Shift {
  switch (shift) {
    case ShiftCode.EARLY: return "Früh";
    case ShiftCode.LATE: return "Spät";
    case ShiftCode.NIGHT: return "Nacht";
    case ShiftCode.OFF: return "Frei";
  }
}

export function toShiftCode(shift: Shift): ShiftCode {
  switch (shift) {
    case "Früh": return ShiftCode.EARLY;
    case "Spät": return ShiftCode.LATE;
    case "Nacht": return ShiftCode.NIGHT;
    case "Frei": return ShiftCode.OFF;
  }
}

export type EmployeeDatabase = PrismaClient;
