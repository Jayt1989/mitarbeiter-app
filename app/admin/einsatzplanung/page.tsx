import type { Metadata } from "next";
import AssignmentPlanning from "../assignment-planning";
import { requirePageAccess } from "@/lib/page-access";

export const metadata: Metadata = {
  title: "Einsatzplanung | Mitarbeiter-App",
  description: "Vertretungen und temporäre Einsätze in anderen Bereichen planen.",
};

export default async function AssignmentPlanningPage() {
  await requirePageAccess("/admin/einsatzplanung");
  return <AssignmentPlanning />;
}
