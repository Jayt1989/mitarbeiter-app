import { test } from "node:test";
import assert from "node:assert/strict";
import {
  achievementLevel,
  achievementPercent,
  canRecordPerformance,
  expectedQuantity,
  canViewPerformance,
  formatDuration,
  parsePerformanceFilter,
  parsePerformanceInput,
  quantityPerHour,
  resolvePerformanceShift,
  summarizePerformance,
  summarizeRows,
  canManagePerformanceTargets,
  parseWorkstationTarget,
  performanceMetrics,
  performanceVisibility,
  performanceDashboardLink,
  performanceHomeLink,
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
  assert.equal(canManagePerformanceTargets(base), false);
  assert.equal(canManagePerformanceTargets({ ...base, role: "ADMIN" }), false);
  assert.equal(canManagePerformanceTargets({ ...base, role: "ADMIN", permissions: { managePerformanceTargets: true } }), true);
  assert.equal(canManagePerformanceTargets({ ...base, role: "FOREMAN" }), false);
  assert.equal(canManagePerformanceTargets({ ...base, permissions: { managePerformanceTargets: true } }), false);
  assert.equal(canManagePerformanceTargets({ ...base, permissions: { managePerformanceTargets: false } }), false);
});

test("Leistungskachel und Sichtbarkeit richten sich nach Rolle und vorhandenen Rechten", () => {
  const base = { userId: "u", employeeId: "e", login: "MA-1", role: "EMPLOYEE", permissions: { recordPerformance: true } };
  const employee = performanceVisibility({
    ...base, permissions: { recordPerformance: true, viewPerformance: true, managePerformanceTargets: true },
  });
  assert.deepEqual(employee, { performance: true, performanceReport: false, performanceTargets: false });
  assert.equal(performanceDashboardLink(employee)?.href, "/leistung");
  assert.equal(performanceDashboardLink(employee)?.title, "Leistung");
  const admin = performanceVisibility({ ...base, role: "ADMIN", permissions: { viewPerformance: true } });
  assert.equal(performanceDashboardLink(admin)?.href, "/admin/leistung");
  assert.equal(admin.performanceTargets, false);
  const foreman = { ...base, role: "FOREMAN" };
  assert.equal(performanceDashboardLink(performanceVisibility(foreman))?.href, "/leistung");
  assert.equal(performanceDashboardLink(performanceVisibility({
    ...foreman, permissions: { viewPerformance: true },
  }))?.href, "/admin/leistung");
  assert.equal(performanceVisibility(foreman).performanceTargets, false);
  assert.equal(performanceDashboardLink(performanceVisibility({
    ...foreman, permissions: { managePerformanceTargets: true },
  }))?.href, "/admin/leistung/arbeitsplaetze");
  assert.equal(performanceDashboardLink(performanceVisibility({ ...foreman, permissions: {} })), null);
  assert.equal(performanceDashboardLink(performanceVisibility({ ...base, employeeId: null })), null);
});

test("Startseite zeigt Leistung auch für Admin ausschließlich mit tatsächlichen Rechten", () => {
  const base = { userId: "u", employeeId: "e", login: "MA-1", role: "EMPLOYEE", permissions: {} };
  assert.equal(performanceHomeLink(null), null);
  assert.equal(performanceHomeLink(base), null);
  assert.equal(performanceHomeLink({
    ...base, permissions: { recordPerformance: true },
  })?.href, "/leistung");
  assert.equal(performanceHomeLink({
    ...base, permissions: { viewPerformance: true, managePerformanceTargets: true },
  }), null);
  assert.equal(performanceHomeLink({ ...base, role: "ADMIN", employeeId: null }), null);
  assert.equal(performanceHomeLink({ ...base, role: "ADMIN" }), null);
  assert.equal(performanceHomeLink({ ...base, role: "ADMIN", permissions: { viewPerformance: true } })?.href, "/admin/leistung");
  assert.equal(performanceHomeLink({ ...base, role: "FOREMAN" }), null);
  assert.equal(performanceHomeLink({
    ...base, role: "FOREMAN", permissions: { viewPerformance: true },
  })?.href, "/admin/leistung");
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

test("Soll-Werte werden für die vorhandenen Arbeitsplätze validiert", () => {
  for (const code of ["K01", "K02", "K03", "VP1", "VP2", "VP3"]) {
    assert.equal(parseWorkstationTarget(code, " 500 "), 500);
  }
  assert.throws(() => parseWorkstationTarget("X9", "500"), /Unbekannter Arbeitsplatz/);
  for (const value of ["", "0", "-1", "NaN", "1.5", "500,5", "2147483648", "999999999999999999"]) {
    assert.throws(() => parseWorkstationTarget("K01", value));
  }
  assert.equal(parseWorkstationTarget("VP1", "1"), 1);
  assert.equal(parseWorkstationTarget("VP1", "2147483647"), 2147483647);
});

test("Ist und Leistungsgrad werden auf eine Nachkommastelle gerundet, ohne vorzeitige Rundung", () => {
  assert.deepEqual(performanceMetrics({ quantity: 350, durationMinutes: 45, targetPerHour: 500 }),
    { perHour: 466.7, achievement: 93.3 });
  assert.deepEqual(performanceMetrics({ quantity: 1, durationMinutes: 7, targetPerHour: 1 }),
    { perHour: 8.6, achievement: 857.1 });
});

test("Historische Snapshots und fehlende Sollwerte bleiben unabhängig von aktuellen Sollwerten", () => {
  const workstation = { targetPerHour: 500 };
  const oldEntry = { quantity: 450, durationMinutes: 60, targetPerHour: workstation.targetPerHour };
  const withoutTarget = { quantity: 450, durationMinutes: 60, targetPerHour: null };
  workstation.targetPerHour = 600;
  const newEntry = { ...oldEntry, targetPerHour: workstation.targetPerHour };
  assert.equal(performanceMetrics(oldEntry).achievement, 90);
  assert.equal(performanceMetrics(newEntry).achievement, 75);
  assert.deepEqual(performanceMetrics(withoutTarget), { perHour: 450, achievement: null });
});

test("Zielerreichung", () => {
  assert.equal(expectedQuantity(500, 90), 750);
  assert.equal(achievementPercent(750, 750), 100);
  assert.equal(achievementPercent(600, expectedQuantity(300, 150)), 80);
  assert.equal(achievementPercent(10, 0), null);
  assert.equal(achievementLevel(100), "reached");
  assert.equal(achievementLevel(99), "close");
  assert.equal(achievementLevel(85), "close");
  assert.equal(achievementLevel(84), "below");
});

test("Summe mit gemischten Arbeitsplätzen ist zeitgewichtet", () => {
  // K01: 1 Std. à 500 Soll, VP1: 2 Std. à 300 Soll -> Soll 1100 Stück in 3 Std.
  const total = summarizeRows([
    { quantity: 550, durationMinutes: 60, targetPerHour: 500 },
    { quantity: 550, durationMinutes: 120, targetPerHour: 300 },
  ]);
  assert.equal(total.expectedQuantity, 1100);
  assert.equal(total.achievement, 100);
  assert.equal(total.targetPerHour, 366.7);
  assert.equal(total.perHour, 366.7);
});

test("Einträge ohne Soll fließen nicht in die Zielerreichung ein", () => {
  const total = summarizeRows([
    { quantity: 250, durationMinutes: 60, targetPerHour: 500 },
    { quantity: 999, durationMinutes: 60, targetPerHour: null },
  ]);
  assert.equal(total.quantity, 1249);
  assert.equal(total.expectedQuantity, 500);
  assert.equal(total.achievement, 50);
  assert.equal(total.targetPerHour, 500);
  assert.equal(summarizeRows([]).achievement, null);
});
