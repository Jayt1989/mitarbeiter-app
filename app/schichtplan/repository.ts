import type { ShiftPlanData } from "@/lib/shift-plan";

export const shiftPlanRepository = {
  async load(scope: "personal" | "staffing" = "personal"): Promise<ShiftPlanData> {
    const response = await fetch(`/api/shift-plan${scope === "staffing" ? "?scope=staffing" : ""}`, { cache: "no-store" });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "Schichtplanung konnte nicht geladen werden.");
    }
    return (await response.json()) as ShiftPlanData;
  },
};
