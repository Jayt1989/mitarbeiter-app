import { test } from "node:test";
import assert from "node:assert/strict";
import { employeeRepository } from "@/app/mitarbeiter/repository";
import { vacationRepository } from "@/app/urlaub/vacation-repository";
import { qualificationsRepository } from "@/app/admin/qualifications-repository";
import { areaRepository } from "@/app/admin/areas-repository";

test("API-Fehler liefern niemals Demo-, localStorage- oder vorgetäuschte Erfolgsdaten", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch");
  for (const status of [401, 403, 500]) {
    fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify({ error: `Denied ${status}` }), { status }));
    for (const load of [
      () => employeeRepository.loadAll(), () => vacationRepository.loadAll(),
      () => qualificationsRepository.loadAll(), () => areaRepository.load(),
      () => vacationRepository.create({ startDate: "2026-10-12", endDate: "2026-10-12", comment: "" }),
      () => qualificationsRepository.create("Test"), () => areaRepository.save({ areas: [], minimums: {} }),
    ]) await assert.rejects(load, new RegExp(`Denied ${status}`));
  }
});
