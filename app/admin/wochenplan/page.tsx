import type { Metadata } from "next";
import WeekPlan from "../week-plan";

export const metadata: Metadata = {
  title: "Wochenschichtplan | Mitarbeiter-App",
  description: "A4-Wochenschichtplan mit tatsächlichem Einsatzbereich.",
};

export default function WeekPlanPage() {
  return <WeekPlan />;
}
