import type { Metadata } from "next";
import WeekPlan from "../week-plan";
import { requirePageAccess } from "@/lib/page-access";

export const metadata: Metadata = {
  title: "Wochenschichtplan | Mitarbeiter-App",
  description: "A4-Wochenschichtplan mit tatsächlichem Einsatzbereich.",
};

export default async function WeekPlanPage() {
  await requirePageAccess("/admin/wochenplan");
  return <WeekPlan />;
}
