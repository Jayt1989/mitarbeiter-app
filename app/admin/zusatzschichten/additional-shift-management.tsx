"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "@/app/components/access-link";
import NotificationBell from "@/app/components/notification-bell";
import { refreshNotifications } from "@/app/components/notification-events";
import { apiJson } from "@/lib/api-client";
import { berlinTodayKey } from "@/lib/calendar";
import { shiftTimeLabel } from "@/lib/shift-interval";
import type { AdditionalShiftDto } from "@/lib/additional-shifts";
import type { AdditionalShiftIssue } from "@/lib/additional-shift-rules";
import type { Employee } from "@/app/mitarbeiter/data";
import type { AreaConfiguration } from "../areas-data";

const shifts = [{ value: "EARLY", label: "Früh" }, { value: "LATE", label: "Spät" }, { value: "NIGHT", label: "Nacht" }] as const;
const inputClass = "min-h-11 w-full rounded-lg border border-[#dce4dc] bg-white px-3 text-sm";
const buttonClass = "min-h-11 rounded-lg border border-[#ccdbcf] px-4 py-2 text-sm font-semibold text-[#174c37] disabled:opacity-50";
type Draft = { date: string; shift: "EARLY" | "LATE" | "NIGHT"; departmentId: string; note: string; employeeIds: string[] };

export default function AdditionalShiftManagement({ permissions }: { permissions: Record<string, boolean> }) {
  const [entries, setEntries] = useState<AdditionalShiftDto[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [areas, setAreas] = useState<AreaConfiguration["areas"]>([]);
  const [form, setForm] = useState<Draft>({ date: berlinTodayKey(), shift: "EARLY", departmentId: "", note: "", employeeIds: [] });
  const [editing, setEditing] = useState<AdditionalShiftDto | null>(null);
  const [issues, setIssues] = useState<AdditionalShiftIssue[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("AKTIV");
  const canPlan = permissions.planAdditionalShifts === true;
  const reload = useCallback(async () => {
    const data = await apiJson<AdditionalShiftDto[]>("/api/additional-shifts");
    setEntries(data);
  }, []);
  useEffect(() => {
    let current = true;
    void Promise.all([
      apiJson<AdditionalShiftDto[]>("/api/additional-shifts"),
      canPlan ? apiJson<Employee[]>("/api/employees?scope=additional-shifts") : Promise.resolve([]),
      canPlan ? apiJson<AreaConfiguration>("/api/areas") : Promise.resolve({ areas: [], minimums: {} }),
    ]).then(([data, people, configuration]) => {
      if (!current) return;
      setEntries(data); setEmployees(people.filter((employee) => employee.isActive));
      setAreas(configuration.areas.filter((area) => area.active));
    }).catch((cause: unknown) => {
      if (current) setError(cause instanceof Error ? cause.message : "Zusatzschichten konnten nicht geladen werden.");
    });
    return () => { current = false; };
  }, [canPlan]);

  async function send(body: object, method: "POST" | "PATCH") {
    const response = await fetch("/api/additional-shifts", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json() as { error?: string; issues?: AdditionalShiftIssue[] };
    setIssues(result.issues ?? []);
    if (!response.ok) throw new Error(result.error ?? "Zusatzschicht konnte nicht gespeichert werden.");
    return result;
  }
  async function submit(event: FormEvent, check = false) {
    event.preventDefault(); setError(""); setMessage(""); setIssues([]); setBusy(true);
    try {
      if (editing) {
        const values = { date: form.date, shift: form.shift, departmentId: form.departmentId, note: form.note };
        await send({ ...values, id: editing.id, updatedAt: editing.updatedAt, action: "update" }, "PATCH");
      } else {
        await send({ ...form, action: check ? "check" : "create" }, "POST");
      }
      if (!check) {
        await reload(); setEditing(null);
        setForm((current) => ({ ...current, employeeIds: [], note: "" }));
        refreshNotifications(); window.dispatchEvent(new Event("planning:changed"));
        setMessage("Zusatzschicht gespeichert. Entwürfe sind erst nach Freigabe verbindlich.");
      } else setMessage("Prüfung abgeschlossen. Konflikte und Qualifikationshinweise stehen unten.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Speichern fehlgeschlagen."); }
    finally { setBusy(false); }
  }
  async function change(entry: AdditionalShiftDto, action: "release" | "cancel") {
    setError(""); setMessage(""); setIssues([]); setBusy(true);
    try {
      await send({ id: entry.id, updatedAt: entry.updatedAt, action }, "PATCH");
      await reload(); refreshNotifications(); window.dispatchEvent(new Event("planning:changed"));
      setMessage(action === "release" ? "Zusatzschicht freigegeben. Mitarbeiter wurde benachrichtigt." : "Zusatzschicht storniert.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Änderung fehlgeschlagen."); }
    finally { setBusy(false); }
  }
  const visible = entries.filter((entry) => filter === "ALLE" || (filter === "AKTIV" ? entry.status !== "STORNIERT" : entry.status === filter));
  return <main className="min-h-screen bg-[#f4f6f2] text-[#1c2b23]">
    <header className="border-b border-[#dce4dc] bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-8">
      <Link href="/" className="font-semibold text-[#174c37]">TeamPlan</Link>
      <nav className="flex items-center gap-2"><Link href="/dashboard" className="px-3 py-2 text-sm">Dashboard</Link><NotificationBell /></nav>
    </div></header>
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <h1 className="text-3xl font-semibold">Zusatzschichten / Wochenendarbeit</h1>
      <p className="mt-2 text-sm text-[#68766d]">Einzelne Samstag-/Sonntagsdienste. Die Wochenrotation bleibt unverändert. Nacht: 22–06 Uhr des Folgetags.</p>
      {error && <p role="alert" className="mt-4 rounded-lg bg-[#fff0ec] p-3 text-[#a33e31]">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-lg bg-[#e7f3e9] p-3">{message}</p>}
      {issues.length > 0 && <ul className="mt-4 space-y-2">{issues.map((issue, index) => <li key={index}
        className={`rounded-lg p-3 text-sm ${issue.blocking ? "bg-[#fff0ec] text-[#a33e31]" : "bg-[#fff3d9] text-[#886719]"}`}>
        {issue.blocking ? "Konflikt" : "Warnung"} · {issue.employeeName}: {issue.message}
      </li>)}</ul>}
      {canPlan && <form onSubmit={(event) => void submit(event)} className="mt-6 rounded-xl border border-[#e0e7e0] bg-white p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold">{editing ? `Zusatzschicht ändern: ${editing.employeeName}` : "Zusatzschichten als Entwurf planen"}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm">Datum<input className={inputClass} type="date" required min={berlinTodayKey()} value={form.date}
            onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
          <label className="text-sm">Schicht<select className={inputClass} value={form.shift}
            onChange={(event) => { const shift = shifts.find((entry) => entry.value === event.target.value); if (shift) setForm({ ...form, shift: shift.value }); }}>
            {shifts.map((shift) => <option key={shift.value} value={shift.value}>{shift.label} · {shiftTimeLabel(shift.label)}</option>)}
          </select></label>
          <label className="text-sm">Bereich<select required className={inputClass} value={form.departmentId}
            onChange={(event) => setForm({ ...form, departmentId: event.target.value })}><option value="">Bitte wählen</option>
            {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
        </div>
        {!editing && <fieldset className="mt-4"><legend className="text-sm font-semibold">Mitarbeiter auswählen</legend>
          <div className="mt-2 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {employees.map((employee) => <label key={employee.id} className="flex min-h-11 items-center gap-3 rounded-lg border border-[#dce4dc] p-3 text-sm">
              <input type="checkbox" checked={form.employeeIds.includes(employee.id)}
                onChange={(event) => setForm({ ...form, employeeIds: event.target.checked
                  ? [...form.employeeIds, employee.id] : form.employeeIds.filter((id) => id !== employee.id) })} />
              {employee.firstName} {employee.lastName}
            </label>)}
          </div></fieldset>}
        <label className="mt-4 block text-sm">Bemerkung (optional)<textarea maxLength={500} className={`${inputClass} mt-1 py-2`}
          value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
        <div className="mt-4 flex flex-wrap gap-2">
          {!editing && <button type="button" disabled={busy || !form.employeeIds.length} className={buttonClass}
            onClick={(event) => void submit(event, true)}>Konflikte prüfen</button>}
          <button disabled={busy || (!editing && !form.employeeIds.length)} className={`${buttonClass} bg-[#174c37] text-white`}>
            {busy ? "Wird geprüft …" : editing ? "Änderung speichern" : "Entwürfe speichern"}</button>
          {editing && <button type="button" className={buttonClass} onClick={() => { setEditing(null); setIssues([]); }}>Abbrechen</button>}
        </div>
      </form>}
      <section className="mt-8" aria-label="Zusatzschichten">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Geplante Zusatzschichten</h2>
          <label className="text-sm">Status <select className="min-h-11 rounded-lg border border-[#dce4dc] bg-white px-3"
            value={filter} onChange={(event) => setFilter(event.target.value)}>
            {["AKTIV", "ENTWURF", "FREIGEGEBEN", "STORNIERT", "ALLE"].map((status) => <option key={status}>{status}</option>)}</select></label>
          <button className={buttonClass} disabled={busy} onClick={() => void reload().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Laden fehlgeschlagen."))}>Neu laden</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">{visible.map((entry) => <article key={entry.id} className="rounded-xl border border-[#e0e7e0] bg-white p-4">
          <p className="text-xs font-semibold text-[#668071]">{entry.status}</p><h3 className="mt-1 font-semibold">{entry.employeeName}</h3>
          <p className="mt-1 text-sm">{new Intl.DateTimeFormat("de-DE", { weekday: "long", dateStyle: undefined, day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${entry.date}T00:00:00Z`))}</p>
          <p className="text-sm">{shifts.find((shift) => shift.value === entry.shift)?.label} · {entry.departmentName}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-[#68766d]">{entry.note}</p>
          {entry.status !== "STORNIERT" && <div className="mt-3 flex flex-wrap gap-2">
            {canPlan && (entry.status === "ENTWURF" || permissions.releaseAdditionalShifts) && <button disabled={busy} className={buttonClass}
              onClick={() => { setEditing(entry); setForm({ date: entry.date, shift: entry.shift, departmentId: entry.departmentId, note: entry.note, employeeIds: [entry.employeeId] }); setIssues([]); }}>Ändern</button>}
            {entry.status === "ENTWURF" && permissions.releaseAdditionalShifts && <button disabled={busy} className={buttonClass} onClick={() => void change(entry, "release")}>Freigeben</button>}
            {permissions.cancelAdditionalShifts && <button disabled={busy} className={buttonClass} onClick={() => void change(entry, "cancel")}>Stornieren</button>}
          </div>}
        </article>)}</div>
        {!visible.length && <p className="rounded-xl border border-dashed border-[#dce4dc] p-6 text-sm">Keine Zusatzschichten in dieser Ansicht.</p>}
      </section>
    </div>
  </main>;
}
