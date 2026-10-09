import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";
import { getAuthorizationContext } from "@/lib/authorization";
import { canManageAccounts } from "@/lib/user-accounts";
import {
  analyzeEmployeeDeletion,
  deleteEmployeePermanently,
  EmployeeDeletionError,
  isProtectedPersonnelNumber,
} from "@/lib/employee-deletion";

const noStore = { "Cache-Control": "no-store" };
type Ctx = { params: Promise<{ id: string }> };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

async function adminContext() {
  const context = await getAuthorizationContext();
  if (!context) return { error: json({ error: "Nicht angemeldet" }, 401) } as const;
  if (!canManageAccounts(context)) return { error: json({ error: "Keine Berechtigung" }, 403) } as const;
  return { context } as const;
}

async function employeeId(ctx: Ctx) {
  const { id } = await ctx.params;
  return id && id.length <= 100 ? id : null;
}

/** Vorschau: welche verknüpften Daten wären vom endgültigen Löschen betroffen? */
export async function GET(_request: NextRequest, ctx: Ctx) {
  const auth = await adminContext();
  if (auth.error) return auth.error;
  const id = await employeeId(ctx);
  if (!id) return json({ error: "Ungültige Mitarbeiter-ID" }, 400);
  const preview = await analyzeEmployeeDeletion(prisma, id, auth.context);
  if (!preview) return json({ error: "Mitarbeiter nicht gefunden." }, 404);
  return json(preview);
}

/** Mitarbeiter samt Benutzerkonto deaktivieren (Daten bleiben vollständig erhalten). */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const auth = await adminContext();
  if (auth.error) return auth.error;
  const id = await employeeId(ctx);
  const body = (await request.json().catch(() => null)) as { isActive?: unknown } | null;
  if (!id || body?.isActive !== false) return json({ error: "Ungültige Anfrage" }, 400);
  if (auth.context.employeeId === id) return json({ error: "Du kannst dein eigenes Konto nicht deaktivieren." }, 400);

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { id: true, personnelNumber: true, isActive: true, user: { select: { id: true, login: true, active: true } } },
  });
  if (!employee) return json({ error: "Mitarbeiter nicht gefunden." }, 404);
  if (isProtectedPersonnelNumber(employee.personnelNumber) || isProtectedPersonnelNumber(employee.user?.login)) {
    return json({ error: "Das geschützte Admin-Konto kann hier nicht deaktiviert werden." }, 409);
  }

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id }, data: { isActive: false } });
    if (employee.user) await tx.user.update({ where: { id: employee.user.id }, data: { active: false } });
    await recordAuditLog({
      actorUserId: auth.context.userId,
      action: "employee.deactivate",
      entityType: "Employee",
      entityId: id,
      oldValues: { isActive: employee.isActive, userActive: employee.user?.active ?? null },
      newValues: { isActive: false, userActive: employee.user ? false : null },
    }, tx);
  });
  const preview = await analyzeEmployeeDeletion(prisma, id, auth.context);
  return json(preview);
}

/** Endgültiges Löschen eines deaktivierten Testmitarbeiters nach Sicherheitsabfrage. */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  const auth = await adminContext();
  if (auth.error) return auth.error;
  const id = await employeeId(ctx);
  const body = (await request.json().catch(() => null)) as {
    confirmation?: unknown; confirmHistory?: unknown; fingerprint?: unknown;
  } | null;
  if (!id || typeof body?.confirmation !== "string" || typeof body.fingerprint !== "string") {
    return json({ error: "Ungültige Anfrage" }, 400);
  }
  try {
    const deleted = await deleteEmployeePermanently(prisma, auth.context, id, {
      confirmation: body.confirmation,
      confirmHistory: body.confirmHistory === true,
      fingerprint: body.fingerprint,
    });
    return json({ deleted });
  } catch (error) {
    if (error instanceof EmployeeDeletionError) return json({ error: error.message }, error.status);
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") {
      return json({ error: "Gleichzeitige Änderung erkannt. Bitte erneut versuchen." }, 409);
    }
    throw error;
  }
}
