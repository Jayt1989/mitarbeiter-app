import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canRecordPerformance,
  canViewPerformance,
  formatDuration,
  parsePerformanceFilter,
  parsePerformanceInput,
  quantityPerHour,
  resolvePerformanceShift,
  summarizePerformance,
  type PlannedDay,
} from "./performance-rules";

const valid = { area: "PICKING", workstation: "K02", quantity: "350", hours: "2", minutes: "30", note: "  Ware nachgeliefert " };

test("gültige Eingaben werden übernommen", () => {
  assert.deepEqual(parsePerformanceInput(valid), {
    area: "PICKING", workstation: "K02", quantity: 350, durationMinutes: 150, note: "Ware nachgeliefert",
  });
  assert.equal(parsePerformanceInput({ ...valid, hours: "", minutes: "45", note: " " }).durationMinutes, 45);
  assert.equal(parsePerformanceInput({ ...valid, note: "" }).note, null);
});

test("Arbeitsplatz muss zum Bereich passen", () => {
  assert.throws(() => parsePerformanceInput({ ...valid, area: "" }), /Bereich/);
  assert.throws(() => parsePerformanceInput({ ...valid, area: "PACKING", workstation: "K01" }), /Arbeitsplatz für Verpackung/);
  assert.equal(parsePerformanceInput({ ...valid, area: "PACKING", workstation: "VP3" }).workstation, "VP3");
});

test("Menge und Arbeitszeit werden geprüft", () => {
  assert.throws(() => parsePerformanceInput({ ...valid, quantity: "" }), /Menge eingeben/);
  assert.throws(() => parsePerformanceInput({ ...valid, quantity: "12,5" }), /ganze Zahl/);
  assert.throws(() => parsePerformanceInput({ ...valid, quantity: "-3" }), /ganze Zahl/);
  assert.throws(() => parsePerformanceInput({ ...valid, quantity: "0" }), /größer als 0/);
  assert.throws(() => parsePerformanceInput({ ...valid, hours: "", minutes: "" }), /Arbeitszeit eingeben/);
  assert.throws(() => parsePerformanceInput({ ...valid, hours: "0", minutes: "0" }), /größer als 0/);
  assert.throws(() => parsePerformanceInput({ ...valid, minutes: "75" }), /zwischen 0 und 59/);
  assert.throws(() => parsePerformanceInput({ ...valid, hours: "16", minutes: "1" }), /16 Stunden/);
  assert.throws(() => parsePerformanceInput({ ...valid, note: "x".repeat(501) }), /500 Zeichen/);
});

const plan = (days: Record<string, Partial<PlannedDay>>) => (dateKey: string): PlannedDay => ({
  shift: null, vacation: false, absence: false, ...days[dateKey],
});

test("Schicht wird aus dem Plan ermittelt", () => {
  assert.deepEqual(resolvePerformanceShift("2026-10-09", 10, "2026-10-08", plan({ "2026-10-09": { shift: "Früh" } })),
    { ok: true, dateKey: "2026-10-09", shift: "Früh" });
  const free = resolvePerformanceShift("2026-10-09", 10, "2026-10-08", plan({ "2026-10-09": { shift: "Frei" } }));
  assert.equal(free.ok, false);
  const vacation = resolvePerformanceShift("2026-10-09", 10, "2026-10-08", plan({ "2026-10-09": { shift: "Spät", vacation: true } }));
  assert.match(vacation.ok ? "" : vacation.reason, /Urlaub/);
  const sick = resolvePerformanceShift("2026-10-09", 10, "2026-10-08", plan({ "2026-10-09": { shift: "Spät", absence: true } }));
  assert.match(sick.ok ? "" : sick.reason, /Abwesenheit/);
});

test("vor 6 Uhr zählt die Nachtschicht zum Vortag", () => {
  const days = plan({ "2026-10-08": { shift: "Nacht" }, "2026-10-09": { shift: "Frei" } });
  assert.deepEqual(resolvePerformanceShift("2026-10-09", 3, "2026-10-08", days),
    { ok: true, dateKey: "2026-10-08", shift: "Nacht" });
  assert.equal(resolvePerformanceShift("2026-10-09", 6, "2026-10-08", days).ok, false);
  const earlyAfterLate = plan({ "2026-10-08": { shift: "Spät" }, "2026-10-09": { shift: "Früh" } });
  assert.deepEqual(resolvePerformanceShift("2026-10-09", 5, "2026-10-08", earlyAfterLate),
    { ok: true, dateKey: "2026-10-09", shift: "Früh" });
});

test("Berechtigungen", () => {
  const base = { userId: "u", employeeId: "e", login: "MA-1", role: "EMPLOYEE", permissions: { recordPerformance: true } };
  assert.equal(canRecordPerformance(base), true);
  assert.equal(canRecordPerformance({ ...base, employeeId: null }), false);
  assert.equal(canRecordPerformance({ ...base, permissions: {} }), false);
  assert.equal(canViewPerformance({ ...base, permissions: { viewPerformance: true } }), false);
  assert.equal(canViewPerformance({ ...base, role: "FOREMAN", permissions: { viewPerformance: true } }), true);
  assert.equal(canViewPerformance({ ...base, role: "ADMIN", permissions: {} }), false);
});

test("Summen und Kennzahlen", () => {
  assert.equal(formatDuration(150), "2 Std. 30 Min.");
  assert.equal(formatDuration(45), "45 Min.");
  assert.equal(formatDuration(120), "2 Std.");
  assert.equal(quantityPerHour(350, 150), 140);
  assert.equal(quantityPerHour(100, 0), 0);
  const summary = summarizePerformance([
    { ws: "K01", quantity: 100, durationMinutes: 60 },
    { ws: "K02", quantity: 300, durationMinutes: 90 },
    { ws: "K01", quantity: 50, durationMinutes: 30 },
  ], (row) => ({ key: row.ws, label: row.ws }));
  assert.deepEqual(summary.map((row) => [row.key, row.entries, row.quantity, row.durationMinutes, row.perHour]),
    [["K02", 1, 300, 90, 200], ["K01", 2, 150, 90, 100]]);
});

test("Filter der Auswertung", () => {
  const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  assert.deepEqual(parsePerformanceFilter({}, "2026-10-09", isDate),
    { from: "2026-10-09", to: "2026-10-09", area: null, shift: null, limited: false });
  assert.deepEqual(parsePerformanceFilter({ von: "2026-10-09", bis: "2026-10-01", bereich: "PACKING", schicht: "Nacht" }, "2026-10-09", isDate),
    { from: "2026-10-01", to: "2026-10-09", area: "PACKING", shift: "Nacht", limited: false });
  const limited = parsePerformanceFilter({ von: "2025-01-01", bis: "2026-10-09", bereich: "x", schicht: "y" }, "2026-10-09", isDate);
  assert.equal(limited.limited, true);
  assert.equal(limited.from, "2026-07-09");
  assert.equal(limited.area, null);
  assert.equal(limited.shift, null);
});
