import type { Metadata } from "next";
import ExportCenter from "../export-center";

export const metadata: Metadata = {
  title: "Export | Mitarbeiter-App",
  description: "Wochen- und Jahrespläne, Urlaub, Abwesenheiten und Besetzung als PDF oder Excel exportieren.",
};

export default function ExportPage() {
  return <ExportCenter />;
}
