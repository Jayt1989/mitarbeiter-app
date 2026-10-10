import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/page-access";
import { getMessageThread } from "@/lib/messages";
import { MessageError } from "@/lib/message-rules";
import { prisma } from "@/lib/prisma";
import MessageShell from "../message-shell";
import MessageDetail from "../message-detail";

export const metadata: Metadata = { title: "Nachrichtenverlauf | TeamPlan" };
export default async function MessageThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePageAccess("/nachrichten");
  const { id } = await params;
  const thread = await getMessageThread(prisma, context, id).catch((error: unknown) => {
    if (error instanceof MessageError && error.status === 404) notFound();
    throw error;
  });
  return <MessageShell><MessageDetail initialThread={thread} /></MessageShell>;
}
