import type { Employee } from "../mitarbeiter/data";

const demoEmployeeId = "employee-1003";
const demoAdminId = "employee-1001";

export function getDemoEmployee(employees: readonly Employee[]) {
  return (
    employees.find((employee) => employee.id === demoEmployeeId && employee.isActive) ??
    employees.find(
      (employee) =>
        employee.isActive &&
        employee.role !== "Admin" &&
        employee.permissions.requestVacation,
    ) ??
    null
  );
}

export function getDemoAdmin(employees: readonly Employee[]) {
  return (
    employees.find((employee) => employee.id === demoAdminId && employee.isActive) ??
    employees.find((employee) => employee.isActive && employee.role === "Admin") ??
    null
  );
}
