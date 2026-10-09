import assert from "node:assert/strict";
import { test } from "node:test";
import { authConfig } from "../auth.config";

type Authorized = NonNullable<NonNullable<typeof authConfig.callbacks>["authorized"]>;
const authorized = authConfig.callbacks!.authorized as Authorized;

function request(path: string) {
  const url = new URL(path, "https://intern.example");
  return Object.assign(new Request(url, { headers: { "x-forwarded-host": "app.example", "x-forwarded-proto": "https" } }), {
    nextUrl: url,
  }) as unknown as Parameters<Authorized>[0]["request"];
}

function user(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: "u1", role: "EMPLOYEE", employeeId: "e1", mustChangePassword: false,
      permissions: { viewShiftPlan: true, requestShiftSwap: true }, ...overrides,
    },
    expires: "2999-01-01T00:00:00.000Z",
  } as unknown as Parameters<Authorized>[0]["auth"];
}

async function check(path: string, auth: Parameters<Authorized>[0]["auth"]) {
  return authorized({ auth, request: request(path) });
}

test("anonymous visitors are sent to login for protected pages only", async () => {
  const result = await check("/profil", null);
  assert.ok(result instanceof Response);
  assert.equal(result.status, 302);
  assert.match(result.headers.get("location") ?? "", /^https:\/\/app\.example\/login\?callbackUrl=/);
  assert.equal(await check("/login", null), true);
  assert.equal(await check("/", null), true);
  assert.equal(await check("/api/employees", null), true, "APIs answer 401 themselves");
});

test("users with a start password can only reach the password page", async () => {
  const pending = user({ mustChangePassword: true });
  assert.equal(await check("/passwort-aendern", pending), true);
  assert.equal(await check("/api/auth/session", pending), true);
  for (const path of ["/dashboard", "/schichtplan", "/admin", "/profil", "/benachrichtigungen", "/"]) {
    const result = await check(path, pending);
    assert.ok(result instanceof Response, path);
    assert.equal(result.status, 302);
    assert.equal(result.headers.get("location"), "https://app.example/passwort-aendern");
  }
  const api = await check("/api/employees", pending);
  assert.ok(api instanceof Response);
  assert.equal(api.status, 403);
});

test("regular sessions keep the existing route rules", async () => {
  assert.equal(await check("/dashboard", user()), true);
  assert.equal(await check("/profil", user()), true);
  assert.equal(await check("/admin", user()), false);
  assert.equal(await check("/admin", user({ role: "ADMIN", permissions: { openAdmin: true } })), true);
});
