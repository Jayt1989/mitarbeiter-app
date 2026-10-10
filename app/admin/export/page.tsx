import type { Metadata } from "next";
import ExportCenter from "../export-center";
import { requirePageAccess } from "@/lib/page-access";

export const metadata: Metadata = {
  title: "Export | TeamPlan",
  description: "Wochen- und Jahrespläne, Urlaub, Abwesenheiten und Besetzung als PDF oder Excel exportieren.",
};

export default async function ExportPage() {
  await requirePageAccess("/admin/export");
  return <ExportCenter />;
}
