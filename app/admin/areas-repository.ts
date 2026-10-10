import type { AreaConfiguration } from "./areas-data";
import { apiJson } from "@/lib/api-client";

export interface AreaRepository {
  load(): Promise<AreaConfiguration>;
  save(configuration: AreaConfiguration): Promise<void>;
}

export const areaRepository: AreaRepository = {
  load() {
    return apiJson<AreaConfiguration>("/api/areas");
  },
  async save(configuration) {
    await apiJson<AreaConfiguration>("/api/areas", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(configuration),
    });
  },
};
