import type { Metadata } from "next";
import QualificationManagement from "../qualification-management";
import { requirePageAccess } from "@/lib/page-access";

export const metadata: Metadata = {
  title: "Qualifikationen | TeamPlan",
  description: "Qualifikationskatalog pflegen und Mitarbeiter einstufen.",
};

export default async function QualifikationenPage() {
  const context = await requirePageAccess("/admin/qualifikationen");
  return <QualificationManagement permissions={context.permissions} />;
}
