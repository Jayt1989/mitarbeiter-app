import { NextResponse } from "next/server";
import { getAuthorizationContext } from "@/lib/authorization";
import { canRequestShiftSwaps, canReviewShiftSwaps, ShiftSwapError } from "@/lib/shift-swap-rules";
import { checkSwap, toSwapDto, swapRelations } from "@/lib/shift-swaps";
import { loadExportSource } from "@/lib/export/source";
import { swapStaffingPreview, swapStaffingWarnings } from "@/lib/shift-swap-staffing";
import { isValidDateKey } from "@/app/admin/assignments-data";
import { dateKeyToUtc } from "@/lib/calendar";
import { fromShiftCode } from "@/lib/employee-mapper";
import { shiftSwapResponseError, swapPrivateHeaders } from "@/lib/shift-swap-http";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  try {
    if (!id) {
      if (!canRequestShiftSwaps(context) || !context.employeeId) {
        throw new ShiftSwapError("Keine Berechtigung für eigene Tauschanfragen.", 403);
      }
      const date = params.get("date");
      const partnerId = params.get("partnerId");
      if (!isValidDateKey(date) || !partnerId || partnerId.length > 100) {
        throw new ShiftSwapError("Bitte ein gültiges Datum und einen Tauschpartner angeben.", 400);
      }
      const checked = await checkSwap(prisma, context.employeeId, partnerId, dateKeyToUtc(date));
      const source = await loadExportSource({ from: date, to: date });
      const preview = swapStaffingPreview(source, {
        date, requesterId: context.employeeId, partnerId,
        requesterOriginalShift: fromShiftCode(checked.requesterShift),
        partnerOriginalShift: fromShiftCode(checked.partnerShift),
      });
      return NextResponse.json({ warnings: swapStaffingWarnings(preview) }, { headers: swapPrivateHeaders });
    }
    if (!canReviewShiftSwaps(context)) throw new ShiftSwapError("Keine Berechtigung.", 403);
    if (id.length > 100) throw new ShiftSwapError("Keine gültige Anfrage angegeben.", 400);
    const record = await prisma.shiftSwapRequest.findUnique({ where: { id }, include: swapRelations });
    if (!record) throw new ShiftSwapError("Tauschanfrage nicht gefunden.", 404);
    await checkSwap(prisma, record.requesterId, record.partnerId, record.date, record);
    const swap = toSwapDto(record);
    const source = await loadExportSource({ from: swap.date, to: swap.date });
    return NextResponse.json(swapStaffingPreview(source, swap), { headers: swapPrivateHeaders });
  } catch (error) {
    return shiftSwapResponseError(error);
  }
}
