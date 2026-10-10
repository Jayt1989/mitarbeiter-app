"use client";

import { useActionState } from "react";
import { saveTargetAction, type TargetFormState } from "./actions";

const initialState: TargetFormState = { error: null, saved: false };

export default function TargetForm({ code, targetPerHour }: { code: string; targetPerHour: number | null }) {
  const [state, action, pending] = useActionState(saveTargetAction, initialState);
  return (
    <form action={action} className="rounded-lg border border-[#e0e7e0] p-4">
      <input type="hidden" name="code" value={code} />
      <label htmlFor={`target-${code}`} className="block text-sm font-semibold">
        {code} · Soll Stück/Std.
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <input id={`target-${code}`} name="targetPerHour" type="number" min={1} max={2_147_483_647}
          step={1} required defaultValue={targetPerHour ?? ""} placeholder="Nicht hinterlegt"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-[#cfdad1] px-3 outline-none focus:border-[#174c37] focus:ring-3 focus:ring-[#174c37]/15" />
        <button type="submit" disabled={pending}
          className="min-h-11 rounded-lg bg-[#174c37] px-4 text-sm font-semibold text-white hover:bg-[#103d2b] disabled:opacity-70">
          {pending ? "Wird gespeichert …" : "Speichern"}
        </button>
      </div>
      {state.error && <p role="alert" className="mt-2 text-sm text-[#9f422d]">{state.error}</p>}
      {state.saved && <p role="status" className="mt-2 text-sm text-[#174c37]">Sollwert gespeichert.</p>}
    </form>
  );
}
