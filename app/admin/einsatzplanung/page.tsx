import type { Metadata } from "next";
import AssignmentPlanning from "../assignment-planning";

export const metadata: Metadata = {
  title: "Einsatzplanung | Mitarbeiter-App",
  description: "Vertretungen und temporäre Einsätze in anderen Bereichen planen.",
};

export default function AssignmentPlanningPage() {
  return <AssignmentPlanning />;
}
