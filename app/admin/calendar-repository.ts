import { defaultCalendarData, type CalendarData, type CompanyDay } from "@/lib/calendar";
import type { GermanState } from "@/lib/holidays";

async function send<T>(url: string, method: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(error?.error ?? "Die Änderung konnte nicht gespeichert werden.");
  }
  return (await response.json()) as T;
}

export const calendarRepository = {
  async load(): Promise<CalendarData> {
    try {
      const response = await fetch("/api/calendar", { cache: "no-store" });
      if (response.ok) return (await response.json()) as CalendarData;
    } catch {
      // Datenbank nicht erreichbar, Standardregion verwenden.
    }
    return defaultCalendarData;
  },

  saveState(state: GermanState) {
    return send<CalendarData>("/api/calendar", "PUT", { state });
  },

  createCompanyDay(input: Omit<CompanyDay, "id">) {
    return send<CompanyDay>("/api/company-days", "POST", input);
  },

  updateCompanyDay(day: CompanyDay) {
    return send<CompanyDay>("/api/company-days", "PATCH", day);
  },
};
