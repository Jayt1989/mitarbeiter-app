import { prisma } from "@/lib/prisma";
import { messageResponse, parseMessageBody } from "@/lib/message-http";
import { listMessageThreads, messageTransaction, sendMessage } from "@/lib/messages";
import { sendMessageSchema } from "@/lib/message-rules";

export async function GET() {
  return messageResponse((context) => listMessageThreads(prisma, context));
}
export async function POST(request: Request) {
  return messageResponse(async (context) => {
    const input = await parseMessageBody(request, sendMessageSchema);
    return messageTransaction((db) => sendMessage(db, context, input));
  }, 201);
}
