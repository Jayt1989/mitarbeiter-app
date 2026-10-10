import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { canAccessPage, effectivePermissions, canViewStaffing } from "./access-policy";
import { homeDestinations } from "./home-access";
import { permissionOptions } from "@/app/mitarbeiter/data";
import AccessProvider, { accessFingerprint, type NavigationAccess } from "@/app/components/access-provider";
import AccessLink from "@/app/components/access-link";
import StaffingDashboard from "@/app/admin/staffing-dashboard";
import { NotificationsProvider } from "@/app/components/notifications-provider";
import { performanceHomeLink } from "./performance-rules";

const all = Object.fromEntries(permissionOptions.map(({ id }) => [id, true]));
const access = (role: string, permissions: Record<string, boolean>): NavigationAccess => ({
  userId: "u", employeeId: "e", role, permissions: effectivePermissions(role, permissions),
});
const routes = [
  "/admin", "/admin/mitarbeiter", "/mitarbeiter", "/admin/leistung",
  "/admin/leistung/arbeitsplaetze", "/admin/urlaub", "/admin/qualifikationen",
  "/admin/schichttausch", "/admin/zusatzschichten", "/admin/mindestbesetzung",
  "/admin/einsatzplanung", "/admin/einstellungen", "/admin/wochenplan",
  "/admin/jahreswechsel", "/admin/export", "/dashboard", "/nachrichten",
  "/schichtplan", "/urlaub", "/schichttausch", "/leistung",
];

function navigation(context: NavigationAccess) {
  return renderToStaticMarkup(<AccessProvider initialAccess={context}><nav>
    {routes.map((href) => <AccessLink href={href} key={href}>{href}</AccessLink>)}
  </nav></AccessProvider>);
}

test("Navigation, Kacheln und direkte URLs folgen für alle Rollen denselben Rechten", () => {
  for (const context of [
    access("EMPLOYEE", { ownShiftPlan: true }),
    access("FOREMAN", { teamShiftPlan: true, approveShiftSwap: true, viewQualifications: true }),
    access("ADMIN", { openAdmin: true, managePerformanceTargets: true }),
    access("ADMIN", all),
    access("ADMIN", {}),
  ]) {
    const html = navigation(context);
    for (const path of routes) {
      assert.equal(html.includes(`href="${path}"`), canAccessPage(context, path), `${context.role}: ${path}`);
    }
    for (const destination of Object.values(homeDestinations(context))) {
      if (destination) assert.equal(canAccessPage(context, destination), true, destination);
    }
    const performance = performanceHomeLink({ ...context, login: "test" });
    if (performance) assert.equal(canAccessPage(context, performance.href), true);
  }
});

test("Mitarbeiter mit wenigen Rechten sehen weder Verwaltung noch Mein-Bereich-Seiten ohne eigene Rechte", () => {
  const context = access("EMPLOYEE", { recordPerformance: true });
  const destinations = homeDestinations(context);
  for (const key of ["admin", "employees", "qualifications", "shiftPlan", "vacation", "shiftSwap", "additionalShifts", "messages"] as const) {
    assert.equal(destinations[key], null, key);
  }
  assert.equal(canAccessPage(access("EMPLOYEE", {}), "/dashboard"), false);
  assert.equal(canAccessPage({ ...context, employeeId: null }, "/dashboard"), false);
});

test("Rechteentzug und Rollenwechsel entfernen Links ohne neuen Login", () => {
  const full = access("ADMIN", all);
  const revoked = access("ADMIN", { ...all, viewPerformance: false, managePerformanceTargets: false, recordPerformance: false });
  assert.ok(navigation(full).includes('href="/admin/leistung"'));
  assert.ok(!navigation(revoked).includes('href="/admin/leistung"'));
  assert.equal(performanceHomeLink({ ...revoked, login: "test" }), null);
  assert.notEqual(accessFingerprint(full), accessFingerprint(revoked));
  assert.equal(accessFingerprint(full), accessFingerprint({ ...full, permissions: Object.fromEntries(Object.entries(full.permissions).reverse()) }));
  const employee = access("EMPLOYEE", all);
  assert.ok(!navigation(employee).includes('href="/admin"'));
});

test("Direkte URL-Manipulation inklusive Query, Unterseiten und Slash umgeht keine Prüfung", () => {
  const context = access("ADMIN", { openAdmin: true });
  for (const path of ["/admin/mitarbeiter", "/admin/mitarbeiter/?id=fremd", "/admin/leistung?employeeId=fremd",
    "/admin/leistung/arbeitsplaetze/", "/admin/urlaub#fremd", "/admin/einsatzplanung/unterseite"]) {
    assert.equal(canAccessPage(context, path), false, path);
  }
  assert.equal(canAccessPage(context, "/admin"), true);
  assert.equal(canViewStaffing(context), false);
});

test("Planungs- und Freigaberechte für Zusatzschichten öffnen die Fachansicht ohne zusätzliche Rollenfreigabe", () => {
  for (const permission of ["planAdditionalShifts", "releaseAdditionalShifts", "cancelAdditionalShifts"]) {
    const context = access("FOREMAN", { [permission]: true });
    assert.equal(homeDestinations(context).additionalShifts, "/admin/zusatzschichten");
    assert.equal(canAccessPage(context, "/admin/zusatzschichten"), true);
    assert.ok(navigation(context).includes('href="/admin/zusatzschichten"'));
  }
});

test("Admin mit openAdmin allein sieht keine Personalbesetzung oder ungeprüften Verwaltungskacheln", () => {
  const context = access("ADMIN", { openAdmin: true, editCalendar: true });
  const html = renderToStaticMarkup(<AccessProvider initialAccess={context}><NotificationsProvider>
    <StaffingDashboard access={context} performanceLink={null} initialDate="2026-10-10" />
  </NotificationsProvider></AccessProvider>);
  assert.match(html, /Administration/);
  assert.ok(html.includes('href="/admin/einstellungen"'));
  for (const path of ["/admin/einsatzplanung", "/admin/jahreswechsel", "/admin/export", "/mitarbeiter"]) {
    assert.ok(!html.includes(`href="${path}"`), path);
  }
  assert.doesNotMatch(html, /Datum auswählen|Ansicht auswählen/);
  const link = renderToStaticMarkup(<AccessProvider initialAccess={context}>
    <AccessLink staffing href="/admin">Personalbesetzung</AccessLink>
  </AccessProvider>);
  assert.equal(link, "");
});
