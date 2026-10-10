import assert from "node:assert/strict";
import { test } from "node:test";
import { permissionOptions } from "@/app/mitarbeiter/data";
import { canAccessPage } from "./access-policy";
import {
  allowedRecipientTypes, canSendMessage, canUseMessages, messageActionSchema,
  recipientSchema, sendMessageSchema,
} from "./message-rules";

const all = Object.fromEntries(permissionOptions.map(({ id }) => [id, true]));
const base = { userId: "u", employeeId: "e", login: "test", role: "EMPLOYEE", permissions: all };
test("employees can receive and reply but cannot acquire sender functions through forged rights", () => {
  assert.equal(canUseMessages(base), true);
  assert.equal(canAccessPage(base, "/nachrichten/foreign-id"), true);
  assert.deepEqual(allowedRecipientTypes(base), []);
  assert.equal(canSendMessage(base, "ALL"), false);
});
test("foremen require the specific send right and permission to see sent messages", () => {
  const foreman = { ...base, role: "FOREMAN", permissions: {} };
  assert.deepEqual(allowedRecipientTypes(foreman), []);
  assert.equal(canUseMessages(foreman), false);
  assert.equal(canSendMessage({ ...foreman, permissions: { sendMessageAll: true } }, "ALL"), false);
  const permitted = { ...foreman, permissions: { sendMessageSingle: true, viewSentMessages: true } };
  assert.deepEqual(allowedRecipientTypes(permitted), ["SINGLE"]);
  assert.equal(canSendMessage(permitted, "ALL"), false);
  assert.deepEqual(allowedRecipientTypes({ ...base, role: "ADMIN" }), ["SINGLE", "MULTIPLE", "DEPARTMENT", "SHIFT_GROUP", "ALL"]);
});
test("strict schemas reject recipient manipulation and invalid message shapes", () => {
  assert.equal(recipientSchema.safeParse({ type: "ALL", employeeIds: ["foreign"] }).success, false);
  assert.equal(recipientSchema.safeParse({ type: "SINGLE", employeeIds: ["a", "b"] }).success, false);
  assert.equal(recipientSchema.safeParse({ type: "MULTIPLE", employeeIds: ["a", "a"] }).success, false);
  assert.equal(sendMessageSchema.safeParse({ subject: "", content: "test" }).success, false);
  assert.equal(messageActionSchema.safeParse({ action: "read", version: 0 }).success, false);
  assert.equal(messageActionSchema.safeParse({ action: "delete" }).success, false);
});
