import type { Metadata } from "next";
import { requirePageAccess } from "@/lib/page-access";
import { listMessageThreads } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { allowedRecipientTypes } from "@/lib/message-rules";
import MessageShell from "./message-shell";
import MessageInbox from "./message-inbox";

export const metadata: Metadata = { title: "Nachrichten | TeamPlan" };
export default async function MessagesPage() {
  const context = await requirePageAccess("/nachrichten");
  return <MessageShell><MessageInbox initialThreads={await listMessageThreads(prisma, context)}
    canSend={allowedRecipientTypes(context).length > 0}
    canViewSent={context.permissions.viewSentMessages === true && ["ADMIN", "FOREMAN"].includes(context.role)} /></MessageShell>;
}
