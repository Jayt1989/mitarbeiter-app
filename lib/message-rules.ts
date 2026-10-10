import { z } from "zod";
import { permitted } from "./access-policy";
import type { AuthorizationContext } from "./authorization";

export const recipientPermissions = {
  SINGLE: "sendMessageSingle",
  MULTIPLE: "sendMessageMultiple",
  DEPARTMENT: "sendMessageDepartment",
  SHIFT_GROUP: "sendMessageShift",
  ALL: "sendMessageAll",
} as const;
export const recipientLabels = {
  SINGLE: "Einzelner Mitarbeiter", MULTIPLE: "Mehrere Mitarbeiter",
  DEPARTMENT: "Bereich", SHIFT_GROUP: "Schichtgruppe", ALL: "Alle aktiven Mitarbeiter",
} as const;
export const threadStatusLabels = {
  OFFEN: "Offen", WARTET_AUF_ANTWORT: "Wartet auf Antwort",
  BEANTWORTET: "Beantwortet", ERLEDIGT: "Erledigt", ARCHIVIERT: "Archiviert",
} as const;
const id = z.string().min(1).max(100);
export const recipientSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SINGLE"), employeeIds: z.array(id).length(1) }).strict(),
  z.object({ type: z.literal("MULTIPLE"), employeeIds: z.array(id).min(2).max(1000)
    .refine((ids) => new Set(ids).size === ids.length, "Mitarbeiter dürfen nur einmal ausgewählt werden.") }).strict(),
  z.object({ type: z.literal("DEPARTMENT"), departmentId: id }).strict(),
  z.object({ type: z.literal("SHIFT_GROUP"), shiftGroupId: id }).strict(),
  z.object({ type: z.literal("ALL") }).strict(),
]);
export type RecipientSelection = z.infer<typeof recipientSchema>;
export const sendMessageSchema = z.object({
  requestId: z.uuid(),
  recipients: recipientSchema,
  expectedRecipientIds: z.array(id).min(1).max(10000),
  subject: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(10000),
  important: z.boolean(),
  replyRequired: z.boolean(),
}).strict();
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export const replyMessageSchema = z.object({
  requestId: z.uuid(), content: z.string().trim().min(1).max(10000),
}).strict();
export const messageActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), version: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("complete") }).strict(),
  z.object({ action: z.literal("archive") }).strict(),
  z.object({ action: z.literal("unarchive") }).strict(),
  z.object({ action: z.literal("archiveThread") }).strict(),
]);
export type MessageAction = z.infer<typeof messageActionSchema>;
export class MessageError extends Error {
  constructor(message: string, public readonly status = 403) { super(message); }
}
export function canManageMessages(context: AuthorizationContext, permission: string) {
  return ["ADMIN", "FOREMAN"].includes(context.role) && permitted(context, permission);
}
export function canUseMessages(context: AuthorizationContext) {
  return permitted(context, "receiveMessages") || canManageMessages(context, "viewSentMessages");
}
export function canSendMessage(context: AuthorizationContext, type: RecipientSelection["type"]) {
  return canManageMessages(context, recipientPermissions[type]) &&
    canManageMessages(context, "viewSentMessages");
}
export function allowedRecipientTypes(context: AuthorizationContext) {
  return (Object.keys(recipientPermissions) as RecipientSelection["type"][])
    .filter((type) => canSendMessage(context, type));
}
