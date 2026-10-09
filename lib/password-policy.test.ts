import assert from "node:assert/strict";
import { test } from "node:test";
import { generateStartPassword, passwordPolicyErrors, validateNewPassword } from "./password-policy";

test("accepts passwords matching the rules, special characters optional", () => {
  assert.deepEqual(passwordPolicyErrors("Sommer2026"), []);
  assert.deepEqual(passwordPolicyErrors("Grün-Tee#7x"), []);
});

test("rejects passwords that break a rule with German messages", () => {
  assert.match(passwordPolicyErrors("Ab1")[0], /mindestens 8 Zeichen/);
  assert.ok(passwordPolicyErrors("sommer2026").some((error) => error.includes("Großbuchstaben")));
  assert.ok(passwordPolicyErrors("SOMMER2026").some((error) => error.includes("Kleinbuchstaben")));
  assert.ok(passwordPolicyErrors("Sommerzeit").some((error) => error.includes("Zahl")));
  assert.ok(passwordPolicyErrors(" Sommer2026").some((error) => error.includes("Leerzeichen")));
  assert.ok(passwordPolicyErrors(`A1${"a".repeat(71)}`).some((error) => error.includes("zu lang")));
});

test("requires matching confirmation", () => {
  assert.deepEqual(validateNewPassword("Sommer2026", "Sommer2026"), []);
  assert.deepEqual(validateNewPassword("Sommer2026", "Sommer2027"), ["Die beiden Passwörter stimmen nicht überein."]);
});

test("generated start passwords always satisfy the policy and differ", () => {
  const generated = new Set<string>();
  for (let index = 0; index < 200; index += 1) {
    const password = generateStartPassword();
    assert.equal(password.length, 12);
    assert.deepEqual(passwordPolicyErrors(password), []);
    generated.add(password);
  }
  assert.equal(generated.size, 200);
});
