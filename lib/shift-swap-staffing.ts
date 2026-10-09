import type { Employee } from "@/app/mitarbeiter/data";
import { getDailyStaffing, staffedShifts } from "@/app/admin/staffing";
import type { AbsenceEntry } from "@/app/admin/staffing-data";
import type { ExportSource } from "./export/source";
import { dateKeyToUtc } from "./calendar";
import type { ShiftSwapDto } from "./shift-swaps";

export type SwapStaffingInput = Pick<ShiftSwapDto,
  "date" | "requesterId" | "partnerId" | "requesterOriginalShift" | "partnerOriginalShift"
>;

export function swapStaffingPreview(source: ExportSource, swap: SwapStaffingInput) {
  const absences: AbsenceEntry[] = [
    ...source.absences.map((entry): AbsenceEntry => ({
      employeeId: entry.employeeId, startDate: entry.startDate, endDate: entry.endDate,
      type: entry.kind === "Freizeitausgleich" ? "Sonstige Abwesenheit" : entry.kind,
      approval: entry.status,
    })),
    ...source.vacations.filter((entry) => entry.status === "Genehmigt").map((entry): AbsenceEntry => ({
      employeeId: entry.employeeId, startDate: entry.startDate, endDate: entry.endDate,
      type: "Urlaub", approval: "Genehmigt",
    })),
  ];
  function summary(employees: Employee[]) {
    const day = getDailyStaffing(dateKeyToUtc(swap.date), employees, absences, source.areaConfiguration, source.assignments);
    return {
      trafficLight: day.overallTrafficLight,
      areas: staffedShifts.flatMap((shift) => day.shifts[shift].areas.map((area) => ({
        area: area.area.name, shift,
        available: area.available, minimum: area.minimum,
        qualifiedAvailable: area.qualifiedAvailable, minimumQualified: area.requiredQualified,
        trafficLight: area.trafficLight,
      }))),
    };
  }
  const changed = source.employees.map((employee) => {
    const shift = employee.id === swap.requesterId ? swap.partnerOriginalShift
      : employee.id === swap.partnerId ? swap.requesterOriginalShift : null;
    return shift ? {
      ...employee, individualAssignments: { ...employee.individualAssignments, [swap.date]: shift },
    } : employee;
  });
  return { before: summary(source.employees), after: summary(changed) };
}
export type SwapStaffingPreview = ReturnType<typeof swapStaffingPreview>;

export function swapStaffingWarnings(preview: SwapStaffingPreview): string[] {
  const warnings: string[] = [];
  if (preview.after.areas.some((area) => area.available < area.minimum)) {
    warnings.push("Nach dem Tausch besteht eine Unterschreitung der Mindestbesetzung.");
  }
  if (preview.after.areas.some((area) => area.qualifiedAvailable < area.minimumQualified)) {
    warnings.push("Nach dem Tausch besteht eine Unterschreitung der erforderlichen Qualifikationsbesetzung.");
  }
  return warnings;
}
