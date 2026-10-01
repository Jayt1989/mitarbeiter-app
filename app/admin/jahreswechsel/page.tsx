import type { Metadata } from "next";
import YearChange from "../year-change";

export const metadata: Metadata = {
  title: "Jahreswechsel | Mitarbeiter-App",
  description: "Urlaubskonten für das neue Jahr anlegen und Resturlaub übertragen.",
};

export default function YearChangePage() {
  return <YearChange />;
}
