import type { Metadata } from "next";
import StaffingDashboard from "./staffing-dashboard";
import { isValidDateKey } from "./assignments-data";

export const metadata: Metadata = {
  title: "Personalbesetzung | Mitarbeiter-App",
  description: "Tages- und Wochenübersicht der Personalbesetzung.",
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  return <StaffingDashboard initialDate={isValidDateKey(date) ? date : undefined} />;
}