import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePageAccess } from "@/lib/page-access";
import { loadPersonalDashboard } from "@/lib/personal-dashboard";
import PersonalDashboard from "./personal-dashboard";

export const metadata: Metadata = {
  title: "Mein Dashboard | TeamPlan",
  description: "Persönliche Schicht-, Urlaubs- und Einsatzübersicht.",
};

export default async function DashboardPage() {
  const context = await requirePageAccess("/dashboard");
  const data = await loadPersonalDashboard(context);
  if (!data) {
    redirect("/");
  }

  return <PersonalDashboard data={data} />;
}