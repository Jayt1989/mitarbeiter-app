import type { Metadata } from "next";
import { requirePageAccess } from "@/lib/page-access";
import { canViewStaffing } from "@/lib/access-policy";
import { canRequestShiftSwaps } from "@/lib/shift-swap-rules";
import { listSwaps } from "@/lib/shift-swaps";
import SwapBoard from "@/app/schichttausch/swap-board";
import SwapShell from "@/app/schichttausch/swap-shell";

export const metadata: Metadata = { title: "Schichttausch freigeben | TeamPlan" };

export default async function ReviewShiftSwapPage() {
  const context = await requirePageAccess("/admin/schichttausch");
  return (
    <SwapShell review canRequest={canRequestShiftSwaps(context)} canReview>
      <SwapBoard initialRequests={await listSwaps(context, true)} employeeId={context.employeeId} review
        canViewStaffing={canViewStaffing(context)}
      />
    </SwapShell>
  );
}
