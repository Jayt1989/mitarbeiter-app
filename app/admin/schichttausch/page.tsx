import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/authorization";
import { canRequestShiftSwaps, canReviewShiftSwaps } from "@/lib/shift-swap-rules";
import { listSwaps } from "@/lib/shift-swaps";
import SwapBoard from "@/app/schichttausch/swap-board";
import SwapShell from "@/app/schichttausch/swap-shell";

export const metadata: Metadata = { title: "Schichttausch freigeben | Mitarbeiter-App" };

export default async function ReviewShiftSwapPage() {
  const context = await getAuthorizationContext();
  if (!context) redirect("/login");
  if (!canReviewShiftSwaps(context)) redirect("/schichtplan");
  return (
    <SwapShell review canRequest={canRequestShiftSwaps(context)} canReview>
      <SwapBoard initialRequests={await listSwaps(context, true)} employeeId={context.employeeId} review
        canViewStaffing={context.role === "ADMIN" && context.permissions.openAdmin === true}
      />
    </SwapShell>
  );
}
