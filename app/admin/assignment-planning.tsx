"use client";

import { apiJson } from "@/lib/api-client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import NotificationBell from "@/app/components/notification-bell";
import type { Employee } from "../mitarbeiter/data";
import { employeeRepository } from "../mitarbeiter/repository";
import { toEmployeeShiftPlan } from "../mitarbeiter/schedule";
import { getShiftForDate, type ActiveShift } from "../schichtplan/rotation";
import type { VacationRequest } from "../urlaub/vacation-data";
import { areaRepository } from "./areas-repository";
import type { AreaConfiguration } from "./areas-data";
import { qualificationsRepository } from "./qualifications-repository";
import {
  qualificationLevelLabels,
  type Qualification,
  type QualificationLevel,
} from "./qualifications-data";
import { getAbsenceForDate, getStaffingAbsences } from "./staffing";
import {
  assignmentStatuses,
  assignmentsConflict,
  checkAssignmentQualification,
  getAssignmentStatus,
  todayKey,
  type AssignmentStatus,
  type QualificationCheck,
  type TemporaryAssignment,
} from "./assignments-data";
import { assignmentRepository } from "./assignments-repository";

const activeShifts: readonly ActiveShift[] = ["Früh", "Spät", "Nacht"];
const statusStyles: Record<AssignmentStatus, string> = {
  Geplant: "bg-[#e8eff7] text-[#365f80]",
  Aktiv: "bg-[#e7f3e9] text-[#256440]",
  Beendet: "bg-[#eef0ed] text-[#66726a]",
  Storniert: "bg-[#fde9e7] text-[#a33e31]",
};
const qualificationStyles: Record<QualificationCheck["status"], string> = {
  Geeignet: "border-[#b9dcc2] bg-[#e7f3e9] text-[#256440]",
  Eingeschränkt: "border-[#ecd49a] bg-[#fff3d9] text-[#886719]",
  "Nicht qualifiziert": "border-[#efb8ad] bg-[#fff0ec] text-[#a33e31]",
  "Keine Vorgabe": "border-[#dce4dc] bg-[#f4f6f2] text-[#526056]",
};

type StatusFilter = "Alle" | AssignmentStatus;
type FormState = {
  id: string | null;
  employeeId: string;
  areaId: string;
  startDate: string;
  endDate: string;
  shift: ActiveShift | "";
  note: string;
};

const emptyForm: FormState = {
  id: null,
  employeeId: "",
  areaId: "",
  startDate: "",
  endDate: "",
  shift: "",
  note: "",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function daysBetween(startDate: string, endDate: string) {
  const days: string[] = [];
  const current = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (current <= end && days.length < 366) {
    days.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}

export default function AssignmentPlanning() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [areaConfiguration, setAreaConfiguration] = useState<AreaConfiguration>({ areas: [], minimums: {} });
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [vacationRequests, setVacationRequests] = useState<VacationRequest[]>([]);
  const [assignments, setAssignments] = useState<TemporaryAssignment[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Alle");
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    void Promise.all([
      employeeRepository.loadOverview("assignments"),
      areaRepository.load(),
      qualificationsRepository.loadForAssignments(),
      apiJson<{ vacations: VacationRequest[] }>("/api/shift-plan?scope=assignments").then((data) => data.vacations),
      assignmentRepository.loadAll(),
      apiJson<{ permissions: Record<string, boolean> }>("/api/session"),
    ]).then(([storedEmployees, storedAreas, storedQualifications, storedRequests, storedAssignments, session]) => {
      if (!isCurrent) return;
      if (storedEmployees) setEmployees(storedEmployees);
      setAreaConfiguration(storedAreas);
      setQualifications(storedQualifications);
      setVacationRequests(storedRequests);
      setAssignments(storedAssignments);
      setCanEdit(session?.permissions?.editAssignments === true);
    }).catch((error: unknown) => {
      if (isCurrent) setMessage(error instanceof Error ? error.message : "Einsatzplanung konnte nicht geladen werden.");
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  const today = todayKey();
  const activeEmployees = employees
    .filter((employee) => employee.isActive)
    .sort((left, right) =>
      `${left.lastName} ${left.firstName}`.localeCompare(`${right.lastName} ${right.firstName}`, "de"),
    );
  const activeAreas = areaConfiguration.areas.filter((area) => area.active);
  const areaName = (id: string | null) =>
    id ? areaConfiguration.areas.find((area) => area.id === id)?.name ?? null : null;
  const visibleAssignments = assignments
    .filter((assignment) =>
      statusFilter === "Alle" ? true : getAssignmentStatus(assignment, today) === statusFilter,
    )
    .sort((left, right) => left.startDate.localeCompare(right.startDate));

  function openNew() {
    setForm({ ...emptyForm, startDate: today, endDate: today });
    setFormError("");
    setMessage("");
  }

  function openEdit(assignment: TemporaryAssignment) {
    setForm({
      id: assignment.id,
      employeeId: assignment.employeeId,
      areaId: assignment.areaId,
      startDate: assignment.startDate,
      endDate: assignment.endDate,
      shift: assignment.shift ?? "",
      note: assignment.note,
    });
    setFormError("");
    setMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    setIsSaving(true);
    setFormError("");

    const input = {
      areaId: form.areaId,
      startDate: form.startDate,
      endDate: form.endDate,
      shift: form.shift === "" ? null : form.shift,
      note: form.note,
    };

    try {
      const result = form.id
        ? await assignmentRepository.update(form.id, input)
        : await assignmentRepository.create({ ...input, employeeId: form.employeeId });
      setAssignments((current) => [
        ...current.filter((entry) => entry.id !== result.assignment.id),
        result.assignment,
      ]);
      setMessage(
        `Einsatz für ${result.assignment.employeeName} in ${result.assignment.areaName} ${form.id ? "geändert" : "angelegt"}.`,
      );
      setForm(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Der Einsatz konnte nicht gespeichert werden.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCancel(assignment: TemporaryAssignment) {
    if (!window.confirm(`Einsatz von ${assignment.employeeName} in ${assignment.areaName} wirklich stornieren?`)) {
      return;
    }
    setMessage("");
    try {
      const result = await assignmentRepository.cancel(assignment.id);
      setAssignments((current) =>
        current.map((entry) => (entry.id === result.assignment.id ? result.assignment : entry)),
      );
      setMessage(`Einsatz von ${assignment.employeeName} storniert.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Der Einsatz konnte nicht storniert werden.");
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f6f2] text-[#1c2b23]">
      <header className="border-b border-[#dce4dc] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-lg focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#174c37]"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#174c37] text-sm font-bold text-white">
              MA
            </span>
            <span className="hidden text-sm font-semibold tracking-[0.02em] sm:inline">
              MITARBEITERPORTAL
            </span>
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-1 sm:gap-2" aria-label="Adminbereiche">
            <Link href="/admin" className="rounded-lg px-2 py-2 text-xs font-medium text-[#41634f] transition hover:bg-[#edf3ee] sm:px-3 sm:text-sm">
              Personalbesetzung
            </Link>
            <Link href="/admin/wochenplan" className="rounded-lg px-2 py-2 text-xs font-medium text-[#41634f] transition hover:bg-[#edf3ee] sm:px-3 sm:text-sm">
              Wochenplan
            </Link>
            <NotificationBell />
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-14 pt-8 sm:px-8 sm:pt-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.15em] text-[#668071]">
              ADMIN · PERSONALPLANUNG
            </p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Einsatzplanung</h1>
            <p className="mt-2 text-sm text-[#68766d]">
              Vertretungen und temporäre Einsätze in anderen Bereichen. Der Hauptbereich bleibt erhalten.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[#526056]">Status filtern</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="h-11 w-full rounded-lg border border-[#dce4dc] bg-white px-3 text-sm outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10 sm:w-44"
              >
                <option>Alle</option>
                {assignmentStatuses.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            {canEdit && (
              <button
                type="button"
                onClick={openNew}
                className="min-h-11 rounded-lg bg-[#174c37] px-4 text-sm font-semibold text-white transition hover:bg-[#123d2c] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]"
              >
                Temporären Einsatz hinzufügen
              </button>
            )}
          </div>
        </div>

        {!canEdit && (
          <p className="mt-5 rounded-lg border border-[#dce4dc] bg-white px-4 py-3 text-sm text-[#607067]">
            Sie können Einsätze ansehen. Zum Anlegen oder Ändern wird die Berechtigung „Einsatzplanung bearbeiten“ benötigt.
          </p>
        )}
        {message && (
          <p role="status" className="mt-5 rounded-lg border border-[#b9dcc2] bg-[#eef7f0] px-4 py-3 text-sm font-medium text-[#256440]">
            {message}
          </p>
        )}

        <section className="mt-8" aria-labelledby="einsaetze-titel">
          <h2 id="einsaetze-titel" className="text-base font-semibold">Temporäre Einsätze</h2>
          <p className="mt-1 text-xs text-[#77847b]">
            {visibleAssignments.length} von {assignments.length} Einsätzen
          </p>

          <div className="mt-4 hidden overflow-hidden rounded-xl border border-[#e0e7e0] bg-white md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-left">
                <thead className="bg-[#f8faf7] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77847b]">
                  <tr>
                    <th scope="col" className="px-5 py-3">Mitarbeiter</th>
                    <th scope="col" className="px-4 py-3">Hauptbereich</th>
                    <th scope="col" className="px-4 py-3">Einsatzbereich</th>
                    <th scope="col" className="px-4 py-3">Von</th>
                    <th scope="col" className="px-4 py-3">Bis</th>
                    <th scope="col" className="px-4 py-3">Schicht</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    {canEdit && <th scope="col" className="px-4 py-3"><span className="sr-only">Aktionen</span></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf0ec]">
                  {visibleAssignments.map((assignment) => {
                    const status = getAssignmentStatus(assignment, today);
                    return (
                      <tr key={assignment.id} className="align-top hover:bg-[#fbfcfa]">
                        <td className="px-5 py-3.5 text-sm font-medium">
                          {assignment.employeeName}
                          {assignment.note && (
                            <span className="mt-0.5 block text-xs font-normal text-[#77847b]">{assignment.note}</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-sm text-[#526056]">{assignment.primaryAreaName ?? "–"}</td>
                        <td className="px-4 py-3.5 text-sm font-medium text-[#7a4f12]">{assignment.areaName}</td>
                        <td className="px-4 py-3.5 text-sm tabular-nums text-[#526056]">{formatDate(assignment.startDate)}</td>
                        <td className="px-4 py-3.5 text-sm tabular-nums text-[#526056]">{formatDate(assignment.endDate)}</td>
                        <td className="px-4 py-3.5 text-sm text-[#526056]">{assignment.shift ?? "Alle"}</td>
                        <td className="px-4 py-3.5"><StatusBadge status={status} /></td>
                        {canEdit && (
                          <td className="px-4 py-3.5 text-right">
                            <RowActions
                              disabled={status === "Storniert"}
                              onEdit={() => openEdit(assignment)}
                              onCancel={() => void handleCancel(assignment)}
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {visibleAssignments.length === 0 && <EmptyState />}
          </div>

          <div className="mt-4 space-y-3 md:hidden">
            {visibleAssignments.map((assignment) => {
              const status = getAssignmentStatus(assignment, today);
              return (
                <article key={assignment.id} className="rounded-xl border border-[#e0e7e0] bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 truncate text-sm font-semibold">{assignment.employeeName}</h3>
                    <StatusBadge status={status} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[#edf0ec] pt-3">
                    <Detail label="Hauptbereich" value={assignment.primaryAreaName ?? "–"} />
                    <Detail label="Einsatzbereich" value={assignment.areaName} />
                    <Detail label="Von" value={formatDate(assignment.startDate)} />
                    <Detail label="Bis" value={formatDate(assignment.endDate)} />
                    <Detail label="Schicht" value={assignment.shift ?? "Alle"} />
                    {assignment.note && <Detail label="Bemerkung" value={assignment.note} />}
                  </dl>
                  {canEdit && (
                    <div className="mt-3 border-t border-[#edf0ec] pt-3">
                      <RowActions
                        disabled={status === "Storniert"}
                        onEdit={() => openEdit(assignment)}
                        onCancel={() => void handleCancel(assignment)}
                      />
                    </div>
                  )}
                </article>
              );
            })}
            {visibleAssignments.length === 0 && <EmptyState />}
          </div>
        </section>
      </div>

      {form && (
        <AssignmentDialog
          form={form}
          error={formError}
          isSaving={isSaving}
          employees={activeEmployees}
          areas={activeAreas}
          areaName={areaName}
          areaConfiguration={areaConfiguration}
          qualifications={qualifications}
          vacationRequests={vacationRequests}
          assignments={assignments}
          onChange={setForm}
          onClose={() => setForm(null)}
          onSubmit={handleSubmit}
        />
      )}
    </main>
  );
}

function AssignmentDialog({
  form,
  error,
  isSaving,
  employees,
  areas,
  areaName,
  areaConfiguration,
  qualifications,
  vacationRequests,
  assignments,
  onChange,
  onClose,
  onSubmit,
}: {
  form: FormState;
  error: string;
  isSaving: boolean;
  employees: readonly Employee[];
  areas: AreaConfiguration["areas"];
  areaName: (id: string | null) => string | null;
  areaConfiguration: AreaConfiguration;
  qualifications: readonly Qualification[];
  vacationRequests: readonly VacationRequest[];
  assignments: readonly TemporaryAssignment[];
  onChange: (form: FormState) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const employee = employees.find((entry) => entry.id === form.employeeId);
  const shift = form.shift === "" ? null : form.shift;
  const hasPeriod = form.startDate !== "" && form.endDate !== "" && form.startDate <= form.endDate;
  const targetAreas = areas.filter((area) => area.id !== employee?.areaId);

  const qualificationCheck = employee && form.areaId
    ? checkAssignmentQualification(employee, form.areaId, shift, areaConfiguration)
    : null;
  const qualificationName = qualificationCheck?.qualificationId
    ? qualifications.find((entry) => entry.id === qualificationCheck.qualificationId)?.name ?? "Bereichsqualifikation"
    : null;

  const conflict = employee && hasPeriod
    ? assignments.find((entry) =>
        assignmentsConflict(entry, {
          id: form.id ?? undefined,
          employeeId: employee.id,
          startDate: form.startDate,
          endDate: form.endDate,
          shift,
          cancelledAt: null,
        }),
      )
    : undefined;

  const absences = getStaffingAbsences(vacationRequests);
  const plan = employee ? toEmployeeShiftPlan(employee) : null;
  const periodDays = employee && plan && hasPeriod
    ? daysBetween(form.startDate, form.endDate).map((date) => ({
        date,
        shift: getShiftForDate(new Date(`${date}T00:00:00.000Z`), plan),
        absence: getAbsenceForDate(employee.id, date, absences),
      }))
    : [];
  const workDays = periodDays.filter((day) => day.shift !== null && day.shift !== "Frei");
  const matchingDays = workDays.filter((day) => shift === null || day.shift === shift);
  const absentDays = matchingDays.filter((day) => day.absence !== null);

  const inputClass =
    "h-11 w-full rounded-lg border border-[#dce4dc] bg-white px-3 text-sm outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10 disabled:bg-[#f4f6f2] disabled:text-[#77847b]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#10251c]/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-3"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="einsatz-dialog-titel"
        onSubmit={onSubmit}
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-xl border border-[#e0e7e0] bg-white shadow-2xl sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#e8ede8] px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.14em] text-[#668071]">EINSATZPLANUNG</p>
            <h2 id="einsatz-dialog-titel" className="mt-1 text-xl font-semibold">
              {form.id ? "Temporären Einsatz ändern" : "Temporären Einsatz hinzufügen"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dialog schließen"
            className="flex size-9 items-center justify-center rounded-lg text-[#68766d] hover:bg-[#f2f5f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-[#526056]">Mitarbeiter</span>
            <select
              required
              value={form.employeeId}
              disabled={form.id !== null}
              onChange={(event) => onChange({ ...form, employeeId: event.target.value, areaId: "" })}
              className={inputClass}
            >
              <option value="">Mitarbeiter auswählen</option>
              {employees.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.lastName}, {entry.firstName} · {entry.personnelNumber}
                </option>
              ))}
            </select>
          </label>

          <div className="sm:col-span-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#859189]">Hauptbereich</p>
            <p className="mt-1 text-sm font-semibold text-[#34443a]">
              {employee ? areaName(employee.areaId) ?? "Kein Hauptbereich" : "–"}
            </p>
          </div>

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-[#526056]">Einsatzbereich</span>
            <select
              required
              value={form.areaId}
              disabled={!employee}
              onChange={(event) => onChange({ ...form, areaId: event.target.value })}
              className={inputClass}
            >
              <option value="">Bereich auswählen</option>
              {targetAreas.map((area) => (
                <option key={area.id} value={area.id}>{area.name}</option>
              ))}
            </select>
          </label>

          {qualificationCheck && (
            <div className={`rounded-lg border px-4 py-3 text-sm sm:col-span-2 ${qualificationStyles[qualificationCheck.status]}`}>
              <p className="font-semibold">
                {qualificationCheck.status === "Keine Vorgabe"
                  ? "Für diesen Bereich ist keine Qualifikation hinterlegt."
                  : `Qualifikation ${qualificationName}: Stufe ${qualificationCheck.level} · ${qualificationCheck.status === "Geeignet" ? "Geeignet" : "Warnung"}`}
              </p>
              {qualificationCheck.status !== "Keine Vorgabe" && (
                <p className="mt-0.5 text-xs">
                  {qualificationLevelLabels[Math.min(3, Math.max(0, qualificationCheck.level)) as QualificationLevel]}
                  {qualificationCheck.status !== "Geeignet" &&
                    " – keine oder zu geringe Qualifikation. Sie können den Einsatz trotzdem speichern."}
                </p>
              )}
            </div>
          )}

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[#526056]">Von</span>
            <input
              type="date"
              required
              value={form.startDate}
              onChange={(event) => onChange({ ...form, startDate: event.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[#526056]">Bis</span>
            <input
              type="date"
              required
              min={form.startDate || undefined}
              value={form.endDate}
              onChange={(event) => onChange({ ...form, endDate: event.target.value })}
              className={inputClass}
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-[#526056]">Schicht (optional)</span>
            <select
              value={form.shift}
              onChange={(event) => onChange({ ...form, shift: event.target.value as FormState["shift"] })}
              className={inputClass}
            >
              <option value="">Alle Schichten laut Plan</option>
              {activeShifts.map((entry) => <option key={entry} value={entry}>Nur {entry}</option>)}
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-[#526056]">Bemerkung (optional)</span>
            <textarea
              rows={3}
              maxLength={500}
              value={form.note}
              onChange={(event) => onChange({ ...form, note: event.target.value })}
              className="w-full rounded-lg border border-[#dce4dc] bg-white px-3 py-2 text-sm outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10"
            />
          </label>

          {employee && hasPeriod && (
            <div className="space-y-2 text-xs sm:col-span-2">
              <p className="text-[#526056]">
                Wirksam an {matchingDays.length - absentDays.length} von {workDays.length} Arbeitstagen im Zeitraum.
              </p>
              {shift && matchingDays.length < workDays.length && (
                <p className="rounded-lg border border-[#ecd49a] bg-[#fff3d9] px-3 py-2 text-[#886719]">
                  An {workDays.length - matchingDays.length} Arbeitstagen ist laut Plan keine {shift}schicht – dort bleibt der Mitarbeiter im Hauptbereich.
                </p>
              )}
              {absentDays.length > 0 && (
                <p className="rounded-lg border border-[#c9d8e6] bg-[#e8eff7] px-3 py-2 text-[#365f80]">
                  An {absentDays.length} Tagen ist der Mitarbeiter abwesend (Urlaub/Krankheit) und zählt in keinem Bereich als verfügbar.
                </p>
              )}
            </div>
          )}

          {conflict && (
            <p role="alert" className="rounded-lg border border-[#efb8ad] bg-[#fff0ec] px-4 py-3 text-sm font-semibold text-[#a33e31] sm:col-span-2">
              Überschneidung mit Einsatz in {conflict.areaName} ({formatDate(conflict.startDate)} – {formatDate(conflict.endDate)}
              {conflict.shift ? `, ${conflict.shift}` : ""}).
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-lg border border-[#efb8ad] bg-[#fff0ec] px-4 py-3 text-sm font-semibold text-[#a33e31] sm:col-span-2">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[#e8ede8] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-[#dce4dc] px-4 text-sm font-medium text-[#526056] hover:bg-[#f6f8f5]">
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={isSaving || !!conflict || !hasPeriod}
            className="min-h-11 rounded-lg bg-[#174c37] px-4 text-sm font-semibold text-white transition hover:bg-[#123d2c] disabled:cursor-not-allowed disabled:bg-[#9fb3a6]"
          >
            {isSaving ? "Speichern …" : "Einsatz speichern"}
          </button>
        </div>
      </form>
    </div>
  );
}

function RowActions({
  disabled,
  onEdit,
  onCancel,
}: {
  disabled: boolean;
  onEdit: () => void;
  onCancel: () => void;
}) {
  if (disabled) return <span className="text-xs text-[#8a958d]">–</span>;
  return (
    <div className="flex gap-2 md:justify-end">
      <button type="button" onClick={onEdit} className="min-h-9 rounded-lg border border-[#dce4dc] px-3 text-xs font-medium text-[#41634f] hover:bg-[#edf3ee]">
        Ändern
      </button>
      <button type="button" onClick={onCancel} className="min-h-9 rounded-lg border border-[#efb8ad] px-3 text-xs font-medium text-[#a33e31] hover:bg-[#fff0ec]">
        Stornieren
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: AssignmentStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${statusStyles[status]}`}>
      {status}
    </span>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#859189]">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-[#34443a]">{value}</dd>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-[#cfd9d0] bg-white px-5 py-10 text-center">
      <p className="text-sm font-semibold text-[#34443a]">Keine temporären Einsätze vorhanden.</p>
      <p className="mt-1 text-xs text-[#77847b]">Einsätze erscheinen hier, sobald sie angelegt wurden.</p>
    </div>
  );
}
