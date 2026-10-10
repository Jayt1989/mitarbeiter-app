"use server";

import { revalidatePath } from "next/cache";
import { getAuthorizationContext } from "@/lib/authorization";
import { updatePerformanceTarget } from "@/lib/performance";
import { PerformanceError } from "@/lib/performance-rules";

export type TargetFormState = { error: string | null; saved: boolean };

export async function saveTargetAction(
  _previous: TargetFormState, formData: FormData,
): Promise<TargetFormState> {
  const context = await getAuthorizationContext();
  if (!context) return { error: "Bitte melde dich erneut an.", saved: false };
  const code = formData.get("code");
  const target = formData.get("targetPerHour");
  try {
    if (typeof code !== "string" || typeof target !== "string") {
      throw new PerformanceError("Bitte Arbeitsplatz und Sollwert angeben.");
    }
    await updatePerformanceTarget(context, code, target);
  } catch (error) {
    if (error instanceof PerformanceError) return { error: error.message, saved: false };
    console.error("Sollwert konnte nicht gespeichert werden.", error instanceof Error ? error.name : "unknown");
    return { error: "Der Sollwert konnte nicht gespeichert werden.", saved: false };
  }
  revalidatePath("/admin/leistung/arbeitsplaetze");
  revalidatePath("/admin/leistung");
  revalidatePath("/leistung");
  return { error: null, saved: true };
}
