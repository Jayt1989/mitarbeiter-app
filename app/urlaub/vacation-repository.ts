import {
  sampleVacationRequests,
  vacationStatuses,
  type VacationRequest,
} from "./vacation-data";

const storageKey = "mitarbeiter-app.urlaubsantraege.v1";

export interface VacationRepository {
  loadAll(): Promise<VacationRequest[]>;
  create(input: { startDate: string; endDate: string; comment: string }): Promise<VacationRequest>;
  decide(id: string, status: "Genehmigt" | "Abgelehnt" | "Storniert"): Promise<VacationRequest>;
  saveAll(requests: readonly VacationRequest[]): Promise<void>;
}

function isVacationRequest(value: unknown): value is VacationRequest {
  if (!value || typeof value !== "object") return false;

  const request = value as Record<string, unknown>;
  return (
    typeof request.id === "string" &&
    typeof request.employeeId === "string" &&
    typeof request.startDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(request.startDate) &&
    typeof request.endDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(request.endDate) &&
    request.startDate <= request.endDate &&
    typeof request.daysRequested === "number" &&
    Number.isInteger(request.daysRequested) &&
    request.daysRequested > 0 &&
    typeof request.requestedAt === "string" &&
    vacationStatuses.includes(request.status as VacationRequest["status"]) &&
    typeof request.comment === "string" &&
    (request.decidedAt === undefined || typeof request.decidedAt === "string")
  );
}

function copySamples() {
  return sampleVacationRequests.map((request) => ({ ...request }));
}

export const vacationRepository: VacationRepository = {
  async loadAll() {
    try {
      const response = await fetch("/api/vacation-requests", { cache: "no-store" });
      if (response.ok) return (await response.json()) as VacationRequest[];
    } catch {
      // Datenbank nicht erreichbar, lokalen Stand verwenden.
    }
    if (typeof window === "undefined") return copySamples();

    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === null) return copySamples();

      const requests: unknown = JSON.parse(stored);
      return Array.isArray(requests) && requests.every(isVacationRequest)
        ? requests
        : copySamples();
    } catch {
      return copySamples();
    }
  },

  async create(input) {
    const response = await fetch("/api/vacation-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "Der Antrag konnte nicht gespeichert werden.");
    }
    return (await response.json()) as VacationRequest;
  },

  async decide(id, status) {
    const response = await fetch("/api/vacation-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "Die Entscheidung konnte nicht gespeichert werden.");
    }
    return (await response.json()) as VacationRequest;
  },

  async saveAll(requests) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(requests));
  },
};
