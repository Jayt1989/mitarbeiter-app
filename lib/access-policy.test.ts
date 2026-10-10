import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccessPage, effectivePermissions, permitted } from "./access-policy";
import { permissionOptions } from "@/app/mitarbeiter/data";

const all = Object.fromEntries(permissionOptions.map(({ id }) => [id, true]));
const pages = [
  "/admin", "/admin/mitarbeiter", "/admin/urlaub", "/admin/leistung",
  "/admin/leistung/arbeitsplaetze", "/admin/qualifikationen", "/admin/schichttausch",
  "/admin/einsatzplanung", "/admin/wochenplan", "/admin/export",
  "/admin/mindestbesetzung", "/admin/einstellungen", "/admin/jahreswechsel", "/mitarbeiter",
  "/admin/zusatzschichten",
];

test("Mitarbeiter bleiben trotz falsch vergebener Teamrechte auf eigene Funktionen beschränkt", () => {
  const context = { role: "EMPLOYEE", permissions: all };
  const permissions = effectivePermissions(context.role, all);
  assert.equal(permissions.ownShiftPlan, true);
  assert.equal(permissions.recordPerformance, true);
  for (const permission of ["teamShiftPlan", "viewEmployees", "editEmployees", "otherVacations",
    "approveVacation", "editAssignments", "editQualifications", "exportReports", "viewReports",
    "approveShiftSwap", "managePerformanceTargets"]) {
    assert.equal(permitted(context, permission), false, permission);
  }
  for (const page of pages) assert.equal(canAccessPage(context, page), false, page);
  for (const page of ["/schichtplan", "/urlaub", "/leistung", "/schichttausch"]) {
    assert.equal(canAccessPage(context, page), true, page);
  }
});

test("Admin und Vorarbeiter benötigen die tatsächlichen Funktionsrechte", () => {
  for (const role of ["ADMIN", "FOREMAN"]) {
    for (const page of pages) assert.equal(canAccessPage({ role, permissions: {} }, page), false, `${role}: ${page}`);
    assert.equal(canAccessPage({ role, permissions: { managePerformanceTargets: false } }, "/admin/leistung/arbeitsplaetze"), false);
    assert.equal(canAccessPage({ role, permissions: { managePerformanceTargets: true } }, "/admin/leistung/arbeitsplaetze"), true);
  }
  assert.equal(permitted({ role: "FOREMAN", permissions: all }, "editEmployees"), false);
  assert.equal(permitted({ role: "UNKNOWN", permissions: all }, "ownShiftPlan"), false);
});
