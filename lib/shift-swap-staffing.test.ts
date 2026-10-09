import assert from "node:assert/strict";
import { test } from "node:test";
import { sampleEmployees } from "@/app/mitarbeiter/data";
import { getDailyStaffing, getStaffingAbsences, getWeeklyStaffing } from "@/app/admin/staffing";
import { defaultCalendarData, dateKeyToUtc } from "./calendar";
import type { ExportSource } from "./export/source";
import { buildWeekExport, buildYearExport } from "./export/model";
import { getShiftForDate } from "@/app/schichtplan/rotation";
import { toEmployeeShiftPlan } from "@/app/mitarbeiter/schedule";
import { swapStaffingPreview, swapStaffingWarnings } from "./shift-swap-staffing";
import type { ShiftSwapDto } from "./shift-swaps";

const swap: ShiftSwapDto = {
  id: "swap-1", requesterId: "a", partnerId: "b",
  requesterName: "Anna Test", partnerName: "Ben Test", date: "2026-10-20",
  requesterOriginalShift: "Früh", partnerOriginalShift: "Spät",
  requesterArea: "Verpackung", partnerArea: "Autosort",
  status: "PARTNER_BESTAETIGT", comment: "", createdAt: "2026-10-02T00:00:00Z",
  approvedAt: null, partnerDecidedAt: null, rejectedAt: null, cancelledAt: null,
};
const source: ExportSource = {
  from: "2026-10-19", to: "2026-10-25",
  employees: [
    { ...sampleEmployees[0], id: "a", shiftModel: "nur-frueh", areaId: "packaging", qualifications: { picking: 2 } },
    { ...sampleEmployees[1], id: "b", shiftModel: "nur-spaet", areaId: "autosort", qualifications: { picking: 0 } },
  ],
  areaConfiguration: {
    areas: [{ id: "packaging", name: "Verpackung", active: true }, { id: "autosort", name: "Autosort", active: true }],
    minimums: {
      packaging: {
        Früh: { minimum: 1, qualificationId: "picking", minimumQualified: 1 },
        Spät: { minimum: 0, qualificationId: null, minimumQualified: 0 },
        Nacht: { minimum: 0, qualificationId: null, minimumQualified: 0 },
      },
      autosort: {
        Früh: { minimum: 0, qualificationId: null, minimumQualified: 0 },
        Spät: { minimum: 1, qualificationId: null, minimumQualified: 0 },
        Nacht: { minimum: 0, qualificationId: null, minimumQualified: 0 },
      },
    },
  },
  vacations: [], absences: [], assignments: [], calendar: defaultCalendarData,
  qualificationNames: new Map([["picking", "Kommissionierung"]]),
};

test("staffing preview recomputes area headcounts and qualifications using existing minima", () => {
  const result = swapStaffingPreview(source, swap);
  const find = (state: typeof result.before, area: string, shift: string) =>
    state.areas.find((entry) => entry.area === area && entry.shift === shift);
  assert.equal(find(result.before, "Verpackung", "Früh")?.available, 1);
  assert.equal(find(result.after, "Verpackung", "Früh")?.available, 0);
  assert.equal(find(result.after, "Verpackung", "Früh")?.qualifiedAvailable, 0);
  assert.equal(find(result.after, "Verpackung", "Früh")?.minimum, 1);
  assert.equal(find(result.after, "Verpackung", "Früh")?.trafficLight, "red");
  assert.equal(find(result.after, "Verpackung", "Spät")?.available, 1);
  assert.equal(find(result.after, "Autosort", "Früh")?.available, 1);
  assert.equal(find(result.after, "Autosort", "Spät")?.available, 0);
  assert.equal(source.employees[0].individualAssignments, undefined);
});

test("employee preflight reports both deficits without exposing staffing records", () => {
  const warnings = swapStaffingWarnings(swapStaffingPreview(source, swap));
  assert.deepEqual(warnings, [
    "Nach dem Tausch besteht eine Unterschreitung der Mindestbesetzung.",
    "Nach dem Tausch besteht eine Unterschreitung der erforderlichen Qualifikationsbesetzung.",
  ]);
});

test("employee preflight succeeds without warnings when all configured minima are met", () => {
  const preview = swapStaffingPreview(source, swap);
  const after = { ...preview.after, areas: preview.after.areas.map((area) => ({
    ...area, minimum: 0, minimumQualified: 0,
  })) };
  assert.deepEqual(swapStaffingWarnings({ ...preview, after }), []);
});

test("qualification-only and headcount-only deficits are reported independently", () => {
  const preview = swapStaffingPreview(source, swap);
  const areas = preview.after.areas.map((area) => ({ ...area, minimum: 0, minimumQualified: 0 }));
  assert.equal(swapStaffingWarnings({
    ...preview, after: { ...preview.after, areas: [{ ...areas[0], minimumQualified: 1 }] },
  }).length, 1);
  assert.equal(swapStaffingWarnings({
    ...preview, after: { ...preview.after, areas: [{ ...areas[0], minimum: 1 }] },
  }).length, 1);
});

test("approved one-day overrides appear in day/week staffing while adjacent days retain rotation", () => {
  const employees = source.employees.map((employee) => ({
    ...employee,
    individualAssignments: { [swap.date]: employee.id === "a" ? swap.partnerOriginalShift : swap.requesterOriginalShift },
  }));
  const day = getDailyStaffing(dateKeyToUtc(swap.date), employees, [], source.areaConfiguration);
  assert.equal(day.employees.find((entry) => entry.employee.id === "a")?.shift, "Spät");
  assert.equal(day.employees.find((entry) => entry.employee.id === "b")?.shift, "Früh");
  const week = getWeeklyStaffing(dateKeyToUtc(swap.date), employees, [], source.areaConfiguration);
  assert.equal(week.days.find((entry) => entry.date.toISOString().slice(0, 10) === swap.date)?.employees[0].shift, "Spät");
  assert.equal(getShiftForDate(dateKeyToUtc("2026-10-19"), toEmployeeShiftPlan(employees[0])), "Früh");
  assert.equal(getShiftForDate(dateKeyToUtc("2026-10-21"), toEmployeeShiftPlan(employees[0])), "Früh");
});

test("database absence entries replace demo absences without changing approved-vacation precedence", () => {
  const absences = getStaffingAbsences([], []);
  assert.deepEqual(absences, []);
  const data = {
    ...source,
    absences: [{ id: "absence", employeeId: "a", kind: "Krank", status: "Erfasst", startDate: swap.date, endDate: swap.date }] as const,
  };
  const result = swapStaffingPreview({ ...data, absences: [...data.absences] }, swap);
  assert.equal(result.after.areas.find((entry) => entry.area === "Verpackung" && entry.shift === "Spät")?.available, 0);
});

test("annual and weekly exports include swapped shifts", () => {
  const changed = {
    ...source,
    employees: source.employees.map((employee) => ({
      ...employee,
      individualAssignments: { [swap.date]: employee.id === "a" ? swap.partnerOriginalShift : swap.requesterOriginalShift },
    })),
  };
  const year = buildYearExport(changed, changed.employees[0], 2026);
  const week = buildWeekExport(changed, swap.date, { areaId: null, shift: null });
  assert.equal(year.months[9].cells[19]?.shift, "Spät");
  assert.equal(year.months[9].cells[18]?.shift, "Früh");
  assert.equal(year.months[9].cells[20]?.shift, "Früh");
  const rows = week.groups.flatMap((group) => group.rows);
  assert.equal(rows.find((row) => row.employee.id === "a")?.cells.find((cell) => cell.date === swap.date)?.shift, "Spät");
  assert.equal(rows.find((row) => row.employee.id === "b")?.cells.find((cell) => cell.date === swap.date)?.shift, "Früh");
});
