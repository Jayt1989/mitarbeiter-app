import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assignmentNotification, notificationDate, qualificationNotification,
  shiftNotification, vacationNotification,
} from "./notification-messages";

const period = {
  employeeId: "employee-1",
  startDate: new Date("2026-10-12T00:00:00.000Z"),
  endDate: new Date("2026-10-16T00:00:00.000Z"),
};

test("vacation approval matches the required message and recipient", () => {
  assert.deepEqual(vacationNotification(period, "APPROVED"), {
    employeeId: "employee-1", title: "Urlaub genehmigt",
    message: "Dein Urlaubsantrag vom 12.10.2026 bis 16.10.2026 wurde genehmigt.",
    type: "VACATION_APPROVED", link: "/urlaub",
  });
});

test("vacation rejection matches the required message", () => {
  const notification = vacationNotification(period, "REJECTED");
  assert.equal(notification.message, "Dein Urlaubsantrag vom 12.10.2026 bis 16.10.2026 wurde abgelehnt.");
  assert.equal(notification.type, "VACATION_REJECTED");
});

test("shift change includes date, old and new shift", () => {
  const notification = shiftNotification(period.employeeId, new Date("2026-10-20"), "Früh", "Spät");
  assert.equal(notification.message, "Deine Schicht am 20.10.2026 wurde von Früh auf Spät geändert.");
  assert.equal(notification.type, "SHIFT_CHANGED");
});

test("new shift without a previous plan and time off are supported", () => {
  assert.match(shiftNotification(period.employeeId, period.startDate, null, "Früh").message, /eingetragen/);
  assert.match(shiftNotification(period.employeeId, period.startDate, "Nacht", "Frei").message, /von Nacht auf Frei/);
});

test("single-day temporary assignment matches the required message", () => {
  const notification = assignmentNotification({
    employeeId: period.employeeId,
    startDate: new Date("2026-10-21"), endDate: new Date("2026-10-21"),
    department: { name: "Autosort" }, shift: null,
  }, "created");
  assert.equal(notification.message, "Du bist am 21.10.2026 im Bereich Autosort eingeplant.");
  assert.equal(notification.type, "ASSIGNMENT_CREATED");
});

test("changed temporary assignments include old and new periods, areas and shifts", () => {
  const before = { ...period, department: { name: "Lager" }, shift: "Früh" };
  const after = {
    ...period, startDate: new Date("2026-10-20"), endDate: new Date("2026-10-21"),
    department: { name: "Autosort" }, shift: "Spät",
  };
  const notification = assignmentNotification(after, "updated", before);
  assert.match(notification.message, /12\.10\.2026 bis 16\.10\.2026 im Bereich Lager \(Schicht Früh\)/);
  assert.match(notification.message, /20\.10\.2026 bis 21\.10\.2026 im Bereich Autosort \(Schicht Spät\)/);
  assert.equal(notification.type, "ASSIGNMENT_UPDATED");
});

test("cancelled temporary assignment identifies the cancelled period and area", () => {
  const notification = assignmentNotification({
    ...period, department: { name: "Autosort" }, shift: null,
  }, "cancelled");
  assert.match(notification.message, /12\.10\.2026 bis 16\.10\.2026 im Bereich Autosort wurde aufgehoben/);
  assert.equal(notification.type, "ASSIGNMENT_CANCELLED");
});

test("qualification message contains the qualification name and recipient", () => {
  const notification = qualificationNotification(period.employeeId, "Staplerschein");
  assert.equal(notification.message, "Für dich wurde die Schulung / Qualifikation Staplerschein eingetragen.");
  assert.equal(notification.employeeId, period.employeeId);
  assert.equal(notification.type, "QUALIFICATION_ADDED");
});

test("date formatting is stable at year boundaries", () => {
  assert.equal(notificationDate(new Date("2026-12-31T00:00:00Z")), "31.12.2026");
  assert.equal(notificationDate(new Date("2027-01-01T00:00:00Z")), "01.01.2027");
});
