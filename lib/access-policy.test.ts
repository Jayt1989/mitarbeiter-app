import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccessPage, effectivePermissions, permitted } from "./access-policy";
import { permissionOptions } from "@/app/mitarbeiter/data";
import { defaultRolePermissions } from "@/prisma/permission-sync";

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
    "approveShiftSwap", "managePerformanceTargets", "manageTfDayEntitlements"]) {
    assert.equal(permitted(context, permission), false, permission);
  }
  assert.equal(canAccessPage({ role: "FOREMAN", permissions: { manageTfDayEntitlements: true } }, "/admin/urlaub"), true);
  assert.equal(canAccessPage({ role: "EMPLOYEE", permissions: { manageTfDayEntitlements: true } }, "/admin/urlaub"), false);
  for (const page of pages) assert.equal(canAccessPage(context, page), false, page);
  for (const page of ["/schichtplan", "/urlaub", "/leistung", "/schichttausch"]) {
    assert.equal(canAccessPage(context, page), true, page);
  }
});

test("Admin und Vorarbeiter benötigen die tatsächlichen Funktionsrechte", () => {
  assert.ok(permissionOptions.some(({ id, label }) =>
    id === "manageTfDayEntitlements" && label === "TF-Tage-Ansprüche verwalten",
  ));
  assert.equal(defaultRolePermissions.ADMIN.has("manageTfDayEntitlements"), true);
  assert.equal(defaultRolePermissions.FOREMAN.has("manageTfDayEntitlements"), false);
  for (const role of ["ADMIN", "FOREMAN"]) {
    for (const page of pages) assert.equal(canAccessPage({ role, permissions: {} }, page), false, `${role}: ${page}`);
    assert.equal(canAccessPage({ role, permissions: { managePerformanceTargets: false } }, "/admin/leistung/arbeitsplaetze"), false);
    assert.equal(canAccessPage({ role, permissions: { managePerformanceTargets: true } }, "/admin/leistung/arbeitsplaetze"), true);
  }
  assert.equal(permitted({ role: "FOREMAN", permissions: all }, "editEmployees"), false);
  assert.equal(permitted({ role: "UNKNOWN", permissions: all }, "ownShiftPlan"), false);
});
