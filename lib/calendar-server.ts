import type { CompanyDay as CompanyDayRecord } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CalendarData, CompanyDay } from "@/lib/calendar";
import { DEFAULT_COUNTRY, DEFAULT_STATE, isGermanState, type GermanState } from "@/lib/holidays";

export function toCompanyDayDto(record: CompanyDayRecord): CompanyDay {
  return {
    id: record.id,
    name: record.name,
    date: record.date.toISOString().slice(0, 10),
    type: record.type,
    note: record.note ?? "",
    active: record.active,
  };
}

export async function loadCalendarState(): Promise<GermanState> {
  const settings = await prisma.calendarSettings.findUnique({ where: { id: "default" } });
  return isGermanState(settings?.state) ? settings.state : DEFAULT_STATE;
}

export async function loadCalendarData(includeInactive = false): Promise<CalendarData> {
  const [settings, companyDays] = await Promise.all([
    prisma.calendarSettings.findUnique({ where: { id: "default" } }),
    prisma.companyDay.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: { date: "asc" },
    }),
  ]);
  return {
    country: settings?.country ?? DEFAULT_COUNTRY,
    state: isGermanState(settings?.state) ? settings.state : DEFAULT_STATE,
    companyDays: companyDays.map(toCompanyDayDto),
  };
}
