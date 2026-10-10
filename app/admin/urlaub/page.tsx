import type { Metadata } from "next";
import VacationManagement from "../vacation-management";
import { requirePageAccess } from "@/lib/page-access";

export const metadata: Metadata = {
  title: "Urlaubsanträge | TeamPlan",
  description: "Urlaubsanträge prüfen und die Personalbesetzung bewerten.",
};

export default async function AdminVacationPage({ searchParams }: {
  searchParams: Promise<{ request?: string }>;
}) {
  const context = await requirePageAccess("/admin/urlaub");
  const { request } = await searchParams;
  return <VacationManagement access={{ employeeId: context.employeeId, permissions: context.permissions }}
    requestId={request} />;
}
