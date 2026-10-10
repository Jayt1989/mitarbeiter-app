import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getAuthorizationContext } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { AdditionalShiftError, additionalShiftBatch, additionalShiftInput, requireAdditionalShift } from "@/lib/additional-shift-rules";
import { additionalShiftDto, additionalShiftRelations, changeAdditionalShift, checkAdditionalShifts, createAdditionalShifts } from "@/lib/additional-shifts";
import { canAccessPage } from "@/lib/access-policy";

const headers = { "Cache-Control": "private, no-store" };
const operation = z.discriminatedUnion("action", [
  additionalShiftBatch.extend({ action: z.literal("check") }).strict(),
  additionalShiftBatch.extend({ action: z.literal("create") }).strict(),
]);
const change = z.discriminatedUnion("action", [
  additionalShiftInput.extend({ id: z.string().min(1).max(100), updatedAt: z.iso.datetime(), action: z.literal("update") }).strict(),
  z.object({ id: z.string().min(1).max(100), updatedAt: z.iso.datetime(), action: z.enum(["release", "cancel"]) }).strict(),
]);
function failure(error: unknown) {
  if (error instanceof AdditionalShiftError) return NextResponse.json({ error: error.message, issues: error.issues }, { status: error.status, headers });
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) {
    return NextResponse.json({ error: "Die Planung wurde gleichzeitig geändert oder enthält eine Doppelbelegung. Bitte neu laden und erneut prüfen." }, { status: 409, headers });
  }
  console.error("Zusatzschicht konnte nicht verarbeitet werden.", error);
  return NextResponse.json({ error: "Zusatzschicht konnte nicht verarbeitet werden." }, { status: 500, headers });
}
export async function GET() {
  const context = await getAuthorizationContext();
  if (!context) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401, headers });
  try {
    if (!canAccessPage(context, "/admin/zusatzschichten")) {
      throw new AdditionalShiftError("Keine Berechtigung für die Zusatzschicht-Verwaltung.", 403);
    }
    const records = await prisma.additionalShift.findMany({ include: additionalShiftRelations,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
    return NextResponse.json(records.map(additionalShiftDto), { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401, headers });
  try {
    requireAdditionalShift(context, "planAdditionalShifts");
    const parsed = operation.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdditionalShiftError(parsed.error.issues.map((issue) => issue.message).join(" "));
    if (parsed.data.action === "check") {
      return NextResponse.json({ issues: await checkAdditionalShifts(prisma, parsed.data) }, { headers });
    }
    return NextResponse.json(await createAdditionalShifts(context, parsed.data), { status: 201, headers });
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401, headers });
  try {
    const parsed = change.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdditionalShiftError(parsed.error.issues.map((issue) => issue.message).join(" "));
    const { id, updatedAt, action } = parsed.data;
    return NextResponse.json(await changeAdditionalShift(context, id, updatedAt, action,
      action === "update" ? parsed.data : undefined), { headers });
  } catch (error) { return failure(error); }
}
