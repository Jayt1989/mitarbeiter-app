import type { Prisma } from "@prisma/client";
import type { Qualification } from "@/app/admin/qualifications-data";

export type QualificationRecord = Prisma.QualificationGetPayload<Record<string, never>>;

export function toQualificationDto(record: QualificationRecord): Qualification {
  return {
    id: record.id,
    name: record.name,
    active: record.active,
  };
}
