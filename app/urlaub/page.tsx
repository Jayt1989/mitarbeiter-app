import type { Metadata } from "next";
import VacationDashboard from "./vacation-dashboard";

export const metadata: Metadata = {
  title: "Urlaub | Mitarbeiter-App",
  description: "Urlaubstage ansehen und Urlaub beantragen.",
};

export default function UrlaubPage() {
  return <VacationDashboard />;
}