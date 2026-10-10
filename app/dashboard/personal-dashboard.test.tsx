import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { sampleEmployees } from "@/app/mitarbeiter/data";
import { NotificationsProvider } from "@/app/components/notifications-provider";
import type { PersonalDashboardData } from "@/lib/personal-dashboard";
import { performanceVisibility } from "@/lib/performance-rules";
import { canUseMessages } from "@/lib/message-rules";
import PersonalDashboard from "./personal-dashboard";
import AccessProvider from "@/app/components/access-provider";
import { effectivePermissions } from "@/lib/access-policy";

function dashboard(role: string, permissions: Record<string, boolean>) {
  const access = {
    userId: "u", employeeId: "e", role,
    permissions: effectivePermissions(role, { ownShiftPlan: true, requestVacation: true, ...permissions }),
  };
  const data: PersonalDashboardData = {
    greeting: "Guten Tag", todayKey: "2026-10-10", employee: sampleEmployees[2],
    areaName: null, shiftModelLabel: "Nur Früh", today: null, nextShift: null, week: [],
    vacation: null, absences: [], upcomingAssignment: null, qualifications: null,
    permissions: {
      shiftPlan: false, yearPlan: true, ownVacation: false, requestVacation: true,
      qualifications: false, shiftSwap: false,
      messages: canUseMessages({ userId: "u", employeeId: "e", login: "TEST", role, permissions }),
      ...performanceVisibility({ userId: "u", employeeId: "e", login: "TEST", role, permissions }),
    },
  };
  return renderToStaticMarkup(<AccessProvider initialAccess={access}><NotificationsProvider><PersonalDashboard data={data} /></NotificationsProvider></AccessProvider>);
}

test("Mitarbeiter-Kachel Leistung verlinkt direkt zur Erfassung und nutzt den bestehenden responsiven Kachelstil", () => {
  const html = dashboard("EMPLOYEE", { recordPerformance: true, viewPerformance: true, managePerformanceTargets: true });
  const tiles = html.slice(html.indexOf('<h2 id="schnellzugriffe-titel"'));
  assert.match(tiles, /href="\/leistung"[^>]*><p[^>]*>Leistung<\/p>/);
  assert.doesNotMatch(html, /\/admin\/leistung|Soll|Leistungsgrad|Leistungsauswertung/);
  const tileClass = (href: string) => tiles.match(new RegExp(`<a(?=[^>]*href="${href}")[^>]*class="([^"]+)"`))?.[1];
  assert.ok(tileClass("/leistung"));
  assert.equal(tileClass("/leistung"), tileClass("/schichtplan"));
  assert.equal(tileClass("/leistung"), tileClass("/urlaub\\?antrag=neu"));
  assert.match(tiles, /grid grid-cols-2 gap-3 sm:grid-cols-4/);
});

test("Admin-Kachel Leistung führt zur Auswertung; Vorarbeiter sehen nur freigegebene Leistungslinks", () => {
  const admin = dashboard("ADMIN", { recordPerformance: true, viewPerformance: true, managePerformanceTargets: true });
  assert.match(admin, /href="\/admin\/leistung"[^>]*><p[^>]*>Leistung<\/p>/);
  assert.ok(admin.includes("/admin/leistung/arbeitsplaetze"));
  const recordingOnly = dashboard("FOREMAN", { recordPerformance: true });
  assert.match(recordingOnly, /href="\/leistung"[^>]*><p[^>]*>Leistung<\/p>/);
  assert.doesNotMatch(recordingOnly, /\/admin\/leistung/);
  const noPerformance = dashboard("FOREMAN", {});
  assert.doesNotMatch(noPerformance, /href="\/(?:admin\/)?leistung/);
});

test("Nachrichten-Kachel übernimmt Schichtplan-/Urlaub-Stil und bleibt ohne Nachrichtenrechte verborgen", () => {
  const html = dashboard("EMPLOYEE", { receiveMessages: true, replyMessages: true });
  const tiles = html.slice(html.indexOf('<h2 id="schnellzugriffe-titel"'));
  assert.match(tiles, /href="\/nachrichten"[^>]*><p[^>]*>Nachrichten<\/p>/);
  const tileClass = (href: string) => tiles.match(new RegExp(`<a(?=[^>]*href="${href}")[^>]*class="([^"]+)"`))?.[1];
  assert.equal(tileClass("/nachrichten"), tileClass("/schichtplan"));
  assert.equal(tileClass("/nachrichten"), tileClass("/urlaub\\?antrag=neu"));
  assert.doesNotMatch(dashboard("EMPLOYEE", {}), /href="\/nachrichten"/);
});
