import type { Metadata } from "next";
import CalendarSettings from "../calendar-settings";

export const metadata: Metadata = {
  title: "Feiertage & Kalender | Mitarbeiter-App",
  description: "Bundesland, gesetzliche Feiertage und betriebliche Sondertage verwalten.",
};

export default function CalendarSettingsPage() {
  return <CalendarSettings />;
}
