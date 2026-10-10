import type { Metadata } from "next";
import CalendarSettings from "../calendar-settings";
import { requirePageAccess } from "@/lib/page-access";

export const metadata: Metadata = {
  title: "Feiertage & Kalender | Mitarbeiter-App",
  description: "Bundesland, gesetzliche Feiertage und betriebliche Sondertage verwalten.",
};

export default async function CalendarSettingsPage() {
  await requirePageAccess("/admin/einstellungen");
  return <CalendarSettings />;
}
