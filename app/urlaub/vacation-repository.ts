import type { VacationRequest } from "./vacation-data";
import { refreshNotifications } from "@/app/components/notification-events";
import { apiJson } from "@/lib/api-client";

export interface VacationRepository {
  loadAll(): Promise<VacationRequest[]>;
  create(input: { startDate: string; endDate: string; comment: string }): Promise<VacationRequest>;
  decide(id: string, status: "Genehmigt" | "Abgelehnt" | "Storniert"): Promise<VacationRequest>;
}

export const vacationRepository: VacationRepository = {
  loadAll: () => apiJson<VacationRequest[]>("/api/vacation-requests"),
  create(input) {
    return apiJson<VacationRequest>("/api/vacation-requests", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
    });
  },
  async decide(id, status) {
    const result = await apiJson<VacationRequest>("/api/vacation-requests", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }),
    });
    refreshNotifications();
    return result;
  },
};
