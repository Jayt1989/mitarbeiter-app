import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PrintView from "@/app/export/druck/print-view";
import { additionalShiftBatch, canAdditionalShift } from "./additional-shift-rules";
import { intervalsOverlap, shiftInterval } from "./shift-interval";
import { getShiftForDate } from "@/app/schichtplan/rotation";
import { toEmployeeShiftPlan } from "@/app/mitarbeiter/schedule";
import { sampleEmployees } from "@/app/mitarbeiter/data";
import { getDailyStaffing, getWeeklyStaffing } from "@/app/admin/staffing";
import { buildWeekExport, buildYearExport, createDayResolver } from "./export/model";
import { createWorkbook } from "./export/excel";
import type { ExportSource } from "./export/source";
import { defaultCalendarData } from "./calendar";

test("Wochenendarbeit validiert Datum, aktive Schichten und Mehrfachauswahl", () => {
  const input = { date: "2026-10-17", shift: "EARLY", departmentId: "picking", employeeIds: ["a"], note: "" };
  assert.ok(additionalShiftBatch.safeParse(input).success);
  assert.ok(additionalShiftBatch.safeParse({ ...input, date: "2026-10-18" }).success);
  for (const invalid of [{ date: "2026-10-19" }, { date: "2026-02-30" }, { shift: "OFF" }, { employeeIds: [] }, { employeeIds: ["a", "a"] }]) {
    assert.equal(additionalShiftBatch.safeParse({ ...input, ...invalid }).success, false);
  }
});

test("Zusatzrechte sind für Mitarbeiter unwirksam und für Manager einzeln geprüft", () => {
  const base = { userId: "u", employeeId: "a", login: "a", permissions: { viewAdditionalShifts: true, planAdditionalShifts: true } };
  assert.equal(canAdditionalShift({ ...base, role: "EMPLOYEE" }, "planAdditionalShifts"), false);
  assert.equal(canAdditionalShift({ ...base, role: "FOREMAN" }, "planAdditionalShifts"), true);
  assert.equal(canAdditionalShift({ ...base, role: "ADMIN" }, "releaseAdditionalShifts"), false);
});

test("Nacht gehört zum Startdatum, geht über Mitternacht und berücksichtigt Sommer-/Winterzeit", () => {
  const night = shiftInterval("2026-10-17", "Nacht");
  assert.equal(new Date(night.start).toISOString(), "2026-10-17T20:00:00.000Z");
  assert.equal(new Date(night.end).toISOString(), "2026-10-18T04:00:00.000Z");
  assert.equal(intervalsOverlap(night, shiftInterval("2026-10-18", "Früh")), false);
  assert.equal(intervalsOverlap(night, night), true);
  const autumn = shiftInterval("2026-10-24", "Nacht");
  const spring = shiftInterval("2026-03-28", "Nacht");
  assert.equal((autumn.end - autumn.start) / 3_600_000, 9);
  assert.equal((spring.end - spring.start) / 3_600_000, 7);
});

test("Freigegebene Zusatzschicht zählt im Zielbereich am Wochenende, ohne Folgewoche zu ändern; Export kennzeichnet sie", async () => {
  const employee = { ...sampleEmployees[0], id: "a", shiftModel: "nur-frueh" as const, areaId: "home",
    additionalShifts: { "2026-10-17": { id: "extra", shift: "Nacht" as const, departmentId: "target", departmentName: "Zielbereich" } } };
  const plan = toEmployeeShiftPlan(employee);
  assert.equal(getShiftForDate(new Date("2026-10-17"), plan), "Nacht");
  assert.equal(getShiftForDate(new Date("2026-10-18"), plan), "Frei");
  assert.equal(getShiftForDate(new Date("2026-10-19"), plan), "Früh");
  const configuration = { areas: [{ id: "target", name: "Zielbereich", active: true }, { id: "home", name: "Stammbereich", active: true }], minimums: {} };
  const day = getDailyStaffing(new Date("2026-10-17"), [employee], [], configuration);
  assert.equal(day.shifts.Nacht.available, 1);
  assert.equal(day.shifts.Nacht.areas[0].available, 1);
  assert.equal(day.employees[0].additionalShift?.id, "extra");
  const week = getWeeklyStaffing(new Date("2026-10-17"), [employee], [], configuration);
  assert.equal(week.days.length, 7);
  assert.equal(week.days[5].shifts.Nacht.available, 1);
  const source: ExportSource = { from: "2026-10-12", to: "2026-10-18", employees: [employee],
    areaConfiguration: configuration, vacations: [], absences: [], assignments: [], calendar: defaultCalendarData, qualificationNames: new Map() };
  const resolver = createDayResolver(source);
  assert.match(resolver.cell(employee, "2026-10-17").label, /Nacht · Zusatzschicht · Zielbereich/);
  assert.equal(resolver.cell(employee, "2026-10-17").additionalShift, true);
  const weekly = new ExcelJS.Workbook();
  const weeklyBuffer = await createWorkbook({ type: "week", fileBase: "week", data: buildWeekExport(source, "2026-10-17", { areaId: null, shift: null }) });
  await weekly.xlsx.load(new Uint8Array(weeklyBuffer).buffer);
  const weeklyCell = weekly.getWorksheet(1)!.getCell("I6");
  assert.equal(weeklyCell.value, "Nacht\nZusatzschicht: Zielbereich");
  assert.match(JSON.stringify(weeklyCell.note), /Zusatzschicht: Zielbereich/);
  const year = buildYearExport(source, employee, 2026);
  assert.equal(year.assignments.length, 1);
  assert.equal(year.assignments[0].additionalShift, true);
  const yearly = new ExcelJS.Workbook();
  const yearlyBuffer = await createWorkbook({ type: "year", fileBase: "year", data: year });
  await yearly.xlsx.load(new Uint8Array(yearlyBuffer).buffer);
  const yearlyCell = yearly.getWorksheet(1)!.getCell("R14");
  assert.equal(yearlyCell.value, "N*");
  assert.match(JSON.stringify(yearlyCell.note), /Zusatzschicht: Zielbereich/);
  const detailRows: string[] = [];
  yearly.getWorksheet("Feiertage & Einsätze")!.eachRow((row) => detailRows.push(JSON.stringify(row.values)));
  assert.ok(detailRows.some((row) => /Zusatzschicht/.test(row) && /Zielbereich/.test(row)));
  const printed = renderToStaticMarkup(createElement(PrintView, {
    result: { type: "year", fileBase: "year", data: year }, createdAt: "Test",
  }));
  assert.match(printed, /Zusatzschicht: Zielbereich/);
});
