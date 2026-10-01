import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaClient, ShiftCode, VacationStatus, AbsenceType, AbsenceStatus } from "@prisma/client";
import { sampleEmployees, permissionOptions, type Employee } from "../app/mitarbeiter/data";
import { shiftModelOptions } from "../app/schichtplan/rotation";
import { getShiftForDate } from "../app/schichtplan/rotation";
import { toEmployeeShiftPlan } from "../app/mitarbeiter/schedule";
import { sampleAreaConfiguration } from "../app/admin/areas-data";
import { sampleAbsences } from "../app/admin/staffing-data";
import { sampleVacationRequests } from "../app/urlaub/vacation-data";

const prisma = new PrismaClient();

const shiftValues: Record<string, ShiftCode> = {
  Früh: ShiftCode.EARLY,
  Spät: ShiftCode.LATE,
  Nacht: ShiftCode.NIGHT,
  Frei: ShiftCode.OFF,
};

const roleDefinitions = [
  { code: "EMPLOYEE", name: "Mitarbeiter" },
  { code: "FOREMAN", name: "Vorarbeiter" },
  { code: "ADMIN", name: "Admin" },
] as const;

const defaultRolePermissions: Record<string, Set<string>> = {
  EMPLOYEE: new Set([
    "ownShiftPlan",
    "requestVacation",
    "ownVacation",
    "ownQualifications",
  ]),
  FOREMAN: new Set([
    "ownShiftPlan",
    "teamShiftPlan",
    "requestVacation",
    "ownVacation",
    "otherVacations",
    "viewEmployees",
    "editShiftPlans",
    "recordAbsence",
    "viewQualifications",
    "ownQualifications",
  ]),
  ADMIN: new Set(permissionOptions.map((permission) => permission.id)),
};

function roleCode(role: Employee["role"]) {
  if (role === "Admin") return "ADMIN";
  if (role === "Vorarbeiter") return "FOREMAN";
  return "EMPLOYEE";
}

function dateAtUtc(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const staffPassword = process.env.SEED_USER_PASSWORD;
  if (!adminPassword || !staffPassword) {
    throw new Error("SEED_ADMIN_PASSWORD und SEED_USER_PASSWORD müssen vor dem Seed gesetzt sein.");
  }

  const roles = new Map<string, { id: string }>();
  for (const role of roleDefinitions) {
    const record = await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name },
      create: role,
    });
    roles.set(role.code, record);
  }

  const permissions = new Map<string, { id: string }>();
  for (const permission of permissionOptions) {
    const record = await prisma.permission.upsert({
      where: { key: permission.id },
      update: { label: permission.label },
      create: { key: permission.id, label: permission.label },
    });
    permissions.set(permission.id, record);
  }

  for (const role of roleDefinitions) {
    const roleRecord = roles.get(role.code)!;
    for (const permission of permissionOptions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: roleRecord.id,
            permissionId: permissions.get(permission.id)!.id,
          },
        },
        update: {},
        create: {
          roleId: roleRecord.id,
          permissionId: permissions.get(permission.id)!.id,
          allowed: defaultRolePermissions[role.code].has(permission.id),
        },
      });
    }
  }

  for (const model of shiftModelOptions) {
    const rotationOrder = model.id === "3-schicht"
      ? [ShiftCode.EARLY, ShiftCode.NIGHT, ShiftCode.LATE]
      : model.id === "2-schicht"
        ? [ShiftCode.EARLY, ShiftCode.LATE]
        : model.id === "nur-frueh"
          ? [ShiftCode.EARLY]
          : model.id === "nur-spaet"
            ? [ShiftCode.LATE]
            : [];
    const workingWeekdays = model.id === "3-schicht" ? [0, 1, 2, 3, 4, 5] : model.id === "individuell" ? [] : [1, 2, 3, 4, 5];
    await prisma.shiftModel.upsert({
      where: { code: model.id },
      update: { name: model.label, rotationOrder, workingWeekdays, active: true },
      create: { code: model.id, name: model.label, rotationOrder, workingWeekdays },
    });
  }

  const groupDefinitions = [
    { code: "A", name: "Gruppe A", startShift: ShiftCode.EARLY },
    { code: "B", name: "Gruppe B", startShift: ShiftCode.NIGHT },
    { code: "C", name: "Gruppe C", startShift: ShiftCode.LATE },
    { code: "NONE", name: "Keine Gruppe", startShift: ShiftCode.OFF },
  ];
  const groups = new Map<string, { id: string }>();
  for (const group of groupDefinitions) {
    const record = await prisma.shiftGroup.upsert({
      where: { code: group.code },
      update: { name: group.name, startShift: group.startShift, anchorDate: dateAtUtc("2025-12-29"), active: true },
      create: { ...group, anchorDate: dateAtUtc("2025-12-29") },
    });
    groups.set(group.code, record);
  }

  await prisma.calendarSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", country: "DE", state: "NW" },
  });

  const departments = new Map<string, { id: string }>();
  for (const area of sampleAreaConfiguration.areas) {
    const record = await prisma.department.upsert({
      where: { code: area.id },
      update: { name: area.name, active: area.active },
      create: { code: area.id, name: area.name, active: area.active },
    });
    departments.set(area.id, record);
  }

  const employees = new Map<string, { id: string; roleCode: string; permissions: Employee["permissions"] }>();
  const seededUsers = new Map<string, { id: string }>();
  for (const employee of sampleEmployees) {
    const role = roleCode(employee.role);
    const record = await prisma.employee.upsert({
      where: { id: employee.id },
      update: {
        firstName: employee.firstName,
        lastName: employee.lastName,
        personnelNumber: employee.personnelNumber,
        email: employee.email,
        isActive: employee.isActive,
        annualLeaveAllowance: employee.annualLeaveAllowance,
        carryOverLeaveDays: employee.carryOverLeaveDays,
        shiftModel: { connect: { code: employee.shiftModel } },
        shiftGroup: { connect: { code: employee.shiftGroup === "Keine Gruppe" ? "NONE" : employee.shiftGroup.slice(-1) } },
      },
      create: {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        personnelNumber: employee.personnelNumber,
        email: employee.email,
        isActive: employee.isActive,
        annualLeaveAllowance: employee.annualLeaveAllowance,
        carryOverLeaveDays: employee.carryOverLeaveDays,
        shiftModel: { connect: { code: employee.shiftModel } },
        shiftGroup: { connect: { code: employee.shiftGroup === "Keine Gruppe" ? "NONE" : employee.shiftGroup.slice(-1) } },
      },
    });
    employees.set(employee.id, { id: record.id, roleCode: role, permissions: employee.permissions });

    if (employee.areaId) {
      const department = departments.get(employee.areaId)!;
      await prisma.employeeDepartment.updateMany({
        where: { employeeId: employee.id, isPrimary: true, departmentId: { not: department.id } },
        data: { isPrimary: false },
      });
      await prisma.employeeDepartment.upsert({
        where: { employeeId_departmentId: { employeeId: employee.id, departmentId: department.id } },
        update: { isPrimary: true },
        create: { employeeId: employee.id, departmentId: department.id, isPrimary: true },
      });
    }

    for (const permission of permissionOptions) {
      await prisma.employeePermission.upsert({
        where: {
          employeeId_permissionId: {
            employeeId: employee.id,
            permissionId: permissions.get(permission.id)!.id,
          },
        },
        update: {},
        create: {
          employeeId: employee.id,
          permissionId: permissions.get(permission.id)!.id,
          allowed: employee.permissions[permission.id],
        },
      });
    }

    const passwordHash = await hash(role === "ADMIN" ? adminPassword : staffPassword, 12);
    const user = await prisma.user.upsert({
      where: { login: employee.personnelNumber },
      update: {
        email: employee.email.toLowerCase(),
        passwordHash,
        active: employee.isActive,
        role: { connect: { code: role } },
        employee: { connect: { id: employee.id } },
      },
      create: {
        login: employee.personnelNumber,
        email: employee.email.toLowerCase(),
        passwordHash,
        active: employee.isActive,
        role: { connect: { code: role } },
        employee: { connect: { id: employee.id } },
      },
    });
    seededUsers.set(employee.id, user);

  }

  const qualificationDefinitions = [
    { code: "PACKAGING", name: "Verpackung" },
    { code: "PICKING", name: "Kommissionierung" },
    { code: "AUTOSORT", name: "Autosort" },
    { code: "LOADING", name: "Verladung" },
    { code: "HIGH_RACK", name: "Hochregal" },
    { code: "SHIPPING_OFFICE", name: "Versandbüro" },
    { code: "FORKLIFT_LICENSE", name: "Staplerschein" },
  ];
  const sampleQualificationIdToCode: Record<string, string> = {
    packaging: "PACKAGING",
    picking: "PICKING",
    autosort: "AUTOSORT",
    loading: "LOADING",
    "high-rack": "HIGH_RACK",
    "shipping-office": "SHIPPING_OFFICE",
    "forklift-license": "FORKLIFT_LICENSE",
  };
  const qualificationIds = new Map<string, { id: string }>();
  for (const qualification of qualificationDefinitions) {
    const record = await prisma.qualification.upsert({
      where: { code: qualification.code },
      update: { name: qualification.name, active: true },
      create: qualification,
    });
    qualificationIds.set(qualification.code, record);
  }

  for (const employee of sampleEmployees) {
    for (const [sampleQualificationId, level] of Object.entries(employee.qualifications ?? {})) {
      const code = sampleQualificationIdToCode[sampleQualificationId];
      if (!code) continue;
      await prisma.employeeQualification.upsert({
        where: {
          employeeId_qualificationId: {
            employeeId: employee.id,
            qualificationId: qualificationIds.get(code)!.id,
          },
        },
        update: { level },
        create: { employeeId: employee.id, qualificationId: qualificationIds.get(code)!.id, level },
      });
    }
  }

  for (const [departmentCode, values] of Object.entries(sampleAreaConfiguration.minimums)) {
    const department = departments.get(departmentCode)!;
    for (const [shift, shiftMinimum] of Object.entries(values) as [
      keyof typeof values,
      { minimum: number; qualificationId: string | null; minimumQualified: number },
    ][]) {
      const requiredQualificationCode = shiftMinimum.qualificationId
        ? sampleQualificationIdToCode[shiftMinimum.qualificationId]
        : undefined;
      await prisma.minimumStaffing.upsert({
        where: { departmentId_shift: { departmentId: department.id, shift: shiftValues[shift] } },
        update: {},
        create: {
          departmentId: department.id,
          shift: shiftValues[shift],
          minimum: shiftMinimum.minimum,
          qualificationId: requiredQualificationCode ? qualificationIds.get(requiredQualificationCode)!.id : null,
          minimumQualified: shiftMinimum.minimumQualified,
        },
      });
    }
  }

  const currentYear = 2026;
  for (const employee of sampleEmployees) {
    await prisma.vacationAccount.upsert({
      where: { employeeId_year: { employeeId: employee.id, year: currentYear } },
      update: { annualAllowance: employee.annualLeaveAllowance, carryOverDays: employee.carryOverLeaveDays },
      create: {
        employeeId: employee.id,
        year: currentYear,
        annualAllowance: employee.annualLeaveAllowance,
        carryOverDays: employee.carryOverLeaveDays,
      },
    });
  }

  const adminUser = seededUsers.get("employee-1001")!;
  for (const request of sampleVacationRequests) {
    await prisma.vacationRequest.upsert({
      where: { id: request.id },
      update: {},
      create: {
      id: request.id,
      employeeId: request.employeeId,
      startDate: dateAtUtc(request.startDate),
      endDate: dateAtUtc(request.endDate),
      daysRequested: request.daysRequested,
      status: {
        Beantragt: VacationStatus.REQUESTED,
        Genehmigt: VacationStatus.APPROVED,
        Abgelehnt: VacationStatus.REJECTED,
        Storniert: VacationStatus.CANCELLED,
      }[request.status],
      comment: request.comment,
      requestedAt: new Date(request.requestedAt),
      decidedAt: request.decidedAt ? new Date(request.decidedAt) : null,
      approvedById: request.status === "Genehmigt" || request.status === "Abgelehnt" ? adminUser.id : null,
      },
    });
  }

  for (const absence of sampleAbsences) {
    const seedKey = `sample-${absence.employeeId}-${absence.startDate}-${absence.type}`;
    await prisma.absence.upsert({
      where: { seedKey },
      update: {},
      create: {
      seedKey,
      employeeId: absence.employeeId,
      type: {
        Krank: AbsenceType.SICK,
        Schulung: AbsenceType.TRAINING,
        Sonderurlaub: AbsenceType.SPECIAL_LEAVE,
        "Sonstige Abwesenheit": AbsenceType.OTHER,
        Urlaub: AbsenceType.OTHER,
      }[absence.type],
      status: absence.approval === "Genehmigt" ? AbsenceStatus.APPROVED : AbsenceStatus.RECORDED,
      startDate: dateAtUtc(absence.startDate),
      endDate: dateAtUtc(absence.endDate),
      recordedById: adminUser.id,
      },
    });
  }

  const assignments = [];
  for (const employee of sampleEmployees.filter((entry) => entry.isActive)) {
    const plan = toEmployeeShiftPlan(employee);
    for (let dayOffset = 0; dayOffset < 365; dayOffset += 1) {
      const date = dateAtUtc("2026-01-01");
      date.setUTCDate(date.getUTCDate() + dayOffset);
      const shift = getShiftForDate(date, plan);
      if (shift && shift !== "Frei") {
        assignments.push({
          employeeId: employee.id,
          date,
          shift: shiftValues[shift],
          source: plan.model === "individuell" ? "MANUAL" as const : "ROTATION" as const,
        });
      }
    }
  }
  await prisma.shiftAssignment.createMany({ data: assignments, skipDuplicates: true });

  console.log(`Seeded ${employees.size} employees, ${qualificationDefinitions.length} qualifications and ${sampleVacationRequests.length} vacation requests.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
