import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ShiftSwapError } from "./shift-swap-rules";
import { hasPermission, type AuthorizationContext } from "./authorization";

export const swapPrivateHeaders = { "Cache-Control": "private, no-store" };

export function shiftSwapResponseError(error: unknown, context?: AuthorizationContext) {
  if (error instanceof ShiftSwapError) {
    const showDetails = context && hasPermission(context, "otherVacations") && hasPermission(context, "recordAbsence");
    const warnings = showDetails || !error.warnings.length ? error.warnings
      : ["Der Tausch ist an diesem Tag wegen eines Planungskonflikts nicht möglich."];
    return NextResponse.json({ error: error.message, warnings }, {
      status: error.status, headers: swapPrivateHeaders,
    });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2034" || error.code === "P2002")) {
    return NextResponse.json({
      error: "Die Planung wurde gleichzeitig geändert. Bitte neu laden und erneut prüfen.",
    }, { status: 409, headers: swapPrivateHeaders });
  }
  console.error("Schichttausch konnte nicht verarbeitet werden:", error);
  return NextResponse.json({ error: "Schichttausch konnte nicht verarbeitet werden. Bitte erneut versuchen." }, {
    status: 500, headers: swapPrivateHeaders,
  });
}
