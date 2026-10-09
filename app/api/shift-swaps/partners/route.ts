import { NextResponse } from "next/server";
import { getAuthorizationContext } from "@/lib/authorization";
import { canRequestShiftSwaps } from "@/lib/shift-swap-rules";
import { loadSwapDays } from "@/lib/shift-swaps";
import { shiftSwapResponseError, swapPrivateHeaders } from "@/lib/shift-swap-http";
import { berlinTodayKey, dateKeyToUtc } from "@/lib/calendar";
import { isValidDateKey } from "@/app/admin/assignments-data";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  if (!canRequestShiftSwaps(context)) {
    return NextResponse.json({ error: "Keine Berechtigung für eigene Tauschanfragen" }, { status: 403 });
  }
  const date = new URL(request.url).searchParams.get("date");
  if (!isValidDateKey(date) || date < berlinTodayKey()) {
    return NextResponse.json({ error: "Bitte heute oder ein zukünftiges gültiges Datum auswählen." }, { status: 400 });
  }
  try {
    const days = await loadSwapDays(prisma, dateKeyToUtc(date));
    return NextResponse.json({
      own: days.find((day) => day.id === context.employeeId) ?? null,
      partners: days.filter((day) => day.id !== context.employeeId).map((day) => ({
        ...day,
        // Fremde Abwesenheitsarten und Urlaubsdetails bleiben privat.
        warnings: day.warnings.length ? ["An diesem Tag ist ein Tausch für diesen Mitarbeiter nicht möglich (Planungskonflikt)."] : [],
      })),
    }, { headers: swapPrivateHeaders });
  } catch (error) {
    return shiftSwapResponseError(error);
  }
}
