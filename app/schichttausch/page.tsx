import type { Metadata } from "next";
import { requirePageAccess } from "@/lib/page-access";
import { canReviewShiftSwaps } from "@/lib/shift-swap-rules";
import { listSwaps } from "@/lib/shift-swaps";
import { isValidDateKey } from "@/app/admin/assignments-data";
import SwapBoard from "./swap-board";
import SwapShell from "./swap-shell";

export const metadata: Metadata = { title: "Schichttausch | TeamPlan" };

export default async function ShiftSwapPage({ searchParams }: {
  searchParams: Promise<{ date?: string }>;
}) {
  const context = await requirePageAccess("/schichttausch");
  const { date } = await searchParams;
  return (
    <SwapShell review={false} canRequest canReview={canReviewShiftSwaps(context)}>
      <SwapBoard initialRequests={await listSwaps(context)} employeeId={context.employeeId}
        initialDate={isValidDateKey(date) ? date : undefined} />
    </SwapShell>
  );
}
