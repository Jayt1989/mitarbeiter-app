import type { Metadata } from "next";
import EmployeeManagement from "./employee-management";
import { requirePageAccess } from "@/lib/page-access";

export const metadata: Metadata = {
  title: "Mitarbeiterverwaltung | Mitarbeiter-App",
  description: "Mitarbeiter, Schichtmodelle und Berechtigungen verwalten.",
};

export default async function MitarbeiterPage() {
  const context = await requirePageAccess("/mitarbeiter");
  return <EmployeeManagement access={context} />;
}