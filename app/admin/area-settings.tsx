"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "@/app/components/access-link";
import NotificationBell from "@/app/components/notification-bell";
import { staffedShifts } from "./staffing";
import { areaRepository } from "./areas-repository";
import type { AreaConfiguration, ShiftMinimum, WorkArea } from "./areas-data";
import { qualificationsRepository } from "./qualifications-repository";
import type { Qualification } from "./qualifications-data";

function createAreaId(name: string) {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "bereich"}-${crypto.randomUUID().slice(0, 8)}`;
}

export default function AreaSettings() {
  const [configuration, setConfiguration] = useState<AreaConfiguration>({ areas: [], minimums: {} });
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [newAreaName, setNewAreaName] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    void areaRepository.load().then((storedConfiguration) => {
      if (isCurrent) setConfiguration(storedConfiguration);
    }).catch((cause: unknown) => {
      if (isCurrent) setError(cause instanceof Error ? cause.message : "Bereiche konnten nicht geladen werden.");
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;

    void qualificationsRepository.loadAll().then((storedQualifications) => {
      if (isCurrent) setQualifications(storedQualifications);
    }).catch((cause: unknown) => {
      if (isCurrent) setError(cause instanceof Error ? cause.message : "Qualifikationen konnten nicht geladen werden.");
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  function updateArea(areaId: string, changes: Partial<WorkArea>) {
    setConfiguration((current) => ({
      ...current,
      areas: current.areas.map((area) =>
        area.id === areaId ? { ...area, ...changes } : area,
      ),
    }));
  }

  function updateMinimum(areaId: string, shift: (typeof staffedShifts)[number], changes: Partial<ShiftMinimum>) {
    setConfiguration((current) => ({
      ...current,
      minimums: {
        ...current.minimums,
        [areaId]: {
          ...current.minimums[areaId],
          [shift]: { ...current.minimums[areaId]?.[shift], ...changes },
        },
      },
    }));
  }

  function addArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newAreaName.trim();
    if (!name) return;
    if (configuration.areas.some((area) => area.name.toLocaleLowerCase("de") === name.toLocaleLowerCase("de"))) {
      setError("Ein Bereich mit diesem Namen ist bereits vorhanden.");
      return;
    }

    const id = createAreaId(name);
    setConfiguration((current) => ({
      areas: [...current.areas, { id, name, active: true }],
      minimums: {
        ...current.minimums,
        [id]: {
          Früh: { minimum: 0, qualificationId: null, minimumQualified: 0 },
          Spät: { minimum: 0, qualificationId: null, minimumQualified: 0 },
          Nacht: { minimum: 0, qualificationId: null, minimumQualified: 0 },
        },
      },
    }));
    setNewAreaName("");
    setError("");
    setNotice("");
  }

  async function saveConfiguration() {
    const hasEmptyName = configuration.areas.some((area) => !area.name.trim());
    const duplicateNames = new Set(
      configuration.areas.map((area) => area.name.trim().toLocaleLowerCase("de")),
    ).size !== configuration.areas.length;

    if (hasEmptyName || duplicateNames) {
      setError("Bereichsnamen müssen ausgefüllt und eindeutig sein.");
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const normalized = {
        ...configuration,
        areas: configuration.areas.map((area) => ({ ...area, name: area.name.trim() })),
      };
      await areaRepository.save(normalized);
      setConfiguration(normalized);
      setNotice("Bereiche und Mindestbesetzung wurden lokal gespeichert.");
    } catch {
      setError("Die Einstellungen konnten lokal nicht gespeichert werden.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f6f2] text-[#1c2b23]">
      <header className="border-b border-[#dce4dc] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3 rounded-lg focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#174c37]">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#174c37] text-sm font-bold text-white">TP</span>
            <span className="hidden text-sm font-semibold tracking-[0.02em] sm:inline">TeamPlan</span>
          </Link>
          <nav className="flex items-center gap-2" aria-label="Hauptnavigation">
            <Link href="/admin" className="rounded-lg px-3 py-2 text-sm font-medium text-[#41634f] hover:bg-[#edf3ee]">Zurück zum Admin</Link>
            <NotificationBell />
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pb-14 pt-8 sm:px-8 sm:pt-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.15em] text-[#668071]">ADMIN · PERSONALPLANUNG</p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Mindestbesetzung</h1>
            <p className="mt-2 text-sm text-[#68766d]">Benötigte Mitarbeiter pro Bereich und Schicht festlegen.</p>
          </div>
          <button type="button" onClick={saveConfiguration} disabled={isSaving} className="min-h-11 self-start rounded-lg bg-[#174c37] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#103d2b] disabled:opacity-60 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#174c37] sm:self-auto">
            {isSaving ? "Speichert …" : "Einstellungen speichern"}
          </button>
        </div>

        <section className="mt-8 overflow-hidden rounded-xl border border-[#e0e7e0] bg-white" aria-label="Mindestbesetzung je Bereich">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead className="bg-[#f8faf7] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77847b]">
                <tr>
                  <th scope="col" className="px-5 py-3.5">Bereich</th>
                  {staffedShifts.map((shift) => <th key={shift} scope="col" className="px-4 py-3.5">{shift}</th>)}
                  <th scope="col" className="px-4 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0ec]">
                {configuration.areas.map((area) => (
                  <tr key={area.id} className="align-top">
                    <td className="min-w-72 px-5 py-3.5">
                      <label className="sr-only" htmlFor={`area-name-${area.id}`}>Bereichsname</label>
                      <input id={`area-name-${area.id}`} value={area.name} onChange={(event) => updateArea(area.id, { name: event.target.value })} className="h-10 w-full min-w-64 rounded-lg border border-[#dce4dc] px-3 text-sm font-medium outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10" />
                    </td>
                    {staffedShifts.map((shift) => {
                      const shiftMinimum = configuration.minimums[area.id]?.[shift] ?? {
                        minimum: 0,
                        qualificationId: null,
                        minimumQualified: 0,
                      };
                      return (
                        <td key={shift} className="min-w-52 px-4 py-3.5">
                          <label className="sr-only" htmlFor={`minimum-${area.id}-${shift}`}>{area.name}, {shift}, Mindestbesetzung</label>
                          <input
                            id={`minimum-${area.id}-${shift}`}
                            type="number"
                            min="0"
                            step="1"
                            value={shiftMinimum.minimum}
                            onChange={(event) => updateMinimum(area.id, shift, { minimum: Math.max(0, Number(event.target.value)) })}
                            className="h-10 w-20 rounded-lg border border-[#dce4dc] px-3 text-sm tabular-nums outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10"
                          />
                          <div className="mt-2 space-y-1.5">
                            <label className="sr-only" htmlFor={`qualification-${area.id}-${shift}`}>{area.name}, {shift}, erforderliche Qualifikation</label>
                            <select
                              id={`qualification-${area.id}-${shift}`}
                              value={shiftMinimum.qualificationId ?? ""}
                              onChange={(event) =>
                                updateMinimum(area.id, shift, {
                                  qualificationId: event.target.value || null,
                                  minimumQualified: event.target.value ? shiftMinimum.minimumQualified : 0,
                                })
                              }
                              className="h-9 w-full rounded-lg border border-[#dce4dc] bg-white px-2 text-xs outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10"
                            >
                              <option value="">Keine Mindestqualifikation</option>
                              {qualifications.filter((entry) => entry.active).map((entry) => (
                                <option key={entry.id} value={entry.id}>{entry.name}</option>
                              ))}
                            </select>
                            {shiftMinimum.qualificationId && (
                              <label className="flex items-center gap-1.5 text-[11px] text-[#68766d]">
                                mind.
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={shiftMinimum.minimumQualified}
                                  onChange={(event) => updateMinimum(area.id, shift, { minimumQualified: Math.max(0, Number(event.target.value)) })}
                                  className="h-8 w-16 rounded-md border border-[#dce4dc] px-2 text-xs tabular-nums outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10"
                                />
                                qualifiziert
                              </label>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3.5">
                      <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-[#526056]">
                        <input type="checkbox" checked={area.active} onChange={(event) => updateArea(area.id, { active: event.target.checked })} className="size-4 accent-[#28734c]" />
                        {area.active ? "Aktiv" : "Inaktiv"}
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <form onSubmit={addArea} className="mt-6 flex flex-col gap-3 rounded-xl border border-[#e0e7e0] bg-white p-4 sm:flex-row sm:items-end sm:p-5">
          <label className="block min-w-0 flex-1">
            <span className="mb-1.5 block text-xs font-medium text-[#526056]">Weiteren Bereich hinzufügen</span>
            <input value={newAreaName} onChange={(event) => setNewAreaName(event.target.value)} placeholder="Bereichsname" className="h-11 w-full rounded-lg border border-[#dce4dc] px-3 text-sm outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10" />
          </label>
          <button type="submit" className="min-h-11 rounded-lg border border-[#ccdbcf] px-4 text-sm font-semibold text-[#286044] hover:bg-[#f4f8f4]">Bereich hinzufügen</button>
        </form>

        {error && <p role="alert" className="mt-4 rounded-lg border border-[#f0c8bd] bg-[#fff2ed] px-4 py-3 text-sm text-[#9f422d]">{error}</p>}
        {notice && <p role="status" className="mt-4 rounded-lg border border-[#d2e3d5] bg-[#edf6ee] px-4 py-3 text-sm text-[#286341]">{notice}</p>}
      </div>
    </main>
  );
}
