import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthorizationContext } from "./authorization";
import {
  canRequestShiftSwaps, canReviewShiftSwaps, ShiftSwapError,
  swapDayWarnings, swapTransition, type SwapDayFacts, type SwapAction,
} from "./shift-swap-rules";

const requester: AuthorizationContext = {
  userId: "user-a", employeeId: "a", login: "a", role: "EMPLOYEE",
  permissions: { requestShiftSwap: true },
};
const partner = { ...requester, employeeId: "b" };
const admin = { ...requester, role: "ADMIN", permissions: { approveShiftSwap: true } };
const requested = { requesterId: "a", partnerId: "b", status: "ANGEFRAGT" } as const;

test("request rights require an employee association and explicit permission", () => {
  assert.equal(canRequestShiftSwaps(requester), true);
  assert.equal(canRequestShiftSwaps({ ...requester, employeeId: null }), false);
  assert.equal(canRequestShiftSwaps({ ...requester, permissions: {} }), false);
});

test("approval requires BOTH admin/foreman role AND explicit permission", () => {
  assert.equal(canReviewShiftSwaps(admin), true);
  assert.equal(canReviewShiftSwaps({ ...admin, role: "FOREMAN" }), true);
  assert.equal(canReviewShiftSwaps({ ...admin, role: "EMPLOYEE" }), false);
  assert.equal(canReviewShiftSwaps({ ...admin, permissions: { approveShiftSwap: false } }), false);
});

test("only the actual partner may confirm or decline", () => {
  assert.equal(swapTransition(partner, requested, "confirm"), "PARTNER_BESTAETIGT");
  assert.equal(swapTransition(partner, requested, "decline"), "PARTNER_ABGELEHNT");
  for (const context of [requester, admin, { ...partner, permissions: {} }]) {
    assert.throws(() => swapTransition(context, requested, "confirm"), (error: unknown) =>
      error instanceof ShiftSwapError && error.status === 403);
  }
});

test("admin cannot approve or reject before partner consent", () => {
  for (const action of ["approve", "reject"] as const) {
    assert.throws(() => swapTransition(admin, requested, action), /Zuerst muss/);
  }
});

test("confirmed requests may only be approved or rejected by reviewers", () => {
  const confirmed = { ...requested, status: "PARTNER_BESTAETIGT" } as const;
  assert.equal(swapTransition(admin, confirmed, "approve"), "GENEHMIGT");
  assert.equal(swapTransition({ ...admin, role: "FOREMAN" }, confirmed, "reject"), "ABGELEHNT");
  assert.throws(() => swapTransition(requester, confirmed, "approve"), /Keine Berechtigung/);
  assert.throws(() => swapTransition(partner, confirmed, "confirm"), /bereits beantwortet/);
});

test("only the requester may cancel either open state", () => {
  for (const status of ["ANGEFRAGT", "PARTNER_BESTAETIGT"] as const) {
    assert.equal(swapTransition(requester, { ...requested, status }, "cancel"), "STORNIERT");
    assert.throws(() => swapTransition(partner, { ...requested, status }, "cancel"), /Nur der Antragsteller/);
  }
});

test("terminal states cannot be approved, cancelled or confirmed again", () => {
  for (const status of ["GENEHMIGT", "ABGELEHNT", "PARTNER_ABGELEHNT", "STORNIERT"] as const) {
    for (const [actor, action] of [[requester, "cancel"], [partner, "confirm"], [admin, "approve"]] as const) {
      assert.throws(() => swapTransition(actor, { ...requested, status }, action as SwapAction));
    }
  }
});

const facts: SwapDayFacts = {
  name: "Mitarbeiter A", active: true, shift: "Früh", vacation: false, absence: false,
  manual: false, assignment: false, openSwap: false,
};
test("valid working shifts have no conflicts", () => {
  assert.deepEqual(swapDayWarnings(facts), []);
});
for (const [key, pattern] of [
  ["vacation", /Urlaubsantrag/], ["absence", /Abwesenheit/], ["manual", /manuelle/],
  ["assignment", /temporärer/], ["openSwap", /offene Tauschanfrage/],
] as const) {
  test(`${key} blocks a swap with a readable warning`, () => {
    assert.match(swapDayWarnings({ ...facts, [key]: true })[0], pattern);
  });
}
test("inactive employees, free days and missing schedules are blocked", () => {
  assert.match(swapDayWarnings({ ...facts, active: false })[0], /inaktiv/);
  assert.match(swapDayWarnings({ ...facts, shift: "Frei" })[0], /Keine Arbeitsschicht/);
  assert.match(swapDayWarnings({ ...facts, shift: null })[0], /Keine Arbeitsschicht/);
});
