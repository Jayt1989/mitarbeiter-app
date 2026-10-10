"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "@/app/components/access-link";
import { apiJson } from "@/lib/api-client";
import type { MessageThreadDto } from "@/lib/messages";
import { threadStatusLabels, type MessageAction } from "@/lib/message-rules";
import { messageButton, messageInput, messageSecondary, messageTimestamp, refreshMessages } from "./message-inbox";

export default function MessageDetail({ initialThread }: { initialThread: MessageThreadDto }) {
  const [thread, setThread] = useState(initialThread);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const command = useRef<{ content: string; requestId: string } | null>(null);
  const reload = useCallback(async () => {
    const current = await apiJson<MessageThreadDto>(`/api/messages/${initialThread.id}`);
    await apiJson(`/api/messages/${initialThread.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", version: current.version }),
    });
    setThread({ ...current, read: true }); refreshMessages();
  }, [initialThread.id]);
  useEffect(() => {
    const refresh = () => { void reload().catch((cause) => {
      setError(cause instanceof Error ? cause.message : "Verlauf konnte nicht geladen werden.");
    }); };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [reload]);
  async function action(input: MessageAction) {
    setPending(true); setError("");
    try {
      await apiJson(`/api/messages/${thread.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Nachricht konnte nicht aktualisiert werden."); }
    finally { setPending(false); }
  }
  async function reply(event: FormEvent) {
    event.preventDefault(); setPending(true); setError("");
    if (command.current?.content !== content) command.current = { content, requestId: crypto.randomUUID() };
    try {
      await apiJson(`/api/messages/${thread.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, requestId: command.current.requestId }),
      });
      setContent(""); command.current = null; await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Antwort konnte nicht gespeichert werden."); }
    finally { setPending(false); }
  }
  return <>
    <Link href="/nachrichten" className="inline-flex min-h-11 items-center text-sm font-medium text-[#174c37] underline">Zurück zu Nachrichten</Link>
    <section className={`mt-3 rounded-xl border p-4 sm:p-6 ${thread.important ? "border-[#ecd49a] bg-[#fff8e8]" : "border-[#e0e7e0] bg-white"}`}>
      <div className="flex flex-wrap justify-between gap-3">
        <h1 className="break-words text-2xl font-semibold">{thread.subject}</h1>
        <span className="text-sm text-[#526056]">{threadStatusLabels[thread.status]}</span>
      </div>
      <p className="mt-2 text-sm text-[#68766d]">{thread.creatorName} · {messageTimestamp(thread.createdAt)}</p>
      <p className="mt-2 text-sm">{thread.important && <strong className="mr-4 text-[#886719]">Wichtig</strong>}{thread.replyRequired && "Antwort erforderlich"}</p>
      {thread.sent && <div className="mt-4 rounded-lg bg-[#f4f6f2] p-3">
        <h2 className="text-sm font-semibold">Empfängerstatus</h2>
        {thread.participants.map((entry) => <p key={entry.id} className="mt-1 text-sm text-[#526056]">{entry.name}: {entry.read ? `Gelesen${entry.readAt ? ` am ${messageTimestamp(entry.readAt)}` : ""}` : "Ungelesen"}</p>)}
      </div>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button className={messageSecondary} disabled={pending} onClick={() => void action({ action: thread.archived ? "unarchive" : "archive" })}>{thread.archived ? "Aus persönlichem Archiv holen" : "Für mich archivieren"}</button>
        {thread.canComplete && thread.status !== "ERLEDIGT" && thread.status !== "ARCHIVIERT" && <button className={messageSecondary} disabled={pending} onClick={() => void action({ action: "complete" })}>Als erledigt markieren</button>}
        {thread.canComplete && thread.status === "ERLEDIGT" && <button className={messageSecondary} disabled={pending} onClick={() => void action({ action: "archiveThread" })}>Erledigten Verlauf archivieren</button>}
        <button className={messageSecondary} disabled={pending} onClick={() => void reload().catch((cause) => setError(cause instanceof Error ? cause.message : "Ladefehler"))}>Aktualisieren</button>
      </div>
    </section>
    {error && <p role="alert" className="mt-4 rounded-lg bg-[#fde9e7] p-4 text-[#a33e31]">{error}</p>}
    <h2 className="mt-6 text-lg font-semibold">Privater Nachrichtenverlauf</h2>
    <ol className="mt-3 space-y-3">
      {thread.messages.map((message) => <li key={message.id} className={`rounded-xl border p-4 sm:p-5 ${message.own ? "border-[#b9dcc2] bg-[#eef7f0]" : "border-[#e0e7e0] bg-white"}`}>
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <strong>{message.senderName}{message.own ? " (Du)" : ""}</strong>
          <time dateTime={message.createdAt} className="text-xs text-[#68766d]">{messageTimestamp(message.createdAt)}</time>
        </div>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#34443a]">{message.content}</p>
      </li>)}
    </ol>
    {thread.canReply ? <form onSubmit={(event) => void reply(event)} className="mt-5 rounded-xl border border-[#e0e7e0] bg-white p-4 sm:p-5">
      <label className="block text-sm font-semibold">Deine Antwort<textarea required maxLength={10000} rows={4} className={messageInput} value={content} onChange={(event) => setContent(event.target.value)} disabled={pending} /></label>
      <button type="submit" className={`${messageButton} mt-3`} disabled={pending}>{pending ? "Wird gespeichert …" : "Antwort senden"}</button>
    </form> : <p className="mt-5 text-sm text-[#68766d]">Dieser Verlauf kann aktuell nicht beantwortet werden.</p>}
  </>;
}
