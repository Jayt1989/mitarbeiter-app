import { ShiftCode, type Prisma } from "@prisma/client";
import type { ActiveShift } from "@/app/schichtplan/rotation";
import type { AreaConfiguration } from "@/app/admin/areas-data";

const shiftCodeToLabel: Record<ShiftCode, ActiveShift | "Frei"> = {
  [ShiftCode.EARLY]: "Früh",
  [ShiftCode.LATE]: "Spät",
  [ShiftCode.NIGHT]: "Nacht",
  [ShiftCode.OFF]: "Frei",
};

const labelToShiftCode: Record<ActiveShift, ShiftCode> = {
  Früh: ShiftCode.EARLY,
  Spät: ShiftCode.LATE,
  Nacht: ShiftCode.NIGHT,
};

export type DepartmentRecord = Prisma.DepartmentGetPayload<{
  include: { minimumStaffing: true };
}>;

export function toAreaConfiguration(departments: DepartmentRecord[]): AreaConfiguration {
  return {
    areas: departments.map((department) => ({
      id: department.id,
      name: department.name,
      active: department.active,
    })),
    minimums: Object.fromEntries(
      departments.map((department) => {
        const findShift = (shift: ShiftCode) =>
          department.minimumStaffing.find((entry) => entry.shift === shift);
        const toShiftMinimum = (shift: ShiftCode) => {
          const entry = findShift(shift);
          return {
            minimum: entry?.minimum ?? 0,
            qualificationId: entry?.qualificationId ?? null,
            minimumQualified: entry?.minimumQualified ?? 0,
          };
        };

        return [
          department.id,
          {
            Früh: toShiftMinimum(ShiftCode.EARLY),
            Spät: toShiftMinimum(ShiftCode.LATE),
            Nacht: toShiftMinimum(ShiftCode.NIGHT),
          },
        ];
      }),
    ),
  };
}

export { labelToShiftCode, shiftCodeToLabel };
