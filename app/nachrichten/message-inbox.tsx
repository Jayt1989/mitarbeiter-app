"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "@/app/components/access-link";
import type { MessageThreadDto } from "@/lib/messages";
import { apiJson } from "@/lib/api-client";
import { threadStatusLabels } from "@/lib/message-rules";
import MessageComposer from "./message-composer";

export const messageButton = "min-h-11 rounded-lg bg-[#174c37] px-4 py-2 text-sm font-semibold text-white hover:bg-[#103d2b] disabled:opacity-50";
export const messageSecondary = "min-h-11 rounded-lg border border-[#dce4dc] bg-white px-4 py-2 text-sm font-medium text-[#41634f] hover:bg-[#edf3ee] disabled:opacity-50";
export const messageInput = "mt-1 w-full rounded-lg border border-[#dce4dc] bg-white p-3 text-sm focus:border-[#71937d]";
export function messageTimestamp(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value));
}
export function refreshMessages() {
  window.dispatchEvent(new Event("messages:refresh"));
  window.dispatchEvent(new Event("notifications:refresh"));
}
type View = "inbox" | "sent" | "archive";
export default function MessageInbox({ initialThreads, canSend, canViewSent }: {
  initialThreads: MessageThreadDto[]; canSend: boolean; canViewSent: boolean;
}) {
  const [threads, setThreads] = useState(initialThreads);
  const [view, setView] = useState<View>("inbox");
  const [filter, setFilter] = useState("all");
  const [compose, setCompose] = useState(false);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try { setThreads(await apiJson<MessageThreadDto[]>("/api/messages")); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Nachrichten konnten nicht geladen werden."); }
  }, []);
  useEffect(() => {
    const refresh = () => { void reload(); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [reload]);
  const visible = threads.filter((thread) => {
    const archived = thread.archived || thread.status === "ARCHIVIERT";
    return (view === "archive" ? archived : !archived && thread.sent === (view === "sent")) &&
      (filter === "all" || filter === "unread" && !thread.read || filter === "read" && thread.read ||
        filter === "important" && thread.important);
  });
  const unread = threads.filter((thread) => !thread.read && !thread.archived && thread.status !== "ARCHIVIERT").length;
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-semibold tracking-[0.15em] text-[#668071]">DEINE KOMMUNIKATION</p>
        <h1 className="mt-2 text-2xl font-semibold sm:text-4xl">Nachrichten {unread > 0 && <span className="inline-block rounded-full bg-[#174c37] px-3 py-1 align-middle text-sm text-white">{unread} ungelesen</span>}</h1></div>
      {canSend && <button className={messageButton} onClick={() => setCompose(!compose)}>{compose ? "Schließen" : "Nachricht erstellen"}</button>}
    </div>
    {compose && <MessageComposer onSent={async () => { setCompose(false); setView("sent"); await reload(); refreshMessages(); }} />}
    <div className="mt-6 flex flex-wrap items-center gap-2">
      {([["inbox", "Posteingang"], ...(canViewSent ? [["sent", "Gesendet"]] : []), ["archive", "Archiv"]] as [View, string][]).map(([key, label]) =>
        <button key={key} className={messageSecondary} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}
      <label className="ml-auto text-sm">Ansicht
        <select className="ml-2 min-h-11 rounded-lg border border-[#dce4dc] bg-white px-3" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">Alle</option><option value="unread">Ungelesen</option><option value="read">Gelesen</option><option value="important">Wichtig</option>
        </select>
      </label>
      <button className={messageSecondary} onClick={() => void reload()}>Aktualisieren</button>
    </div>
    {error && <p role="alert" className="mt-4 rounded-lg bg-[#fde9e7] p-4 text-[#a33e31]">{error}</p>}
    <ul className="mt-4 space-y-3">
      {visible.map((thread) => <li key={thread.id}>
        <Link href={`/nachrichten/${thread.id}`} className={`block rounded-xl border p-4 transition hover:border-[#71937d] sm:p-5 ${thread.important ? "border-[#ecd49a] bg-[#fff8e8]" : thread.read ? "border-[#e0e7e0] bg-white" : "border-[#b9dcc2] bg-[#eef7f0]"}`}>
          <div className="flex flex-wrap justify-between gap-2">
            <h2 className="break-words font-semibold">{thread.subject}</h2>
            <span className="text-xs text-[#526056]">{threadStatusLabels[thread.status]}</span>
          </div>
          <p className="mt-2 text-sm text-[#526056]">{thread.sent ? `An: ${thread.recipientName}` : `Von: ${thread.creatorName}`}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#68766d]">
            <time dateTime={thread.updatedAt}>{messageTimestamp(thread.updatedAt)}</time>
            {!thread.read && <strong className="text-[#174c37]">Ungelesen</strong>}
            {thread.important && <strong className="text-[#886719]">Wichtig</strong>}
            {thread.replyRequired && <span>Antwort erforderlich</span>}
          </div>
        </Link>
      </li>)}
    </ul>
    {!visible.length && <p className="mt-4 rounded-xl border border-[#e0e7e0] bg-white p-5 text-sm text-[#68766d]">Keine Nachrichten in dieser Ansicht.</p>}
  </>;
}
