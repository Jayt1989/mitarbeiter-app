import type { Metadata } from "next";
import StaffingDashboard from "./staffing-dashboard";

export const metadata: Metadata = {
  title: "Personalbesetzung | Mitarbeiter-App",
  description: "Tages- und Wochenübersicht der Personalbesetzung.",
};

export default function AdminPage() {
  return <StaffingDashboard />;
}