import type { Metadata } from "next";
import QualificationManagement from "../qualification-management";

export const metadata: Metadata = {
  title: "Qualifikationen | Mitarbeiter-App",
  description: "Qualifikationskatalog pflegen und Mitarbeiter einstufen.",
};

export default function QualifikationenPage() {
  return <QualificationManagement />;
}
