import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import PerformanceForm from "./performance-form";

test("Mitarbeiterformular enthält nur Eingabefelder und keine Sollwerte oder Auswertung", () => {
  const html = renderToStaticMarkup(<PerformanceForm />);
  for (const field of ["quantity", "hours", "minutes", "note"]) {
    assert.ok(html.includes(`name="${field}"`));
  }
  assert.ok(html.includes("Leistung speichern"));
  assert.doesNotMatch(html, /Soll|Leistungsgrad|Zielerreichung|Stück\/Std\.|%|In dieser Schicht erfasst/);
  assert.doesNotMatch(html, /name="(?:employeeId|workDate|targetPerHour|shift)"/);
});
