import type { Metadata } from "next";
import AreaSettings from "../area-settings";

export const metadata: Metadata = {
  title: "Mindestbesetzung | Mitarbeiter-App",
  description: "Bereiche und erforderliche Besetzung pro Schicht verwalten.",
};

export default function MinimumStaffingPage() {
  return <AreaSettings />;
}