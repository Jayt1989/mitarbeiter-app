import { messageResponse } from "@/lib/message-http";
import { countUnreadMessageThreads } from "@/lib/messages";

export async function GET() {
  return messageResponse(async (context) => ({ unreadCount: await countUnreadMessageThreads(context) }));
}
