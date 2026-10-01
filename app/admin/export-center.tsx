"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Employee } from "../mitarbeiter/data";
import { employeeRepository } from "../mitarbeiter/repository";
import { areaRepository } from "./areas-repository";
import type { WorkArea } from "./areas-data";
import YearSelector from "../components/year-selector";
import { addDaysToKey, berlinTodayKey, currentBerlinYear, isoWeekInfo } from "@/lib/calendar";

type ExportKind = "week" | "year" | "vacation" | "absence" | "staffing";

const exportKinds: { id: ExportKind; label: string; text: string }[] = [
  { id: "week", label: "Wochenplan", text: "Schichten pro Bereich und Kalenderwoche" },
  { id: "year", label: "Jahresplan", text: "Ein Mitarbeiter, Januar bis Dezember" },
  { id: "vacation", label: "Urlaubsübersicht", text: "Urlaubskonten eines Jahres" },
  { id: "absence", label: "Abwesenheitsübersicht", text: "Nach Jahr, Monat und Bereich" },
  { id: "staffing", label: "Personalbesetzung", text: "Besetzung pro Tag und Bereich" },
];

const months = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),
  label: new Intl.DateTimeFormat("de-DE", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, index, 1))),
}));

const inputClass =
  "h-11 w-full rounded-lg border border-[#dce4dc] bg-white px-3 text-sm text-[#27372d] outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10";

function formatDate(dateKey: string) {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${dateKey}T00:00:00.000Z`),
  );
}

function fileNameFrom(header: string | null, fallback: string) {
  const match = header?.match(/filename="([^"]+)"/);
  return match?.[1] ?? fallback;
}

export default function ExportCenter() {
  const [kind, setKind] = useState<ExportKind>("week");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [areas, setAreas] = useState<WorkArea[]>([]);
  const [weekDate, setWeekDate] = useState(() => berlinTodayKey());
  const [year, setYear] = useState(() => currentBerlinYear());
  const [area, setArea] = useState("alle");
  const [shift, setShift] = useState("alle");
  const [onlyActive, setOnlyActive] = useState(true);
  const [employeeId, setEmployeeId] = useState("");
  const [month, setMonth] = useState("");
  const [withPeriods, setWithPeriods] = useState(true);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    void Promise.all([employeeRepository.loadAll(), areaRepository.load()]).then(([storedEmployees, configuration]) => {
      if (!isCurrent) return;
      const sorted = (storedEmployees ?? []).sort((left, right) =>
        `${left.lastName} ${left.firstName}`.localeCompare(`${right.lastName} ${right.firstName}`, "de"),
      );
      setEmployees(sorted);
      setEmployeeId((current) => current || sorted.find((employee) => employee.isActive)?.id || "");
      setAreas(configuration.areas.filter((entry) => entry.active));
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  const week = isoWeekInfo(weekDate);

  function buildParams() {
    const params = new URLSearchParams({ type: kind });
    if (kind === "week" || kind === "staffing") {
      params.set("date", week.monday);
      params.set("area", area);
      if (kind === "week") {
        params.set("shift", shift);
        if (!onlyActive) params.set("inactive", "1");
      }
    }
    if (kind === "year") {
      params.set("year", String(year));
      params.set("employeeId", employeeId);
    }
    if (kind === "vacation") {
      params.set("year", String(year));
      params.set("area", area);
      if (withPeriods) params.set("periods", "1");
    }
    if (kind === "absence") {
      params.set("year", String(year));
      params.set("area", area);
      if (month) params.set("month", month);
    }
    return params;
  }

  function openPrint() {
    setError("");
    const params = buildParams();
    params.set("print", "1");
    const opened = window.open(`/export/druck?${params.toString()}`, "_blank");
    if (!opened) setError("Die Druckansicht konnte nicht geöffnet werden. Bitte Pop-ups für diese Seite erlauben.");
  }

  async function downloadExcel() {
    setError("");
    setIsLoading(true);
    try {
      const response = await fetch(`/api/export/excel?${buildParams().toString()}`, { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Der Excel-Export konnte nicht erstellt werden.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileNameFrom(response.headers.get("Content-Disposition"), "Export.xlsx");
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Der Excel-Export konnte nicht erstellt werden.");
    } finally {
      setIsLoading(false);
    }
  }

  const areaSelect = (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-[#526056]">Bereich</span>
      <select value={area} onChange={(event) => setArea(event.target.value)} className={inputClass}>
        <option value="alle">Alle Bereiche</option>
        {areas.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select>
    </label>
  );

  return (
    <main className="min-h-screen bg-[#f4f6f2] text-[#1c2b23]">
      <header className="border-b border-[#dce4dc] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3 rounded-lg focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#174c37]">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#174c37] text-sm font-bold text-white">MA</span>
            <span className="hidden text-sm font-semibold tracking-[0.02em] sm:inline">MITARBEITERPORTAL</span>
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-1 sm:gap-2" aria-label="Adminbereiche">
            <Link href="/admin" className="rounded-lg px-2 py-2 text-xs font-medium text-[#41634f] hover:bg-[#edf3ee] sm:px-3 sm:text-sm">Personalbesetzung</Link>
            <Link href="/admin/wochenplan" className="rounded-lg px-2 py-2 text-xs font-medium text-[#41634f] hover:bg-[#edf3ee] sm:px-3 sm:text-sm">Wochenplan</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 pb-14 pt-8 sm:px-8 sm:pt-12">
        <p className="text-xs font-semibold tracking-[0.15em] text-[#668071]">ADMIN · AUSWERTUNGEN</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Export</h1>
        <p className="mt-2 text-sm text-[#68766d]">
          Pläne und Übersichten als PDF (A4 quer) oder Excel-Datei (.xlsx) aus den aktuellen Daten erstellen.
        </p>

        <section aria-label="Exportart" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {exportKinds.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={kind === entry.id}
              onClick={() => setKind(entry.id)}
              className={`rounded-xl border p-4 text-left transition focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#174c37] ${
                kind === entry.id
                  ? "border-[#174c37] bg-[#e8f0e9]"
                  : "border-[#e0e7e0] bg-white hover:border-[#bdcfc1]"
              }`}
            >
              <p className="text-sm font-semibold">{entry.label}</p>
              <p className="mt-1 text-xs text-[#77847b]">{entry.text}</p>
            </button>
          ))}
        </section>

        <section aria-label="Filter" className="mt-6 rounded-xl border border-[#e0e7e0] bg-white p-4 sm:p-6">
          {(kind === "week" || kind === "staffing") && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <p className="text-xs font-medium text-[#526056]">Kalenderwoche</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setWeekDate((date) => addDaysToKey(date, -7))} className="min-h-11 rounded-lg border border-[#dce4dc] px-3 text-sm font-medium text-[#526056] hover:bg-[#f2f6f2]">
                    Vorherige
                  </button>
                  <input
                    type="date"
                    aria-label="Datum in der Kalenderwoche"
                    value={weekDate}
                    onChange={(event) => event.target.value && setWeekDate(event.target.value)}
                    className="h-11 rounded-lg border border-[#dce4dc] bg-white px-3 text-sm"
                  />
                  <button type="button" onClick={() => setWeekDate((date) => addDaysToKey(date, 7))} className="min-h-11 rounded-lg border border-[#dce4dc] px-3 text-sm font-medium text-[#526056] hover:bg-[#f2f6f2]">
                    Nächste
                  </button>
                </div>
                <p className="mt-2 text-lg font-semibold">
                  KW {week.week}
                  <span className="ml-2 text-sm font-medium text-[#68766d]">
                    {formatDate(week.monday)} – {formatDate(week.sunday)}
                  </span>
                </p>
              </div>
              {areaSelect}
              {kind === "week" && (
                <>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-[#526056]">Schicht</span>
                    <select value={shift} onChange={(event) => setShift(event.target.value)} className={inputClass}>
                      <option value="alle">Alle Schichten</option>
                      <option value="Früh">Früh</option>
                      <option value="Spät">Spät</option>
                      <option value="Nacht">Nacht</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={onlyActive} onChange={(event) => setOnlyActive(event.target.checked)} className="size-4 accent-[#174c37]" />
                    Nur aktive Mitarbeiter
                  </label>
                </>
              )}
            </div>
          )}

          {kind === "year" && (
            <div className="grid gap-4">
              <label className="block sm:max-w-md">
                <span className="mb-1.5 block text-xs font-medium text-[#526056]">Mitarbeiter</span>
                <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className={inputClass}>
                  <option value="">Mitarbeiter auswählen</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.lastName}, {employee.firstName} · {employee.personnelNumber}{employee.isActive ? "" : " (inaktiv)"}
                    </option>
                  ))}
                </select>
              </label>
              <YearSelector year={year} onChange={setYear} />
            </div>
          )}

          {kind === "vacation" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><YearSelector year={year} onChange={setYear} /></div>
              {areaSelect}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={withPeriods} onChange={(event) => setWithPeriods(event.target.checked)} className="size-4 accent-[#174c37]" />
                Einzelne Urlaubszeiträume einschließen
              </label>
            </div>
          )}

          {kind === "absence" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><YearSelector year={year} onChange={setYear} /></div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#526056]">Monat</span>
                <select value={month} onChange={(event) => setMonth(event.target.value)} className={inputClass}>
                  <option value="">Ganzes Jahr</option>
                  {months.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
                </select>
              </label>
              {areaSelect}
              <p className="text-xs text-[#77847b] sm:col-span-2">Es werden nur Art, Zeitraum und Status exportiert – keine medizinischen Angaben.</p>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-5 rounded-lg border border-[#efb8ad] bg-[#fff0ec] px-4 py-3 text-sm font-semibold text-[#a33e31]">
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-2 border-t border-[#edf0ec] pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={openPrint}
              disabled={kind === "year" && !employeeId}
              className="min-h-11 rounded-lg border border-[#174c37] px-4 text-sm font-semibold text-[#174c37] hover:bg-[#edf3ee] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Als PDF / Drucken
            </button>
            <button
              type="button"
              onClick={() => void downloadExcel()}
              disabled={isLoading || (kind === "year" && !employeeId)}
              className="min-h-11 rounded-lg bg-[#174c37] px-4 text-sm font-semibold text-white hover:bg-[#103d2b] disabled:cursor-not-allowed disabled:bg-[#a8b9ad]"
            >
              {isLoading ? "Excel wird erstellt …" : "Excel herunterladen"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
