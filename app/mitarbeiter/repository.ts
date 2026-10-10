import type { Employee } from "./data";
import { apiJson } from "@/lib/api-client";
import { refreshNotifications } from "@/app/components/notification-events";
import type { EmployeeDeletionPreview } from "@/lib/employee-deletion";
import type { EmployeeOverviewScope } from "@/lib/employee-overview";

export interface EmployeeRepository {
  loadAll(): Promise<Employee[] | null>;
  loadOverview(scope: EmployeeOverviewScope): Promise<Employee[]>;
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

export const employeeRepository: EmployeeRepository = {
  async loadAll() {
    return apiJson<Employee[]>("/api/employees");
  },
  async loadOverview(scope) {
    return apiJson<Employee[]>(`/api/employees?scope=${scope}`);
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
