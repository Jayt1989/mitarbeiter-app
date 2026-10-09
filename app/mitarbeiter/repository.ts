import {
  employeeRoles,
  permissionOptions,
  sampleEmployees,
  shiftGroups,
  type Employee,
} from "./data";
import { shiftModelOptions } from "../schichtplan/rotation";
import { refreshNotifications } from "@/app/components/notification-events";
import type { EmployeeDeletionPreview } from "@/lib/employee-deletion";

const storageKey = "mitarbeiter-app.mitarbeiter.v1";
const validShifts = ["Früh", "Spät", "Nacht", "Frei"] as const;

export interface EmployeeRepository {
  loadAll(): Promise<Employee[] | null>;
  saveAll(employees: readonly Employee[]): Promise<void>;
  createWithAccount(employee: Employee, startPassword: string): Promise<Employee[]>;
  resetPassword(employeeId: string, password: string): Promise<{ created: boolean }>;
  deletionPreview(employeeId: string): Promise<EmployeeDeletionPreview>;
  deactivate(employeeId: string): Promise<EmployeeDeletionPreview>;
  deletePermanently(
    employeeId: string,
    input: { confirmation: string; confirmHistory: boolean; fingerprint: string },
  ): Promise<void>;
}

async function errorMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
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
    const response = await fetch("/api/employees", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(employees),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "Die Mitarbeiterdaten konnten nicht gespeichert werden.");
    }
    refreshNotifications();
  },

  async createWithAccount(employee, startPassword) {
    const response = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee, startPassword }),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(await errorMessage(response, "Der Mitarbeiter konnte nicht angelegt werden."));
    }
    const body = (await response.json()) as { employees: Employee[] };
    refreshNotifications();
    return body.employees;
  },

  async resetPassword(employeeId, password) {
    const response = await fetch(`/api/employees/${encodeURIComponent(employeeId)}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(await errorMessage(response, "Das Passwort konnte nicht zurückgesetzt werden."));
    }
    return (await response.json()) as { created: boolean };
  },

  async deletionPreview(employeeId) {
    const response = await fetch(`/api/employees/${encodeURIComponent(employeeId)}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(await errorMessage(response, "Die verknüpften Daten konnten nicht geprüft werden."));
    }
    return (await response.json()) as EmployeeDeletionPreview;
  },

  async deactivate(employeeId) {
    const response = await fetch(`/api/employees/${encodeURIComponent(employeeId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(await errorMessage(response, "Der Mitarbeiter konnte nicht deaktiviert werden."));
    }
    return (await response.json()) as EmployeeDeletionPreview;
  },

  async deletePermanently(employeeId, input) {
    const response = await fetch(`/api/employees/${encodeURIComponent(employeeId)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(await errorMessage(response, "Der Mitarbeiter konnte nicht gelöscht werden."));
    }
    refreshNotifications();
  },
};
