import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthorizationContext } from "@/lib/authorization";
import { loadOwnNotifications, markOwnNotificationsRead } from "@/lib/notifications";

const readSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), id: z.string().min(1).max(100) }).strict(),
  z.object({ action: z.literal("readAll") }).strict(),
]);
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401, headers: privateHeaders });
  }
  const limit = new URL(request.url).searchParams.get("preview") === "true" ? 5 : undefined;
  return NextResponse.json(
    await loadOwnNotifications(context.employeeId, context.userId, limit),
    { headers: privateHeaders },
  );
}

export async function PATCH(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401, headers: privateHeaders });
  }
  const body = readSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Ungültige Benachrichtigungsaktion" }, { status: 400 });
  }
  const result = await markOwnNotificationsRead(
    context.employeeId, context.userId,
    body.data.action === "read" ? body.data.id : undefined,
  );
  if (body.data.action === "read" && result.count === 0) {
    return NextResponse.json(
      { error: "Keine eigene ungelesene Benachrichtigung gefunden" }, { status: 404 },
    );
  }
  return NextResponse.json({ updated: result.count }, { headers: privateHeaders });
}
