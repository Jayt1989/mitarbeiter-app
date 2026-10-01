import type { Prisma } from "@prisma/client";
import type { TemporaryAssignment } from "@/app/admin/assignments-data";
import { shiftCodeToLabel } from "@/lib/area-mapper";

export const temporaryAssignmentRelations = {
  employee: {
    include: {
      departments: { where: { isPrimary: true }, include: { department: true } },
    },
  },
  department: true,
  createdBy: { select: { login: true } },
} satisfies Prisma.TemporaryAssignmentInclude;

export type TemporaryAssignmentRecord = Prisma.TemporaryAssignmentGetPayload<{
  include: typeof temporaryAssignmentRelations;
}>;

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function toTemporaryAssignmentDto(record: TemporaryAssignmentRecord): TemporaryAssignment {
  const primary = record.employee.departments[0]?.department ?? null;
  const shift = record.shift ? shiftCodeToLabel[record.shift] : null;

  return {
    id: record.id,
    employeeId: record.employeeId,
    employeeName: `${record.employee.firstName} ${record.employee.lastName}`,
    primaryAreaId: primary?.id ?? null,
    primaryAreaName: primary?.name ?? null,
    areaId: record.departmentId,
    areaName: record.department.name,
    startDate: dateKey(record.startDate),
    endDate: dateKey(record.endDate),
    shift: shift === "Frei" ? null : shift,
    note: record.note ?? "",
    createdByLogin: record.createdBy?.login ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
  };
}
