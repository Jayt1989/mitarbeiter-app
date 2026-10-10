import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAuthorizationContext } from "@/lib/authorization";
import { loadPersonalDashboard } from "@/lib/personal-dashboard";
import { canAccessPage } from "@/lib/access-policy";
import PersonalDashboard from "./personal-dashboard";

export const metadata: Metadata = {
  title: "Mein Dashboard | Mitarbeiter-App",
  description: "Persönliche Schicht-, Urlaubs- und Einsatzübersicht.",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.role === "ADMIN" && canAccessPage(session.user, "/admin")) redirect("/admin");
  const context = await getAuthorizationContext();
  if (!context) redirect("/login");

  const data = await loadPersonalDashboard(context);
  if (!data) {
    if (context.permissions.requestVacation || context.permissions.ownVacation) {
      redirect("/urlaub");
    }
    redirect("/schichtplan");
  }

  return <PersonalDashboard data={data} />;
}