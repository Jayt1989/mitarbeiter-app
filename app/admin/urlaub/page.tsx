import type { Metadata } from "next";
import VacationManagement from "../vacation-management";
import { requirePageAccess } from "@/lib/page-access";

export const metadata: Metadata = {
  title: "Urlaubsanträge | Mitarbeiter-App",
  description: "Urlaubsanträge prüfen und die Personalbesetzung bewerten.",
};

export default async function AdminVacationPage() {
  const context = await requirePageAccess("/admin/urlaub");
  return <VacationManagement access={{ employeeId: context.employeeId, permissions: context.permissions }} />;
}
