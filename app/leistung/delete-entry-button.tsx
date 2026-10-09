"use client";

import { useActionState } from "react";
import { deletePerformanceAction, type DeletePerformanceState } from "./actions";

const initialState: DeletePerformanceState = { error: null };

export default function DeleteEntryButton({ entryId, label }: { entryId: string; label: string }) {
  const [state, formAction, isPending] = useActionState(deletePerformanceAction, initialState);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(`Eintrag „${label}“ wirklich löschen?`)) event.preventDefault();
      }}
      className="shrink-0 text-right"
    >
      <input type="hidden" name="entryId" value={entryId} />
      <button type="submit" disabled={isPending} aria-label={`Eintrag ${label} löschen`}
        className="min-h-10 rounded-lg px-3 text-sm font-medium text-[#9f422d] transition hover:bg-[#fff2ed] disabled:opacity-60">
        {isPending ? "…" : "Löschen"}
      </button>
      {state.error && <p role="alert" className="mt-1 max-w-48 text-xs text-[#9f422d]">{state.error}</p>}
    </form>
  );
}
