import type { Qualification } from "./qualifications-data";
import { refreshNotifications } from "@/app/components/notification-events";
import { apiJson } from "@/lib/api-client";

export interface QualificationsRepository {
  loadAll(): Promise<Qualification[]>;
  loadForAssignments(): Promise<Qualification[]>;
  create(name: string): Promise<Qualification>;
  rename(id: string, name: string): Promise<Qualification>;
  setActive(id: string, active: boolean): Promise<Qualification>;
  remove(id: string): Promise<void>;
  setEmployeeLevel(employeeId: string, qualificationId: string, level: number): Promise<void>;
}

function save(method: string, body: object) {
  return apiJson<Qualification>("/api/qualifications", {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

export const qualificationsRepository: QualificationsRepository = {
  loadAll: () => apiJson<Qualification[]>("/api/qualifications"),
  loadForAssignments: () => apiJson<Qualification[]>("/api/qualifications?scope=assignments"),
  create: (name) => save("POST", { name }),
  rename: (id, name) => save("PATCH", { id, name }),
  setActive: (id, active) => save("PATCH", { id, active }),
  async remove(id) {
    await apiJson(`/api/qualifications?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async setEmployeeLevel(employeeId, qualificationId, level) {
    await apiJson("/api/employee-qualifications", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, qualificationId, level }),
    });
    refreshNotifications();
  },
};
