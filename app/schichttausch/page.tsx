import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/authorization";
import { canRequestShiftSwaps, canReviewShiftSwaps } from "@/lib/shift-swap-rules";
import { listSwaps } from "@/lib/shift-swaps";
import { isValidDateKey } from "@/app/admin/assignments-data";
import SwapBoard from "./swap-board";
import SwapShell from "./swap-shell";

export const metadata: Metadata = { title: "Schichttausch | Mitarbeiter-App" };

export default async function ShiftSwapPage({ searchParams }: {
  searchParams: Promise<{ date?: string }>;
}) {
  const context = await getAuthorizationContext();
  if (!context) redirect("/login");
  if (!canRequestShiftSwaps(context)) redirect("/dashboard");
  const { date } = await searchParams;
  return (
    <SwapShell review={false} canRequest canReview={canReviewShiftSwaps(context)}>
      <SwapBoard initialRequests={await listSwaps(context)} employeeId={context.employeeId}
        initialDate={isValidDateKey(date) ? date : undefined} />
    </SwapShell>
  );
}
