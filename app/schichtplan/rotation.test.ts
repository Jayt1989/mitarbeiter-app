import assert from "node:assert/strict";
import { test } from "node:test";
import { getShiftForDate, type EmployeeShiftPlan } from "./rotation";
import { toEmployeeShiftPlan } from "../mitarbeiter/schedule";
import { sampleEmployees } from "../mitarbeiter/data";

const rotation: EmployeeShiftPlan = {
  employeeId: "employee-1", model: "3-schicht", startShift: "Früh", anchorMonday: "2025-12-29",
};

test("existing three-shift weekly rotation and free Saturdays remain unchanged", () => {
  assert.equal(getShiftForDate(new Date("2025-12-29"), rotation), "Früh");
  assert.equal(getShiftForDate(new Date("2026-01-05"), rotation), "Nacht");
  assert.equal(getShiftForDate(new Date("2026-01-12"), rotation), "Spät");
  assert.equal(getShiftForDate(new Date("2026-01-03"), rotation), "Frei");
});

test("manual overrides apply to rotation, including free days and weekends", () => {
  const plan = { ...rotation, overrides: { "2026-01-05": "Spät", "2026-01-06": "Frei", "2026-01-03": "Früh" } } as const;
  assert.equal(getShiftForDate(new Date("2026-01-05"), plan), "Spät");
  assert.equal(getShiftForDate(new Date("2026-01-06"), plan), "Frei");
  assert.equal(getShiftForDate(new Date("2026-01-03"), plan), "Früh");
  assert.equal(getShiftForDate(new Date("2026-01-07"), plan), "Nacht");
});

test("overrides apply to fixed and two-shift models", () => {
  const overrides = { "2026-01-05": "Nacht" } as const;
  assert.equal(getShiftForDate(new Date("2026-01-05"), { employeeId: "employee-1", model: "nur-frueh", overrides }), "Nacht");
  assert.equal(getShiftForDate(new Date("2026-01-05"), {
    employeeId: "employee-1", model: "2-schicht", startShift: "Früh", anchorMonday: "2025-12-29", overrides,
  }), "Nacht");
});

test("individual schedules retain explicit time off and unplanned dates", () => {
  const plan: EmployeeShiftPlan = {
    employeeId: "employee-1", model: "individuell", assignments: { "2026-01-05": "Frei" },
  };
  assert.equal(getShiftForDate(new Date("2026-01-05"), plan), "Frei");
  assert.equal(getShiftForDate(new Date("2026-01-06"), plan), null);
});

test("employee schedule mapping wires manual assignments into every model", () => {
  for (const model of ["3-schicht", "2-schicht", "nur-frueh", "nur-spaet", "individuell"] as const) {
    const plan = toEmployeeShiftPlan({
      ...sampleEmployees[0], shiftModel: model, individualAssignments: { "2026-10-20": "Spät" },
    });
    assert.equal(getShiftForDate(new Date("2026-10-20"), plan), "Spät");
  }
});
