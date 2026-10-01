import { VacationStatus as PrismaVacationStatus, type Prisma } from "@prisma/client";
import type { VacationRequest, VacationStatus } from "@/app/urlaub/vacation-data";

const statusToLabel: Record<PrismaVacationStatus, VacationStatus> = {
  [PrismaVacationStatus.REQUESTED]: "Beantragt",
  [PrismaVacationStatus.APPROVED]: "Genehmigt",
  [PrismaVacationStatus.REJECTED]: "Abgelehnt",
  [PrismaVacationStatus.CANCELLED]: "Storniert",
};

const labelToStatus: Record<VacationStatus, PrismaVacationStatus> = {
  Beantragt: PrismaVacationStatus.REQUESTED,
  Genehmigt: PrismaVacationStatus.APPROVED,
  Abgelehnt: PrismaVacationStatus.REJECTED,
  Storniert: PrismaVacationStatus.CANCELLED,
};

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export type VacationRequestRecord = Prisma.VacationRequestGetPayload<Record<string, never>>;

export function toVacationRequestDto(record: VacationRequestRecord): VacationRequest {
  return {
    id: record.id,
    employeeId: record.employeeId,
    startDate: toDateOnly(record.startDate),
    endDate: toDateOnly(record.endDate),
    daysRequested: record.daysRequested,
    requestedAt: record.requestedAt.toISOString(),
    status: statusToLabel[record.status],
    comment: record.comment ?? "",
    decidedAt: record.decidedAt?.toISOString(),
  };
}

export { labelToStatus };
