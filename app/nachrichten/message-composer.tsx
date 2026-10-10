"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiJson } from "@/lib/api-client";
import type { MessageRecipientOptions } from "@/lib/messages";
import { recipientLabels, type RecipientSelection } from "@/lib/message-rules";
import { messageButton, messageInput, messageSecondary } from "./message-inbox";

export default function MessageComposer({ onSent }: { onSent: () => Promise<void> }) {
  const [options, setOptions] = useState<MessageRecipientOptions | null>(null);
  const [optionsRetry, setOptionsRetry] = useState(0);
  const [type, setType] = useState<RecipientSelection["type"]>("SINGLE");
  const [ids, setIds] = useState<string[]>([]);
  const [targetId, setTargetId] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [important, setImportant] = useState(false);
  const [replyRequired, setReplyRequired] = useState(false);
  const [preview, setPreview] = useState<{ count: number; recipientIds: string[]; key: string } | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const command = useRef<{ payload: string; requestId: string } | null>(null);
  const recipients: RecipientSelection = type === "SINGLE" || type === "MULTIPLE" ? { type, employeeIds: ids }
    : type === "DEPARTMENT" ? { type, departmentId: targetId }
    : type === "SHIFT_GROUP" ? { type, shiftGroupId: targetId } : { type: "ALL" };
  const selectionKey = JSON.stringify(recipients);
  useEffect(() => {
    let current = true;
    void apiJson<MessageRecipientOptions>("/api/messages/recipients").then((data) => {
      if (current) { setOptions(data); setType(data.types[0]); }
    }).catch((cause) => {
      if (current) setError(cause instanceof Error ? cause.message : "Empfänger konnten nicht geladen werden.");
    });
    return () => { current = false; };
  }, [optionsRetry]);
  async function loadPreview() {
    setPending(true); setError(""); setConfirmAll(false);
    try {
      const result = await apiJson<{ count: number; recipientIds: string[] }>("/api/messages/recipients", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: selectionKey,
      });
      setPreview({ ...result, key: selectionKey });
    } catch (cause) {
      setPreview(null); setError(cause instanceof Error ? cause.message : "Empfänger konnten nicht ermittelt werden.");
    } finally { setPending(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!preview || preview.key !== selectionKey || type === "ALL" && !confirmAll) {
      setError("Bitte zuerst die aktuellen Empfänger ermitteln und den Versand bestätigen."); return;
    }
    setPending(true); setError("");
    const data = { recipients, expectedRecipientIds: preview.recipientIds, subject, content, important, replyRequired };
    const payload = JSON.stringify(data);
    if (command.current?.payload !== payload) command.current = { payload, requestId: crypto.randomUUID() };
    try {
      await apiJson("/api/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, requestId: command.current.requestId }),
      });
      await onSent();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Nachricht konnte nicht gesendet werden."); }
    finally { setPending(false); }
  }
  return <section className="mt-5 rounded-xl border border-[#e0e7e0] bg-white p-4 sm:p-6" aria-label="Nachricht erstellen">
    <h2 className="text-lg font-semibold">Neue Nachricht</h2>
    <p className="mt-1 text-sm text-[#68766d]">Jeder Mitarbeiter erhält einen privaten Verlauf. Antworten sind nur zwischen ihm und dir sichtbar.</p>
    {error && <p role="alert" className="mt-3 rounded-lg bg-[#fde9e7] p-3 text-sm text-[#a33e31]">{error}</p>}
    {!options ? error ? <button className={`${messageSecondary} mt-3`} onClick={() => {
      setError(""); setOptionsRetry((current) => current + 1);
    }}>Empfängerauswahl erneut laden</button> : <p role="status" className="mt-3">Empfängerauswahl wird geladen …</p> : <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-4">
      <fieldset disabled={pending} className="space-y-4">
        <label className="block text-sm font-medium">Empfängerart
          <select className={messageInput} value={type} onChange={(event) => {
            setType(event.target.value as RecipientSelection["type"]); setIds([]); setTargetId(""); setPreview(null); setConfirmAll(false);
          }}>{options.types.map((value) => <option key={value} value={value}>{recipientLabels[value]}</option>)}</select>
        </label>
        {(type === "SINGLE" || type === "MULTIPLE") && <label className="block text-sm font-medium">Empfänger
          <select required multiple={type === "MULTIPLE"} size={type === "MULTIPLE" ? 6 : undefined}
            className={messageInput} value={type === "MULTIPLE" ? ids : ids[0] ?? ""}
            onChange={(event) => { setIds(Array.from(event.target.selectedOptions, (option) => option.value).filter(Boolean)); setPreview(null); }}>
            {type === "SINGLE" && <option value="">Mitarbeiter auswählen</option>}
            {options.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
          </select>
          {type === "MULTIPLE" && <span className="mt-1 block text-xs text-[#68766d]">Mehrfachauswahl: am Desktop Strg/Cmd gedrückt halten; am Smartphone mehrere Einträge wählen.</span>}
        </label>}
        {(type === "DEPARTMENT" || type === "SHIFT_GROUP") && <label className="block text-sm font-medium">{type === "DEPARTMENT" ? "Bereich" : "Schichtgruppe"}
          <select required className={messageInput} value={targetId} onChange={(event) => { setTargetId(event.target.value); setPreview(null); }}>
            <option value="">Bitte auswählen</option>
            {(type === "DEPARTMENT" ? options.departments : options.shiftGroups).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        </label>}
        <button type="button" className={messageSecondary} onClick={() => void loadPreview()}>Empfänger ermitteln</button>
        {preview?.key === selectionKey && <div role="status" className="rounded-lg bg-[#edf3ee] p-3 text-sm">
          Diese Nachricht wird an <strong>{preview.count} Mitarbeiter</strong> gesendet.
          {type === "ALL" && <label className="mt-2 flex items-start gap-2">
            <input type="checkbox" checked={confirmAll} onChange={(event) => setConfirmAll(event.target.checked)} className="mt-1" />
            Ich bestätige den Versand an {preview.count} aktive Mitarbeiter.
          </label>}
        </div>}
        <label className="block text-sm font-medium">Betreff<input required maxLength={160} className={messageInput} value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
        <label className="block text-sm font-medium">Nachricht<textarea required maxLength={10000} rows={6} className={messageInput} value={content} onChange={(event) => setContent(event.target.value)} /></label>
        <div className="flex flex-wrap gap-6 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={important} onChange={(event) => setImportant(event.target.checked)} />Wichtig</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={replyRequired} onChange={(event) => setReplyRequired(event.target.checked)} />Antwort erforderlich</label>
        </div>
        <button type="submit" className={messageButton} disabled={!preview || preview.key !== selectionKey || type === "ALL" && !confirmAll}>{pending ? "Wird gesendet …" : "Nachricht senden"}</button>
      </fieldset>
    </form>}
  </section>;
}
