import type { Metadata } from "next";
import AreaSettings from "../area-settings";
import { requirePageAccess } from "@/lib/page-access";

export const metadata: Metadata = {
  title: "Mindestbesetzung | Mitarbeiter-App",
  description: "Bereiche und erforderliche Besetzung pro Schicht verwalten.",
};

export default async function MinimumStaffingPage() {
  await requirePageAccess("/admin/mindestbesetzung");
  return <AreaSettings />;
}