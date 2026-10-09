import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizationContext } from "@/lib/authorization";
import { accountErrorResponse, canManageAccounts, resetEmployeePassword } from "@/lib/user-accounts";

const noStore = { "Cache-Control": "no-store" };

/** Admin setzt ein temporäres Passwort (oder legt ein fehlendes Benutzerkonto an). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const context = await getAuthorizationContext();
  if (!context) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401, headers: noStore });
  if (!canManageAccounts(context)) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403, headers: noStore });
  }
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  if (!id || id.length > 100 || typeof body?.password !== "string") {
    return NextResponse.json({ error: "Bitte ein temporäres Passwort angeben." }, { status: 400, headers: noStore });
  }
  try {
    const result = await resetEmployeePassword(context, id, body.password);
    return NextResponse.json(result, { headers: noStore });
  } catch (error) {
    const response = accountErrorResponse(error);
    if (response) return NextResponse.json(response.body, { status: response.status, headers: noStore });
    throw error;
  }
}
