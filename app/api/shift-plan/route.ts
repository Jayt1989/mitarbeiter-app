import { NextResponse } from "next/server";
import { getAuthorizationContext } from "@/lib/authorization";
import { loadShiftPlan } from "@/lib/shift-plan";
import { shiftSwapResponseError, swapPrivateHeaders } from "@/lib/shift-swap-http";

export async function GET(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  try {
    const staffing = new URL(request.url).searchParams.get("scope") === "staffing";
    return NextResponse.json(await loadShiftPlan(context, staffing), { headers: swapPrivateHeaders });
  } catch (error) {
    return shiftSwapResponseError(error);
  }
}
