import type { Metadata } from "next";
import EmployeeManagement from "./employee-management";

export const metadata: Metadata = {
  title: "Mitarbeiterverwaltung | Mitarbeiter-App",
  description: "Mitarbeiter, Schichtmodelle und Berechtigungen verwalten.",
};

export default function MitarbeiterPage() {
  return <EmployeeManagement />;
}