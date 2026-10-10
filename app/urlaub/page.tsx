import type { Metadata } from "next";
import VacationDashboard from "./vacation-dashboard";
import { requirePageAccess } from "@/lib/page-access";
import { prisma } from "@/lib/prisma";
import { employeeRelations, toEmployeeDto } from "@/lib/employee-mapper";

export const metadata: Metadata = {
  title: "Urlaub | Mitarbeiter-App",
  description: "Urlaubstage ansehen und Urlaub beantragen.",
};

export default async function UrlaubPage() {
  const context = await requirePageAccess("/urlaub");
  const record = context.employeeId ? await prisma.employee.findUnique({
    where: { id: context.employeeId }, include: employeeRelations,
  }) : null;
  return <VacationDashboard ownEmployee={record ? toEmployeeDto(record) : null} permissions={context.permissions} />;
}