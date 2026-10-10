import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { createWorkbook } from "./excel";
import type { PerformanceReportRow } from "../performance";
import { performanceMetrics } from "../performance-rules";

test("Leistungsexport behält alle Felder und historische Kennzahlen als Zahlen", async () => {
  const entry = { quantity: 350, durationMinutes: 45, targetPerHour: 500 };
  const row: PerformanceReportRow = {
    id: "entry", employeeId: "employee", employeeName: "Test Mitarbeiter", personnelNumber: "TEST",
    workDate: "2026-10-10", shift: "Früh", area: "PICKING", areaLabel: "Kommissionieren",
    workstation: "K01", note: "Bemerkung", createdAt: "2026-10-10T08:00:00.000Z",
    ...entry, ...performanceMetrics(entry),
  };
  const withoutTarget = { ...row, id: "no-target", targetPerHour: null, achievement: null };
  const buffer = await createWorkbook({
    type: "performance", fileBase: "Leistungen",
    data: { from: row.workDate, to: row.workDate, rows: [row, withoutTarget] },
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(buffer).buffer);
  const sheet = workbook.getWorksheet("Leistungen")!;
  assert.equal(sheet.getCell("I4").value, "Soll Stück/Std.");
  assert.equal(sheet.getCell("J4").value, "Ist Stück/Std.");
  assert.equal(sheet.getCell("K4").value, "Leistungsgrad %");
  assert.equal(sheet.getCell("I5").value, 500);
  assert.equal(sheet.getCell("J5").value, 466.7);
  assert.equal(sheet.getCell("K5").value, 93.3);
  assert.equal(sheet.getCell("K5").numFmt, "0.0");
  assert.equal(sheet.getCell("G5").value, 350);
  assert.equal(sheet.getCell("H5").value, 45);
  assert.equal(sheet.getCell("L5").value, "Bemerkung");
  assert.equal(sheet.getCell("I6").value, "Nicht hinterlegt");
  assert.equal(sheet.getCell("J6").value, 466.7);
  assert.equal(sheet.getCell("K6").value, "Nicht hinterlegt");
});
