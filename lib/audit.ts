import { prisma } from "@/lib/prisma";

type AuditParams = {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
};

export async function recordAuditLog(params: AuditParams) {
  await prisma.auditLog.create({
    data: {
      actorUserId: params.actorUserId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      oldValues: params.oldValues === undefined ? undefined : (params.oldValues as object),
      newValues: params.newValues === undefined ? undefined : (params.newValues as object),
    },
  });
}
