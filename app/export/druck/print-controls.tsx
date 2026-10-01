"use client";

import { useEffect } from "react";

export default function PrintControls({ autoPrint }: { autoPrint: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [autoPrint]);

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e0e7e0] bg-white px-4 py-3 print:hidden">
      <p className="text-sm text-[#526056]">
        Druckansicht · Im Druckdialog „Als PDF sichern“ wählen, Format A4 quer.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => window.close()}
          className="min-h-10 rounded-lg border border-[#dce4dc] px-4 text-sm font-medium text-[#526056] hover:bg-[#f6f8f5]"
        >
          Schließen
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-10 rounded-lg bg-[#174c37] px-4 text-sm font-semibold text-white hover:bg-[#103d2b]"
        >
          Als PDF / Drucken
        </button>
      </div>
    </div>
  );
}
