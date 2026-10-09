import type { Metadata } from "next";
import ShiftCalendar from "./shift-calendar";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/authorization";
import { loadShiftPlan } from "@/lib/shift-plan";
import { canRequestShiftSwaps, canReviewShiftSwaps } from "@/lib/shift-swap-rules";

export const metadata: Metadata = {
  title: "Schichtplan | Mitarbeiter-App",
  description: "Persönliche Jahres-Schichtpläne für alle Mitarbeiter.",
};

export default async function SchichtplanPage() {
  const context = await getAuthorizationContext();
  if (!context) redirect("/login");
  if (!context.permissions.ownShiftPlan && !context.permissions.teamShiftPlan) redirect("/dashboard");
  return <ShiftCalendar initialData={await loadShiftPlan(context)}
    ownEmployeeId={context.employeeId}
    canSwap={canRequestShiftSwaps(context)}
    canReview={canReviewShiftSwaps(context)}
  />;
}