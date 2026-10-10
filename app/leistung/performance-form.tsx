"use client";

import { startTransition, useActionState, useEffect, useState, type FormEvent } from "react";
import { performanceAreas, type PerformanceAreaId, type PerformanceWorkstation } from "@/lib/performance-rules";
import { savePerformanceAction, type PerformanceFormState } from "./actions";

const initialState: PerformanceFormState = { error: null, savedAt: null };

const emptyForm = { area: null as PerformanceAreaId | null, workstation: "", quantity: "", hours: "", minutes: "", note: "" };

const inputClass =
  "mt-1.5 block min-h-12 w-full rounded-lg border border-[#cfdad1] bg-white px-3 text-base text-[#1c2b23] outline-none transition focus:border-[#174c37] focus:ring-3 focus:ring-[#174c37]/15";
const labelClass = "block text-sm font-semibold text-[#2f4a3b]";

const numberFormat = new Intl.NumberFormat("de-DE");
const soll = (target: number | null) => (target === null ? "Soll nicht hinterlegt" : `Soll ${numberFormat.format(target)}/Std.`);

function Choice({ name, value, checked, onChange, hint, children }: {
  name: string; value: string; checked: boolean; onChange: () => void; hint?: string; children: string;
}) {
  return (
    <label className={`flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-lg border px-2 py-1.5 text-center text-sm font-semibold transition has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-[#174c37] ${
      checked ? "border-[#174c37] bg-[#174c37] text-white" : "border-[#cfdad1] bg-white text-[#2f4a3b] hover:bg-[#edf3ee]"
    }`}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      {children}
      {hint && <span className={`text-[11px] font-medium ${checked ? "text-white/85" : "text-[#5e7366]"}`}>{hint}</span>}
    </label>
  );
}

export default function PerformanceForm({ workstations }: { workstations?: PerformanceWorkstation[] }) {
  const [state, formAction, isSubmitting] = useActionState(savePerformanceAction, initialState);
  const [form, setForm] = useState(emptyForm);
  const [lastHandledSave, setLastHandledSave] = useState<number | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const area = performanceAreas.find((entry) => entry.id === form.area) ?? null;
  const showTargets = workstations !== undefined;
  const targetFor = (code: string) => workstations?.find((entry) => entry.code === code)?.targetPerHour ?? null;
  const target = targetFor(form.workstation);

  // Nach erfolgreichem Speichern Formular leeren; bei Fehlern bleiben die Eingaben erhalten.
  if (state.savedAt !== null && state.savedAt !== lastHandledSave) {
    setLastHandledSave(state.savedAt);
    setForm(emptyForm);
    setShowSaved(true);
  }
  useEffect(() => {
    if (!showSaved) return;
    const timer = window.setTimeout(() => setShowSaved(false), 4000);
    return () => window.clearTimeout(timer);
  }, [showSaved]);

  const update = (patch: Partial<typeof emptyForm>) => {
    setShowSaved(false);
    setForm((current) => ({ ...current, ...patch }));
  };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <fieldset>
        <legend className={labelClass}>Bereich</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {performanceAreas.map((entry) => (
            <Choice key={entry.id} name="area" value={entry.id} checked={form.area === entry.id}
              onChange={() => update({ area: entry.id, workstation: "" })}>
              {entry.label}
            </Choice>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={!area}>
        <legend className={labelClass}>Arbeitsplatz</legend>
        {area ? (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {area.workstations.map((workstation) => (
              <Choice key={workstation} name="workstation" value={workstation} checked={form.workstation === workstation}
                onChange={() => update({ workstation })} hint={showTargets ? soll(targetFor(workstation)) : undefined}>
                {workstation}
              </Choice>
            ))}
          </div>
        ) : (
          <p className="mt-2 rounded-lg border border-dashed border-[#d7dfd8] px-3 py-3 text-sm text-[#738078]">
            Bitte zuerst einen Bereich auswählen.
          </p>
        )}
      </fieldset>

      {showTargets && form.workstation && target === null && (
        <p role="status" className="rounded-lg border border-[#ecd9a8] bg-[#fff8e6] px-3 py-2 text-sm text-[#7a5a12]">
          Für {form.workstation} ist kein Sollwert hinterlegt. Die Leistung wird ohne Sollwert und Leistungsgrad gespeichert.
        </p>
      )}

      <div>
        <label htmlFor="quantity" className={labelClass}>Menge</label>
        <input id="quantity" name="quantity" inputMode="numeric" pattern="[0-9]*" autoComplete="off"
          value={form.quantity} onChange={(event) => update({ quantity: event.target.value })}
          className={inputClass} placeholder="z. B. 350" />
        {showTargets && target !== null && (
          <p className="mt-1.5 text-xs text-[#5e7366]">
            Soll an {form.workstation}: <strong className="text-[#2f4a3b]">{numberFormat.format(target)} Stück/Std.</strong>
          </p>
        )}
      </div>

      <fieldset>
        <legend className={labelClass}>Arbeitszeit</legend>
        <div className="mt-1.5 grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-[#5e7366]">
            Stunden
            <input name="hours" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={form.hours}
              onChange={(event) => update({ hours: event.target.value })} className={inputClass} placeholder="0" />
          </label>
          <label className="block text-xs font-medium text-[#5e7366]">
            Minuten
            <input name="minutes" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={form.minutes}
              onChange={(event) => update({ minutes: event.target.value })} className={inputClass} placeholder="0" />
          </label>
        </div>
      </fieldset>

      <div>
        <label htmlFor="note" className={labelClass}>
          Bemerkung <span className="font-normal text-[#738078]">(optional)</span>
        </label>
        <textarea id="note" name="note" rows={3} maxLength={500} value={form.note}
          onChange={(event) => update({ note: event.target.value })}
          className={`${inputClass} py-2.5`} />
      </div>

      {state.error && state.savedAt === null && (
        <p role="alert" className="rounded-lg border border-[#f0c8bd] bg-[#fff2ed] px-3 py-2.5 text-sm text-[#9f422d]">
          {state.error}
        </p>
      )}
      {showSaved && (
        <p role="status" className="rounded-lg border border-[#cfe3d4] bg-[#eef7f0] px-3 py-2.5 text-sm text-[#174c37]">
          Leistung gespeichert.
        </p>
      )}

      <button type="submit" disabled={isSubmitting}
        className="min-h-12 w-full rounded-lg bg-[#174c37] px-4 text-sm font-semibold text-white transition hover:bg-[#103d2b] disabled:cursor-wait disabled:opacity-70">
        {isSubmitting ? "Wird gespeichert …" : "Leistung speichern"}
      </button>
    </form>
  );
}
