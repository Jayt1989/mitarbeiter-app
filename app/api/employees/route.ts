import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { recordAuditLog } from "@/lib/audit";
import {
  employeeRelations,
  shiftGroupLabelToCode,
  toEmployeeDto,
  toShiftCode,
} from "@/lib/employee-mapper";
import { permissionOptions, type Employee } from "@/app/mitarbeiter/data";

export async function GET() {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  if (!hasPermission(context, "viewEmployees") && !hasPermission(context, "editEmployees")) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const records = await prisma.employee.findMany({
    include: employeeRelations,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return NextResponse.json(records.map(toEmployeeDto));
}

export async function PUT(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  if (!hasPermission(context, "editEmployees")) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const payload = (await request.json()) as Employee[];

  for (const employee of payload) {
    const existing = employee.id
      ? await prisma.employee.findUnique({ where: { id: employee.id }, include: employeeRelations })
      : null;
    const before = existing ? toEmployeeDto(existing) : null;

    const record = await prisma.employee.upsert({
      where: { id: employee.id || "__new__" },
      update: {
        firstName: employee.firstName,
        lastName: employee.lastName,
        personnelNumber: employee.personnelNumber,
        email: employee.email,
        isActive: employee.isActive,
        annualLeaveAllowance: employee.annualLeaveAllowance,
        carryOverLeaveDays: employee.carryOverLeaveDays,
        shiftModel: { connect: { code: employee.shiftModel } },
        shiftGroup: { connect: { code: shiftGroupLabelToCode(employee.shiftGroup) } },
      },
      create: {
        firstName: employee.firstName,
        lastName: employee.lastName,
        personnelNumber: employee.personnelNumber,
        email: employee.email,
        isActive: employee.isActive,
        annualLeaveAllowance: employee.annualLeaveAllowance,
        carryOverLeaveDays: employee.carryOverLeaveDays,
        shiftModel: { connect: { code: employee.shiftModel } },
        shiftGroup: { connect: { code: shiftGroupLabelToCode(employee.shiftGroup) } },
      },
    });

    if (employee.areaId) {
      await prisma.employeeDepartment.updateMany({
        where: { employeeId: record.id, isPrimary: true, departmentId: { not: employee.areaId } },
        data: { isPrimary: false },
      });
      await prisma.employeeDepartment.upsert({
        where: { employeeId_departmentId: { employeeId: record.id, departmentId: employee.areaId } },
        update: { isPrimary: true },
        create: { employeeId: record.id, departmentId: employee.areaId, isPrimary: true },
      });
    } else {
      await prisma.employeeDepartment.updateMany({
        where: { employeeId: record.id, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    for (const permission of permissionOptions) {
      const dbPermission = await prisma.permission.findUnique({ where: { key: permission.id } });
      if (!dbPermission) continue;
      await prisma.employeePermission.upsert({
        where: { employeeId_permissionId: { employeeId: record.id, permissionId: dbPermission.id } },
        update: { allowed: employee.permissions[permission.id] },
        create: {
          employeeId: record.id,
          permissionId: dbPermission.id,
          allowed: employee.permissions[permission.id],
        },
      });
    }

    if (employee.individualAssignments) {
      for (const [date, shift] of Object.entries(employee.individualAssignments)) {
        if (shift === "Frei") continue;
        await prisma.shiftAssignment.upsert({
          where: { employeeId_date: { employeeId: record.id, date: new Date(`${date}T00:00:00.000Z`) } },
          update: { shift: toShiftCode(shift) },
          create: {
            employeeId: record.id,
            date: new Date(`${date}T00:00:00.000Z`),
            shift: toShiftCode(shift),
            source: "MANUAL",
          },
        });
      }
    }

    await recordAuditLog({
      actorUserId: context.userId,
      action: before ? "employee.update" : "employee.create",
      entityType: "Employee",
      entityId: record.id,
      oldValues: before,
      newValues: { ...employee, id: record.id },
    });
  }

  const records = await prisma.employee.findMany({
    include: employeeRelations,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return NextResponse.json(records.map(toEmployeeDto));
}
