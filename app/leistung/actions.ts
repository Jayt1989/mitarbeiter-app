"use server";

import { revalidatePath } from "next/cache";
import { getAuthorizationContext } from "@/lib/authorization";
import { createPerformanceEntry, deleteOwnPerformanceEntry } from "@/lib/performance";
import { PerformanceError, parsePerformanceInput } from "@/lib/performance-rules";

export type PerformanceFormState = { error: string | null; savedAt: number | null };
export type DeletePerformanceState = { error: string | null };

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof PerformanceError) return error.message;
  console.error(fallback, error instanceof Error ? error.name : "unknown");
  return fallback;
}

export async function savePerformanceAction(
  _prev: PerformanceFormState,
  formData: FormData,
): Promise<PerformanceFormState> {
  const context = await getAuthorizationContext();
  if (!context) return { error: "Bitte melde dich erneut an.", savedAt: null };
  try {
    const input = parsePerformanceInput({
      area: field(formData, "area"),
      workstation: field(formData, "workstation"),
      quantity: field(formData, "quantity"),
      hours: field(formData, "hours"),
      minutes: field(formData, "minutes"),
      note: field(formData, "note"),
    });
    await createPerformanceEntry(context, input);
  } catch (error) {
    return { error: errorMessage(error, "Die Leistung konnte nicht gespeichert werden."), savedAt: null };
  }
  revalidatePath("/leistung");
  return { error: null, savedAt: Date.now() };
}

export async function deletePerformanceAction(
  _prev: DeletePerformanceState,
  formData: FormData,
): Promise<DeletePerformanceState> {
  const context = await getAuthorizationContext();
  if (!context) return { error: "Bitte melde dich erneut an." };
  try {
    await deleteOwnPerformanceEntry(context, field(formData, "entryId"));
  } catch (error) {
    return { error: errorMessage(error, "Der Eintrag konnte nicht gelöscht werden.") };
  }
  revalidatePath("/leistung");
  return { error: null };
}
