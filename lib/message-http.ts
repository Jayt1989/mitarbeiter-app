import { NextResponse } from "next/server";
import type { z } from "zod";
import { getAuthorizationContext, type AuthorizationContext } from "./authorization";
import { MessageError } from "./message-rules";

export const messagePrivateHeaders = { "Cache-Control": "private, no-store" };
export async function parseMessageBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const origin = request.headers.get("origin");
  if (origin) {
    const requestUrl = new URL(request.url);
    const host = request.headers.get("host") ?? requestUrl.host;
    const protocol = request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.slice(0, -1);
    let originUrl: URL;
    try { originUrl = new URL(origin); } catch (error) {
      if (error instanceof TypeError) throw new MessageError("Ungültige Anfrageherkunft.");
      throw error;
    }
    if (originUrl.host !== host || originUrl.protocol !== `${protocol}:`) {
      throw new MessageError("Diese Anfrage stammt nicht aus TeamPlan.");
    }
  }
  let body: unknown;
  try { body = await request.json(); } catch (error) {
    if (error instanceof SyntaxError) throw new MessageError("Ungültige JSON-Anfrage.", 400);
    throw error;
  }
  const result = schema.safeParse(body);
  if (!result.success) throw new MessageError("Ungültige Nachrichteneingabe. Bitte Auswahl und Pflichtfelder prüfen.", 400);
  return result.data;
}
export async function messageResponse(work: (context: AuthorizationContext) => Promise<unknown>, status = 200) {
  const context = await getAuthorizationContext();
  if (!context) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401, headers: messagePrivateHeaders });
  try {
    return NextResponse.json(await work(context), { status, headers: messagePrivateHeaders });
  } catch (error) {
    if (error instanceof MessageError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: messagePrivateHeaders });
    }
    throw error;
  }
}
