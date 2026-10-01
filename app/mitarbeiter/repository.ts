import {
  employeeRoles,
  permissionOptions,
  sampleEmployees,
  shiftGroups,
  type Employee,
} from "./data";
import { shiftModelOptions } from "../schichtplan/rotation";

const storageKey = "mitarbeiter-app.mitarbeiter.v1";
const validShifts = ["Früh", "Spät", "Nacht", "Frei"] as const;

export interface EmployeeRepository {
  loadAll(): Promise<Employee[] | null>;
  saveAll(employees: readonly Employee[]): Promise<void>;
}

function isEmployee(value: unknown): value is Employee {
  if (!value || typeof value !== "object") return false;

  const employee = value as Record<string, unknown>;
  const permissions = employee.permissions as
    | Record<string, unknown>
    | undefined;
  const individualAssignments = employee.individualAssignments;
  const validAssignments =
    individualAssignments === undefined ||
    (!!individualAssignments &&
      typeof individualAssignments === "object" &&
      !Array.isArray(individualAssignments) &&
      Object.values(individualAssignments).every((shift) =>
        validShifts.includes(shift as (typeof validShifts)[number]),
      ));

  return (
    typeof employee.id === "string" &&
    typeof employee.firstName === "string" &&
    typeof employee.lastName === "string" &&
    typeof employee.personnelNumber === "string" &&
    typeof employee.email === "string" &&
    employeeRoles.includes(employee.role as (typeof employeeRoles)[number]) &&
    shiftModelOptions.some((model) => model.id === employee.shiftModel) &&
    shiftGroups.includes(employee.shiftGroup as (typeof shiftGroups)[number]) &&
    (employee.areaId === undefined || employee.areaId === null || typeof employee.areaId === "string") &&
    typeof employee.isActive === "boolean" &&
    (employee.annualLeaveAllowance === undefined ||
      (typeof employee.annualLeaveAllowance === "number" && employee.annualLeaveAllowance >= 0)) &&
    (employee.carryOverLeaveDays === undefined ||
      (typeof employee.carryOverLeaveDays === "number" && employee.carryOverLeaveDays >= 0)) &&
    !!permissions &&
    Object.values(permissions).every((allowed) => typeof allowed === "boolean") &&
    validAssignments
  );
}

function addLeaveDefaults(employee: Employee): Employee {
  const sampleAreaId = sampleEmployees.find((sample) => sample.id === employee.id)?.areaId ?? null;
  const samplePermissions =
    sampleEmployees.find((sample) => sample.id === employee.id)?.permissions;
  return {
    ...employee,
    areaId: employee.areaId === undefined ? sampleAreaId : employee.areaId,
    annualLeaveAllowance: employee.annualLeaveAllowance ?? 30,
    carryOverLeaveDays: employee.carryOverLeaveDays ?? 0,
    permissions: Object.fromEntries(
      permissionOptions.map(({ id }) => [
        id,
        employee.permissions[id] ?? samplePermissions?.[id] ?? false,
      ]),
    ) as Employee["permissions"],
  };
}

function loadFromLocalStorage(): Employee[] | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) return null;

    const employees: unknown = JSON.parse(stored);
    return Array.isArray(employees) && employees.every(isEmployee)
      ? employees.map(addLeaveDefaults)
      : null;
  } catch {
    return null;
  }
}

export const employeeRepository: EmployeeRepository = {
  async loadAll() {
    try {
      const response = await fetch("/api/employees", { cache: "no-store" });
      if (response.ok) return (await response.json()) as Employee[];
    } catch {
      // Datenbank nicht erreichbar, lokalen Stand verwenden.
    }
    return loadFromLocalStorage();
  },

  async saveAll(employees) {
    try {
      const response = await fetch("/api/employees", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(employees),
      });
      if (response.ok) return;
    } catch {
      // Datenbank nicht erreichbar, lokal zwischenspeichern.
    }
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(employees));
  },
};
