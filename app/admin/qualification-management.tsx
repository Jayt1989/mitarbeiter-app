"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "@/app/components/access-link";
import NotificationBell from "@/app/components/notification-bell";
import type { Employee } from "../mitarbeiter/data";
import { employeeRepository } from "../mitarbeiter/repository";
import { areaRepository } from "./areas-repository";
import type { AreaConfiguration } from "./areas-data";
import { qualificationsRepository } from "./qualifications-repository";
import {
  qualificationLevels,
  qualificationLevelLabels,
  qualificationLevelShortLabels,
  type Qualification,
  type QualificationLevel,
} from "./qualifications-data";

type PageView = "Katalog" | "Matrix";
type AreaFilter = "Alle Bereiche" | "Kein Bereich" | string;
type QualificationFilter = "Alle Qualifikationen" | string;

function areaName(areaId: string | null, areas: AreaConfiguration["areas"]) {
  if (!areaId) return "Kein Bereich";
  return areas.find((area) => area.id === areaId)?.name ?? "Unbekannter Bereich";
}

export default function QualificationManagement({ permissions }: { permissions: Record<string, boolean> }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [areaConfiguration, setAreaConfiguration] = useState<AreaConfiguration>({ areas: [], minimums: {} });
  const [pageView, setPageView] = useState<PageView>("Matrix");

  const [newQualificationName, setNewQualificationName] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [catalogNotice, setCatalogNotice] = useState("");

  const [areaFilter, setAreaFilter] = useState<AreaFilter>("Alle Bereiche");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [qualificationFilter, setQualificationFilter] = useState<QualificationFilter>("Alle Qualifikationen");
  const [onlyActiveEmployees, setOnlyActiveEmployees] = useState(true);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [cellError, setCellError] = useState("");

  useEffect(() => {
    let isCurrent = true;

    void Promise.all([
      employeeRepository.loadOverview("qualifications"),
      qualificationsRepository.loadAll(),
      areaRepository.load(),
    ]).then(([storedEmployees, storedQualifications, storedAreas]) => {
      if (!isCurrent) return;
      if (storedEmployees) setEmployees(storedEmployees);
      setQualifications(storedQualifications);
      setAreaConfiguration(storedAreas);
    }).catch((error: unknown) => {
      if (isCurrent) setCatalogError(error instanceof Error ? error.message : "Qualifikationen konnten nicht geladen werden.");
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  const canManageCatalog = permissions.manageQualifications === true;
  const canEditLevels = permissions.editQualifications === true;
  const canView =
    canManageCatalog || canEditLevels || permissions.viewQualifications === true;

  async function reloadEmployees() {
    const storedEmployees = await employeeRepository.loadOverview("qualifications");
    if (storedEmployees) setEmployees(storedEmployees);
  }

  async function createQualification() {
    const name = newQualificationName.trim();
    if (!name) return;
    setCatalogError("");
    setCatalogNotice("");
    try {
      const created = await qualificationsRepository.create(name);
      setQualifications((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name, "de")));
      setNewQualificationName("");
      setCatalogNotice(`„${created.name}“ wurde angelegt.`);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Die Qualifikation konnte nicht angelegt werden.");
    }
  }

  async function renameQualification(id: string, name: string) {
    setCatalogError("");
    try {
      const updated = await qualificationsRepository.rename(id, name);
      setQualifications((current) => current.map((entry) => (entry.id === id ? updated : entry)));
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Umbenennen fehlgeschlagen.");
    }
  }

  async function toggleActive(id: string, active: boolean) {
    setCatalogError("");
    try {
      const updated = await qualificationsRepository.setActive(id, active);
      setQualifications((current) => current.map((entry) => (entry.id === id ? updated : entry)));
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Status konnte nicht geändert werden.");
    }
  }

  async function deleteQualification(id: string) {
    setCatalogError("");
    setCatalogNotice("");
    try {
      await qualificationsRepository.remove(id);
      setQualifications((current) => current.filter((entry) => entry.id !== id));
      setCatalogNotice("Qualifikation wurde gelöscht.");
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Löschen fehlgeschlagen.");
    }
  }

  async function setLevel(employeeId: string, qualificationId: string, level: QualificationLevel) {
    setCellError("");
    setEmployees((current) =>
      current.map((employee) =>
        employee.id === employeeId
          ? { ...employee, qualifications: { ...(employee.qualifications ?? {}), [qualificationId]: level } }
          : employee,
      ),
    );
    try {
      await qualificationsRepository.setEmployeeLevel(employeeId, qualificationId, level);
    } catch (error) {
      setCellError(error instanceof Error ? error.message : "Stufe konnte nicht gespeichert werden.");
      await reloadEmployees();
    }
  }

  const visibleQualifications = useMemo(
    () =>
      qualificationFilter === "Alle Qualifikationen"
        ? qualifications.filter((entry) => entry.active)
        : qualifications.filter((entry) => entry.id === qualificationFilter),
    [qualifications, qualificationFilter],
  );

  const matrixEmployees = useMemo(
    () =>
      employees
        .filter((employee) => !onlyActiveEmployees || employee.isActive)
        .filter((employee) => areaFilter === "Alle Bereiche" || (areaFilter === "Kein Bereich" ? !employee.areaId : employee.areaId === areaFilter))
        .filter((employee) =>
          employeeSearch.trim()
            ? `${employee.firstName} ${employee.lastName}`.toLocaleLowerCase("de").includes(employeeSearch.trim().toLocaleLowerCase("de"))
            : true,
        )
        .filter((employee) => {
          if (!onlyMissing) return true;
          return visibleQualifications.some((qualification) => (employee.qualifications?.[qualification.id] ?? 0) === 0);
        })
        .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "de")),
    [employees, onlyActiveEmployees, areaFilter, employeeSearch, onlyMissing, visibleQualifications],
  );

  if (!canView) {
    return (
      <main className="min-h-screen bg-[#f4f6f2] px-5 py-16 text-[#1c2b23]">
        <div className="mx-auto max-w-xl rounded-xl border border-[#e0e7e0] bg-white p-6 text-center">
          <h1 className="text-xl font-semibold">Kein Zugriff</h1>
          <p className="mt-2 text-sm text-[#68766d]">Für die Qualifikationsverwaltung fehlt die Berechtigung.</p>
          <Link staffing href="/admin" className="mt-5 inline-flex rounded-lg bg-[#174c37] px-4 py-2.5 text-sm font-semibold text-white">Zur Personalbesetzung</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f6f2] text-[#1c2b23]">
      <header className="border-b border-[#dce4dc] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-8">
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

      <div className="mx-auto max-w-7xl px-4 pb-14 pt-8 sm:px-8 sm:pt-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.15em] text-[#668071]">ADMIN · PERSONALPLANUNG</p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Qualifikationen</h1>
            <p className="mt-2 text-sm text-[#68766d]">Qualifikationskatalog pflegen und Mitarbeiter einstufen.</p>
          </div>
          <div className="flex h-11 w-fit items-center rounded-lg border border-[#dce4dc] bg-white p-1" aria-label="Ansicht auswählen">
            {(["Matrix", "Katalog"] as const).map((view) => (
              <button key={view} type="button" aria-pressed={pageView === view} onClick={() => setPageView(view)} className={`h-full rounded-md px-4 text-sm font-medium transition ${pageView === view ? "bg-[#e8f0e9] text-[#174c37]" : "text-[#68766d] hover:bg-[#f4f6f2]"}`}>
                {view}
              </button>
            ))}
          </div>
        </div>

        {pageView === "Katalog" ? (
          <section className="mt-8" aria-label="Qualifikationskatalog">
            <div className="overflow-hidden rounded-xl border border-[#e0e7e0] bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left">
                  <thead className="bg-[#f8faf7] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77847b]">
                    <tr>
                      <th scope="col" className="px-5 py-3.5">Qualifikation</th>
                      <th scope="col" className="px-4 py-3.5">Status</th>
                      <th scope="col" className="px-4 py-3.5"><span className="sr-only">Aktionen</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf0ec]">
                    {qualifications.map((qualification) => (
                      <tr key={qualification.id}>
                        <td className="min-w-64 px-5 py-3.5">
                          <label className="sr-only" htmlFor={`qualification-name-${qualification.id}`}>Name</label>
                          <input
                            id={`qualification-name-${qualification.id}`}
                            defaultValue={qualification.name}
                            disabled={!canManageCatalog}
                            onBlur={(event) => {
                              const value = event.target.value.trim();
                              if (value && value !== qualification.name) renameQualification(qualification.id, value);
                            }}
                            className="h-10 w-full min-w-56 rounded-lg border border-[#dce4dc] px-3 text-sm font-medium outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10 disabled:bg-[#f4f6f2] disabled:text-[#8b9890]"
                          />
                        </td>
                        <td className="px-4 py-3.5">
                          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-[#526056]">
                            <input
                              type="checkbox"
                              checked={qualification.active}
                              disabled={!canManageCatalog}
                              onChange={(event) => toggleActive(qualification.id, event.target.checked)}
                              className="size-4 accent-[#28734c]"
                            />
                            {qualification.active ? "Aktiv" : "Inaktiv"}
                          </label>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            disabled={!canManageCatalog}
                            onClick={() => deleteQualification(qualification.id)}
                            className="rounded-md px-3 py-2 text-xs font-semibold text-[#9f422d] transition hover:bg-[#fff2ed] disabled:cursor-not-allowed disabled:text-[#b7c0b9]"
                          >
                            Löschen
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {canManageCatalog && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void createQualification();
                }}
                className="mt-6 flex flex-col gap-3 rounded-xl border border-[#e0e7e0] bg-white p-4 sm:flex-row sm:items-end sm:p-5"
              >
                <label className="block min-w-0 flex-1">
                  <span className="mb-1.5 block text-xs font-medium text-[#526056]">Weitere Qualifikation hinzufügen</span>
                  <input value={newQualificationName} onChange={(event) => setNewQualificationName(event.target.value)} placeholder="z. B. Staplerschein" className="h-11 w-full rounded-lg border border-[#dce4dc] px-3 text-sm outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10" />
                </label>
                <button type="submit" className="min-h-11 rounded-lg border border-[#ccdbcf] px-4 text-sm font-semibold text-[#286044] hover:bg-[#f4f8f4]">Qualifikation hinzufügen</button>
              </form>
            )}

            {catalogError && <p role="alert" className="mt-4 rounded-lg border border-[#f0c8bd] bg-[#fff2ed] px-4 py-3 text-sm text-[#9f422d]">{catalogError}</p>}
            {catalogNotice && <p role="status" className="mt-4 rounded-lg border border-[#d2e3d5] bg-[#edf6ee] px-4 py-3 text-sm text-[#286341]">{catalogNotice}</p>}

            <section className="mt-8 rounded-xl border border-[#e0e7e0] bg-white px-4 py-4 sm:px-5" aria-label="Legende Qualifikationsstufen">
              <h2 className="text-sm font-semibold">Qualifikationsstufen</h2>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#425248]">
                {qualificationLevels.map((level) => (
                  <span key={level}>
                    <span className="font-semibold tabular-nums">{level}</span> = {qualificationLevelLabels[level]}
                  </span>
                ))}
              </div>
            </section>
          </section>
        ) : (
          <section className="mt-8" aria-label="Qualifikationsmatrix">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#526056]">Bereich</span>
                <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)} className={filterClass}>
                  <option>Alle Bereiche</option>
                  {areaConfiguration.areas.filter((area) => area.active).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
                  <option>Kein Bereich</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#526056]">Mitarbeiter</span>
                <input value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} placeholder="Name suchen" className={filterClass} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#526056]">Qualifikation</span>
                <select value={qualificationFilter} onChange={(event) => setQualificationFilter(event.target.value)} className={filterClass}>
                  <option>Alle Qualifikationen</option>
                  {qualifications.filter((entry) => entry.active).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                </select>
              </label>
              <label className="flex h-11 items-center gap-2 self-end text-sm text-[#425248]">
                <input type="checkbox" checked={onlyActiveEmployees} onChange={(event) => setOnlyActiveEmployees(event.target.checked)} className="size-4 accent-[#28734c]" />
                Nur aktive Mitarbeiter
              </label>
              <label className="flex h-11 items-center gap-2 self-end text-sm text-[#425248]">
                <input type="checkbox" checked={onlyMissing} onChange={(event) => setOnlyMissing(event.target.checked)} className="size-4 accent-[#28734c]" />
                Nur fehlende Qualifikation
              </label>
            </div>

            <p className="mt-4 text-xs text-[#77847b]" aria-live="polite">{matrixEmployees.length} Mitarbeiter</p>
            {cellError && <p role="alert" className="mt-2 rounded-lg border border-[#f0c8bd] bg-[#fff2ed] px-3 py-2.5 text-sm text-[#9f422d]">{cellError}</p>}

            <div className="mt-4 overflow-hidden rounded-xl border border-[#e0e7e0] bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left">
                  <thead className="bg-[#f8faf7] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77847b]">
                    <tr>
                      <th scope="col" className="sticky left-0 z-10 bg-[#f8faf7] px-5 py-3.5">Mitarbeiter</th>
                      <th scope="col" className="px-4 py-3.5">Bereich</th>
                      {visibleQualifications.map((qualification) => (
                        <th key={qualification.id} scope="col" className="min-w-36 px-4 py-3.5">{qualification.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf0ec]">
                    {matrixEmployees.map((employee) => (
                      <tr key={employee.id} className="hover:bg-[#fbfcfa]">
                        <td className="sticky left-0 z-10 min-w-48 bg-white px-5 py-3 text-sm font-medium">
                          {employee.firstName} {employee.lastName}
                          {!employee.isActive && <span className="ml-2 text-xs font-normal text-[#8b9890]">(inaktiv)</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-[#68766d]">{areaName(employee.areaId, areaConfiguration.areas)}</td>
                        {visibleQualifications.map((qualification) => {
                          const level = (employee.qualifications?.[qualification.id] ?? 0) as QualificationLevel;
                          return (
                            <td key={qualification.id} className="px-4 py-3">
                              <label className="sr-only" htmlFor={`level-${employee.id}-${qualification.id}`}>
                                {employee.firstName} {employee.lastName}, {qualification.name}, Qualifikationsstufe
                              </label>
                              <select
                                id={`level-${employee.id}-${qualification.id}`}
                                value={level}
                                disabled={!canEditLevels}
                                onChange={(event) => void setLevel(employee.id, qualification.id, Number(event.target.value) as QualificationLevel)}
                                className={`h-9 w-full min-w-28 rounded-lg border px-2 text-sm outline-none focus:ring-2 focus:ring-[#174c37]/10 disabled:bg-[#f4f6f2] disabled:text-[#8b9890] ${level > 0 ? "border-[#cbd9ce] bg-[#f3f8f3] font-medium text-[#174c37]" : "border-[#dce4dc] bg-white text-[#526056]"}`}
                              >
                                {qualificationLevels.map((option) => (
                                  <option key={option} value={option}>
                                    {option} – {qualificationLevelShortLabels[option]}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {matrixEmployees.length === 0 && (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm font-semibold text-[#34443a]">Keine Mitarbeiter gefunden</p>
                  <p className="mt-1 text-xs text-[#77847b]">Passe die Filter an.</p>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

const filterClass = "h-11 w-full rounded-lg border border-[#dce4dc] bg-white px-3 text-sm outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10";
