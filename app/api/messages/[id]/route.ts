import { prisma } from "@/lib/prisma";
import { messageResponse, parseMessageBody } from "@/lib/message-http";
import { getMessageThread, messageTransaction, replyToMessage, updateMessageThread } from "@/lib/messages";
import { messageActionSchema, replyMessageSchema } from "@/lib/message-rules";

type RouteContext = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: RouteContext) {
  return messageResponse(async (context) => getMessageThread(prisma, context, (await params).id));
}
export async function POST(request: Request, { params }: RouteContext) {
  return messageResponse(async (context) => {
    const input = await parseMessageBody(request, replyMessageSchema);
    const { id } = await params;
    return messageTransaction((db) => replyToMessage(db, context, id, input));
  }, 201);
}
export async function PATCH(request: Request, { params }: RouteContext) {
  return messageResponse(async (context) => {
    const input = await parseMessageBody(request, messageActionSchema);
    const { id } = await params;
    await messageTransaction((db) => updateMessageThread(db, context, id, input));
    return { updated: true };
  });
}
