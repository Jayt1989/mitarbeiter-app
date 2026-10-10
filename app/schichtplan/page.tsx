import type { Metadata } from "next";
import ShiftCalendar from "./shift-calendar";
import { requirePageAccess } from "@/lib/page-access";
import { loadShiftPlan } from "@/lib/shift-plan";
import { canRequestShiftSwaps, canReviewShiftSwaps } from "@/lib/shift-swap-rules";

export const metadata: Metadata = {
  title: "Schichtplan | TeamPlan",
  description: "Persönliche Jahres-Schichtpläne für alle Mitarbeiter.",
};

export default async function SchichtplanPage() {
  const context = await requirePageAccess("/schichtplan");
  return <ShiftCalendar initialData={await loadShiftPlan(context)}
    ownEmployeeId={context.employeeId}
    canSwap={canRequestShiftSwaps(context)}
    canReview={canReviewShiftSwaps(context)}
  />;
}