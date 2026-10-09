import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type AuditParams = {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
};

export async function recordAuditLog(
  params: AuditParams,
  db: Pick<Prisma.TransactionClient, "auditLog"> = prisma,
) {
  await db.auditLog.create({
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
