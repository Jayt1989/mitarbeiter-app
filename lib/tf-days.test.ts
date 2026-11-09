import assert from "node:assert/strict";
import { test } from "node:test";
import { sampleEmployees } from "@/app/mitarbeiter/data";
import { getDailyStaffing, getStaffingAbsences } from "@/app/admin/staffing";
import { canRequestTfDay, summarizeTfDayBalance, tfDayRequestError } from "@/app/admin/tf-day-data";
import { countScheduledWorkdaysInYear, getVacationWorkdays, type VacationRequest } from "@/app/urlaub/vacation-data";
import { defaultCalendarData } from "@/lib/calendar";
import { createDayResolver } from "@/lib/export/model";
import type { ExportSource } from "@/lib/export/source";

const tfRequest: VacationRequest = {
  id: "tf-request-1",
  employeeId: sampleEmployees[0].id,
  requestType: "TF_DAY",
  startDate: "2026-10-15",
  endDate: "2026-10-15",
  daysRequested: 1,
  requestedAt: "2026-10-01T08:00:00.000Z",
  status: "Genehmigt",
  comment: "",
};

test("TF-Tageskonto reserviert offene Anträge und berechnet den Rest getrennt", () => {
  assert.deepEqual(summarizeTfDayBalance(8, 3, 1), {
    approvedDays: 3,
    pendingDays: 1,
    remainingDays: 4,
  });
  assert.equal(summarizeTfDayBalance(0, 0, 0).remainingDays, 0);
});

test("TF-Anträge ohne Anspruch und oberhalb des reservierten Restes werden abgewiesen", () => {
  assert.match(tfDayRequestError(0, 0, 1, 2026) ?? "", /keine TF-Tage hinterlegt/);
  assert.equal(tfDayRequestError(8, 3, 1, 2026), null);
  assert.match(tfDayRequestError(8, 7, 2, 2026) ?? "", /nur noch 1 TF-Tag/);
});

test("TF-Antragsbutton braucht Antragsrecht und positiven Anspruch mit verfügbarem Rest", () => {
  assert.equal(canRequestTfDay({ requestVacation: true }, { entitlement: 8, remainingDays: 8 }), true);
  assert.equal(canRequestTfDay({ requestVacation: true }, undefined), false);
  assert.equal(canRequestTfDay({ requestVacation: true }, { entitlement: 0, remainingDays: 0 }), false);
  assert.equal(canRequestTfDay({ requestVacation: true }, { entitlement: 8, remainingDays: 0 }), false);
  assert.equal(canRequestTfDay({ requestVacation: false }, { entitlement: 8, remainingDays: 8 }), false);
});

test("TF-Arbeitstage werden jahresweise anhand derselben Schicht-/Feiertagslogik gezählt", () => {
  const employee = sampleEmployees[0];
  const start = "2026-10-01";
  const end = "2026-10-31";
  const expected = getVacationWorkdays(employee, start, end).length;
  assert.equal(countScheduledWorkdaysInYear(employee, start, end, 2026), expected);
  assert.equal(countScheduledWorkdaysInYear(employee, start, end, 2027), 0);
});

test("Genehmigte TF-Tage werden als eigene Abwesenheitsart an die Besetzung weitergegeben", () => {
  const absences = getStaffingAbsences([tfRequest]);
  assert.deepEqual(absences, [{
    employeeId: tfRequest.employeeId,
    startDate: tfRequest.startDate,
    endDate: tfRequest.endDate,
    type: "TF-Tag",
    approval: "Genehmigt",
  }]);
});

test("TF-Tage reduzieren die Verfügbarkeit, bleiben aber getrennt von der Schichtrotation", () => {
  const employee = sampleEmployees[0];
  const workday = getVacationWorkdays(employee, "2026-10-01", "2026-10-31")[0];
  assert.ok(workday);
  const request = { ...tfRequest, startDate: workday.date, endDate: workday.date };
  const staffing = getDailyStaffing(
    new Date(`${workday.date}T00:00:00.000Z`),
    [employee],
    getStaffingAbsences([request]),
  );
  const employeeDay = staffing.employees[0];
  assert.equal(employeeDay.shift, workday.shift);
  assert.equal(employeeDay.status, "TF-Tag");
  assert.equal(employeeDay.absenceType, "TF-Tag");
  assert.equal(staffing.absenceCounts["TF-Tag"], 1);
  assert.equal(staffing.plannedTotal, 1);
  assert.equal(staffing.availableTotal, 0);
});

test("Jahres- und Wochenexport geben genehmigte TF-Tage violett mit Kürzel TF aus", () => {
  const employee = sampleEmployees[0];
  const workday = getVacationWorkdays(employee, "2026-10-01", "2026-10-31")[0];
  assert.ok(workday);
  const source: ExportSource = {
    from: workday.date,
    to: workday.date,
    employees: [employee],
    areaConfiguration: { areas: [], minimums: {} },
    vacations: [{ ...tfRequest, startDate: workday.date, endDate: workday.date }],
    absences: [],
    assignments: [],
    calendar: defaultCalendarData,
    qualificationNames: new Map(),
  };
  const cell = createDayResolver(source).cell(employee, workday.date);
  assert.equal(cell.kind, "TF-Tag");
  assert.equal(cell.label, "TF");
  assert.equal(cell.shift, workday.shift);
});
