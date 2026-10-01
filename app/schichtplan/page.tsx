import type { Metadata } from "next";
import ShiftCalendar from "./shift-calendar";

export const metadata: Metadata = {
  title: "Schichtplan | Mitarbeiter-App",
  description: "Persönliche Jahres-Schichtpläne für alle Mitarbeiter.",
};

export default function SchichtplanPage() {
  return <ShiftCalendar />;
}