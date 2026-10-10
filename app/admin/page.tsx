import type { Metadata } from "next";
import StaffingDashboard from "./staffing-dashboard";
import { isValidDateKey } from "./assignments-data";
import { requirePageAccess } from "@/lib/page-access";
import { performanceDashboardLink, performanceVisibility } from "@/lib/performance-rules";

export const metadata: Metadata = {
  title: "Personalbesetzung | TeamPlan",
  description: "Tages- und Wochenübersicht der Personalbesetzung.",
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const context = await requirePageAccess("/admin");
  const performanceLink = performanceDashboardLink(performanceVisibility(context));
  return <StaffingDashboard initialDate={isValidDateKey(date) ? date : undefined} performanceLink={performanceLink} access={context} />;
}