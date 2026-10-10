import { requirePageAccess } from "@/lib/page-access";
import EmployeeManagement from "@/app/mitarbeiter/employee-management";

export default async function AdminEmployeesPage() {
  const context = await requirePageAccess("/admin/mitarbeiter");
  return <EmployeeManagement access={context} />;
}
