import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ShiftSwapError } from "./shift-swap-rules";

export const swapPrivateHeaders = { "Cache-Control": "private, no-store" };

export function shiftSwapResponseError(error: unknown) {
  if (error instanceof ShiftSwapError) {
    return NextResponse.json({ error: error.message, warnings: error.warnings }, {
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
