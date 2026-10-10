import { NextResponse } from "next/server";
import { getAuthorizationContext } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const employee = context.employeeId
    ? await prisma.employee.findUnique({
        where: { id: context.employeeId },
        select: { firstName: true, lastName: true, personnelNumber: true },
      })
    : null;

  return NextResponse.json({
    id: context.userId,
    login: context.login,
    role: context.role,
    employeeId: context.employeeId,
    permissions: context.permissions,
    employee,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
