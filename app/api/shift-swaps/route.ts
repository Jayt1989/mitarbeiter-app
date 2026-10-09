import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthorizationContext } from "@/lib/authorization";
import { createSwap, decideSwap, listSwaps, swapTransaction } from "@/lib/shift-swaps";
import { shiftSwapResponseError, swapPrivateHeaders } from "@/lib/shift-swap-http";
import { isValidDateKey } from "@/app/admin/assignments-data";

const createSchema = z.object({
  partnerId: z.string().min(1).max(100),
  date: z.string().refine(isValidDateKey, "Ungültiges Datum"),
  comment: z.string().trim().max(500).optional(),
}).strict();
const actionSchema = z.object({
  id: z.string().min(1).max(100),
  action: z.enum(["confirm", "decline", "approve", "reject", "cancel"]),
}).strict();

export async function GET(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  try {
    return NextResponse.json(
      await listSwaps(context, new URL(request.url).searchParams.get("review") === "true"),
      { headers: swapPrivateHeaders },
    );
  } catch (error) {
    return shiftSwapResponseError(error);
  }
}

export async function POST(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const body = createSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Bitte Datum, Tauschpartner und maximal 500 Zeichen Bemerkung angeben." }, { status: 400 });
  }
  try {
    const swap = await swapTransaction((db) => createSwap(db, context, body.data));
    return NextResponse.json(swap, { status: 201, headers: swapPrivateHeaders });
  } catch (error) {
    return shiftSwapResponseError(error);
  }
}

export async function PATCH(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const body = actionSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Ungültige Schichttauschaktion" }, { status: 400 });
  }
  try {
    const swap = await swapTransaction((db) => decideSwap(db, context, body.data.id, body.data.action));
    return NextResponse.json(swap, { headers: swapPrivateHeaders });
  } catch (error) {
    return shiftSwapResponseError(error);
  }
}
