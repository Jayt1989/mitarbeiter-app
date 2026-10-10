import { permissionOptions, type Employee } from "@/app/mitarbeiter/data";
import { hasPermission, type AuthorizationContext } from "./authorization";

export const employeeOverviewScopes = ["vacation", "qualifications", "assignments", "export", "additional-shifts"] as const;
export type EmployeeOverviewScope = (typeof employeeOverviewScopes)[number];

const scopePermissions: Record<EmployeeOverviewScope, readonly string[]> = {
  vacation: ["otherVacations", "approveVacation"],
  qualifications: ["viewQualifications", "editQualifications", "manageQualifications"],
  assignments: ["editAssignments"],
  export: ["viewReports", "exportReports"],
  "additional-shifts": ["planAdditionalShifts"],
};

export function canReadEmployeeOverview(context: AuthorizationContext, scope: EmployeeOverviewScope) {
  return scopePermissions[scope].some((permission) => hasPermission(context, permission));
}

export function toOverviewEmployee(employee: Employee, scope: EmployeeOverviewScope): Employee {
  const permissions = { ...employee.permissions };
  for (const { id } of permissionOptions) permissions[id] = false;
  // Fachansichten benötigen Namen und Planung, aber keine Konten, Kontakte oder persönlichen Rechte.
  return {
    ...employee, personnelNumber: "", email: "", account: null, permissions,
    annualLeaveAllowance: 0, carryOverLeaveDays: 0,
    qualifications: scope === "qualifications" || scope === "assignments" ? employee.qualifications : {},
  };
}
