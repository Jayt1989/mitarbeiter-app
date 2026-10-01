import { employeeRepository } from "../mitarbeiter/repository";
import { sampleQualifications, type Qualification } from "./qualifications-data";

const storageKey = "mitarbeiter-app.qualifikationen.v1";

export interface QualificationsRepository {
  loadAll(): Promise<Qualification[]>;
  create(name: string): Promise<Qualification>;
  rename(id: string, name: string): Promise<Qualification>;
  setActive(id: string, active: boolean): Promise<Qualification>;
  remove(id: string): Promise<void>;
  setEmployeeLevel(employeeId: string, qualificationId: string, level: number): Promise<void>;
}

function isQualification(value: unknown): value is Qualification {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.name === "string" &&
    typeof entry.active === "boolean"
  );
}

function loadFromLocalStorage(): Qualification[] {
  if (typeof window === "undefined") return sampleQualifications.map((entry) => ({ ...entry }));

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) return sampleQualifications.map((entry) => ({ ...entry }));
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.every(isQualification)
      ? parsed
      : sampleQualifications.map((entry) => ({ ...entry }));
  } catch {
    return sampleQualifications.map((entry) => ({ ...entry }));
  }
}

function saveToLocalStorage(qualifications: readonly Qualification[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(qualifications));
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(input, init);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export const qualificationsRepository: QualificationsRepository = {
  async loadAll() {
    const fromApi = await fetchJson<Qualification[]>("/api/qualifications", { cache: "no-store" });
    if (fromApi) return fromApi;
    return loadFromLocalStorage();
  },

  async create(name) {
    const created = await fetchJson<Qualification>("/api/qualifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (created) return created;

    const qualifications = loadFromLocalStorage();
    if (qualifications.some((entry) => entry.name.toLocaleLowerCase("de") === name.trim().toLocaleLowerCase("de"))) {
      throw new Error("Eine Qualifikation mit diesem Namen existiert bereits.");
    }
    const newQualification: Qualification = { id: crypto.randomUUID(), name: name.trim(), active: true };
    saveToLocalStorage([...qualifications, newQualification]);
    return newQualification;
  },

  async rename(id, name) {
    const updated = await fetchJson<Qualification>("/api/qualifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    });
    if (updated) return updated;

    const qualifications = loadFromLocalStorage();
    const next = qualifications.map((entry) => (entry.id === id ? { ...entry, name: name.trim() } : entry));
    saveToLocalStorage(next);
    return next.find((entry) => entry.id === id)!;
  },

  async setActive(id, active) {
    const updated = await fetchJson<Qualification>("/api/qualifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active }),
    });
    if (updated) return updated;

    const qualifications = loadFromLocalStorage();
    const next = qualifications.map((entry) => (entry.id === id ? { ...entry, active } : entry));
    saveToLocalStorage(next);
    return next.find((entry) => entry.id === id)!;
  },

  async remove(id) {
    try {
      const response = await fetch(`/api/qualifications?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (response.ok) return;
      if (response.status === 409) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Diese Qualifikation wird noch verwendet.");
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("verwendet")) throw error;
    }

    const employees = await employeeRepository.loadAll();
    const isUsed = employees?.some((employee) => (employee.qualifications?.[id] ?? 0) > 0);
    if (isUsed) {
      throw new Error("Diese Qualifikation wird noch verwendet und kann nicht gelöscht werden.");
    }
    saveToLocalStorage(loadFromLocalStorage().filter((entry) => entry.id !== id));
  },

  async setEmployeeLevel(employeeId, qualificationId, level) {
    const updated = await fetchJson<{ employeeId: string }>("/api/employee-qualifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, qualificationId, level }),
    });
    if (updated) return;

    const employees = await employeeRepository.loadAll();
    if (!employees) throw new Error("Mitarbeiter konnten nicht geladen werden.");
    const nextEmployees = employees.map((employee) =>
      employee.id === employeeId
        ? { ...employee, qualifications: { ...(employee.qualifications ?? {}), [qualificationId]: level } }
        : employee,
    );
    await employeeRepository.saveAll(nextEmployees);
  },
};
