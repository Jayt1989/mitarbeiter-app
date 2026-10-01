import type { Metadata } from "next";
import VacationManagement from "../vacation-management";

export const metadata: Metadata = {
  title: "Urlaubsanträge | Mitarbeiter-App",
  description: "Urlaubsanträge prüfen und die Personalbesetzung bewerten.",
};

export default function AdminVacationPage() {
  return <VacationManagement />;
}
