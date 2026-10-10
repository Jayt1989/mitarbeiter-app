import type { Metadata } from "next";
import YearChange from "../year-change";
import { requirePageAccess } from "@/lib/page-access";

export const metadata: Metadata = {
  title: "Jahreswechsel | Mitarbeiter-App",
  description: "Urlaubskonten für das neue Jahr anlegen und Resturlaub übertragen.",
};

export default async function YearChangePage() {
  await requirePageAccess("/admin/jahreswechsel");
  return <YearChange />;
}
