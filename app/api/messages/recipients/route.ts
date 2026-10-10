import { prisma } from "@/lib/prisma";
import { messageResponse, parseMessageBody } from "@/lib/message-http";
import { messageRecipientOptions, resolveMessageRecipients } from "@/lib/messages";
import { recipientSchema } from "@/lib/message-rules";

export async function GET() {
  return messageResponse((context) => messageRecipientOptions(prisma, context));
}
export async function POST(request: Request) {
  return messageResponse(async (context) => {
    const input = await parseMessageBody(request, recipientSchema);
    const recipients = await resolveMessageRecipients(prisma, context, input);
    return { count: recipients.length, recipientIds: recipients.map((entry) => entry.id) };
  });
}
