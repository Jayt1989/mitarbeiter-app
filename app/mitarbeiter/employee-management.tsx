"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import NotificationBell from "@/app/components/notification-bell";
import {
  createEmployeeDraft,
  employeeRoles,
  permissionOptions,
  sampleEmployees,
  shiftGroups,
  type Employee,
  type EmployeePermissions,
} from "./data";
import { shiftModelOptions } from "../schichtplan/rotation";
import { employeeRepository } from "./repository";
import { AccountBadge, AccountPanel, OneTimePasswordNotice, TemporaryPasswordInput } from "./account-section";
import { EmployeeRemovalPanel } from "./deletion-section";
import { passwordPolicyErrors } from "@/lib/password-policy";
import { sampleAreaConfiguration, type WorkArea } from "../admin/areas-data";
import { areaRepository } from "../admin/areas-repository";
import { qualificationsRepository } from "../admin/qualifications-repository";
import {
  qualificationLevels,
  qualificationLevelShortLabels,
  sampleQualifications,
  type Qualification,
  type QualificationLevel,
} from "../admin/qualifications-data";

const roleStyles = {
  Mitarbeiter: "bg-[#e7eff7] text-[#375f81]",
  Vorarbeiter: "bg-[#fff0df] text-[#94501e]",
  Admin: "bg-[#e5f2e9] text-[#22633a]",
} as const;

function cloneEmployee(employee: Employee): Employee {
  return { ...employee, permissions: { ...employee.permissions } };
}

function areaName(areaId: string | null, areas: readonly WorkArea[]) {
  if (!areaId) return "Kein Bereich";
  return areas.find((area) => area.id === areaId)?.name ?? "Unbekannter Bereich";
}

export default function EmployeeManagement() {
  const [employees, setEmployees] = useState(sampleEmployees);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("Alle Rollen");
  const [statusFilter, setStatusFilter] = useState("Alle");
  const [draft, setDraft] = useState<Employee | null>(null);
  const [formError, setFormError] = useState("");
  const [areas, setAreas] = useState<WorkArea[]>(sampleAreaConfiguration.areas);
  const [qualifications, setQualifications] = useState<Qualification[]>(sampleQualifications);
  const [qualificationError, setQualificationError] = useState("");
  const [session, setSession] = useState<{ canManageAccounts: boolean; employeeId: string | null }>({
    canManageAccounts: false,
    employeeId: null,
  });
  const [startPassword, setStartPassword] = useState("");
  const [startPasswordGenerated, setStartPasswordGenerated] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<{ name: string; login: string; password: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [removalNotice, setRemovalNotice] = useState("");

  useEffect(() => {
    let isCurrent = true;
    void fetch("/api/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { role?: string; employeeId?: string | null; permissions?: Record<string, boolean> } | null) => {
        if (!isCurrent || !body) return;
        setSession({
          canManageAccounts: body.role === "ADMIN" && body.permissions?.editEmployees === true,
          employeeId: body.employeeId ?? null,
        });
      })
      .catch(() => undefined);
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;

    void employeeRepository.loadAll().then((storedEmployees) => {
      if (isCurrent && storedEmployees) setEmployees(storedEmployees);
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;

    void areaRepository.load().then((configuration) => {
      if (isCurrent) setAreas(configuration.areas);
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;

    void qualificationsRepository.loadAll().then((storedQualifications) => {
      if (isCurrent) setQualifications(storedQualifications);
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  const filteredEmployees = employees
    .filter((employee) => {
      const searchable = [
        employee.firstName,
        employee.lastName,
        employee.personnelNumber,
        employee.email,
        employee.role,
        employee.shiftModel,
        employee.shiftGroup,
        areaName(employee.areaId, areas),
      ]
        .join(" ")
        .toLocaleLowerCase("de");
      const matchesSearch = searchable.includes(search.trim().toLocaleLowerCase("de"));
      const matchesRole = roleFilter === "Alle Rollen" || employee.role === roleFilter;
      const matchesStatus =
        statusFilter === "Alle" ||
        (statusFilter === "Aktiv" ? employee.isActive : !employee.isActive);

      return matchesSearch && matchesRole && matchesStatus;
    })
    .sort((left, right) =>
      `${left.lastName} ${left.firstName}`.localeCompare(
        `${right.lastName} ${right.firstName}`,
        "de",
      ),
    );

  useEffect(() => {
    if (!draft) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDraft(null);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [draft]);

  function openNewEmployee() {
    setFormError("");
    setStartPassword("");
    setStartPasswordGenerated(false);
    setCreatedAccount(null);
    setDraft(createEmployeeDraft());
  }

  function openEditEmployee(employee: Employee) {
    setFormError("");
    setCreatedAccount(null);
    setDraft(cloneEmployee(employee));
  }

  async function reloadEmployees() {
    const stored = await employeeRepository.loadAll();
    if (!stored) return;
    setEmployees(stored);
    setDraft((current) => {
      if (!current?.id) return current;
      const reloaded = stored.find((employee) => employee.id === current.id);
      return reloaded ? { ...current, account: reloaded.account } : current;
    });
  }

  function updateField<K extends keyof Employee>(key: K, value: Employee[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function updatePermission(key: keyof EmployeePermissions, value: boolean) {
    setDraft((current) =>
      current
        ? {
            ...current,
            permissions: { ...current.permissions, [key]: value },
          }
        : current,
    );
  }

  async function setQualificationLevel(employeeId: string, qualificationId: string, level: QualificationLevel) {
    setQualificationError("");
    setDraft((current) =>
      current && current.id === employeeId
        ? { ...current, qualifications: { ...(current.qualifications ?? {}), [qualificationId]: level } }
        : current,
    );
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
      setQualificationError(error instanceof Error ? error.message : "Stufe konnte nicht gespeichert werden.");
      const stored = await employeeRepository.loadAll();
      if (stored) {
        setEmployees(stored);
        const reloaded = stored.find((employee) => employee.id === employeeId);
        if (reloaded) setDraft((current) => (current && current.id === employeeId ? cloneEmployee(reloaded) : current));
      }
    }
  }

  async function saveEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;

    const savedEmployee = {
      ...draft,
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      personnelNumber: draft.personnelNumber.trim(),
      email: draft.email.trim(),
    };
    const duplicate = employees.some(
      (employee) =>
        employee.id !== savedEmployee.id &&
        (employee.personnelNumber.toLocaleLowerCase("de") ===
          savedEmployee.personnelNumber.toLocaleLowerCase("de") ||
          (!!savedEmployee.email &&
            employee.email.toLocaleLowerCase("de") ===
              savedEmployee.email.toLocaleLowerCase("de"))),
    );

    if (duplicate) {
      setFormError("Personalnummer und E-Mail-Adresse müssen eindeutig sein.");
      return;
    }

    if (!savedEmployee.id && session.canManageAccounts) {
      const problems = passwordPolicyErrors(startPassword);
      if (problems.length) {
        setFormError(`Startpasswort: ${problems.join(" ")}`);
        return;
      }
      setIsSaving(true);
      try {
        const nextEmployees = await employeeRepository.createWithAccount(savedEmployee, startPassword);
        setEmployees(nextEmployees);
        setCreatedAccount(
          startPasswordGenerated
            ? {
                name: `${savedEmployee.firstName} ${savedEmployee.lastName}`,
                login: savedEmployee.personnelNumber,
                password: startPassword,
              }
            : null,
        );
        setStartPassword("");
        setStartPasswordGenerated(false);
        setDraft(null);
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "Der Mitarbeiter konnte nicht angelegt werden.");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    const nextEmployees = savedEmployee.id
      ? employees.map((employee) =>
          employee.id === savedEmployee.id ? savedEmployee : employee,
        )
      : [{ ...savedEmployee, id: crypto.randomUUID() }, ...employees];

    setIsSaving(true);
    try {
      await employeeRepository.saveAll(nextEmployees);
      setEmployees(nextEmployees);
      setDraft(null);
      void reloadEmployees();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Die Änderungen konnten nicht gespeichert werden.");
    } finally {
      setIsSaving(false);
    }
  }

  const activeCount = employees.filter((employee) => employee.isActive).length;
  const inactiveCount = employees.length - activeCount;

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
          <nav className="flex items-center gap-2" aria-label="Hauptnavigation">
            <Link href="/" className="rounded-lg px-3 py-2 text-sm font-medium text-[#41634f] transition hover:bg-[#edf3ee] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]">Zum Dashboard</Link>
            <NotificationBell />
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-14 pt-8 sm:px-8 sm:pt-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.15em] text-[#668071]">
              TEAMVERWALTUNG
            </p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
              Mitarbeiter
            </h1>
            <p className="mt-2 text-sm text-[#68766d]">
              Stammdaten, Schichtmodelle und Zugriffsrechte verwalten.
            </p>
          </div>
          <button
            type="button"
            onClick={openNewEmployee}
            className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-lg bg-[#174c37] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#103d2b] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#174c37] sm:self-auto"
          >
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Mitarbeiter hinzufügen
          </button>
        </div>

        {removalNotice && (
          <div role="status" className="mt-6 flex items-start justify-between gap-3 rounded-lg border border-[#cfe3d4] bg-[#eef7f0] px-3.5 py-3 text-sm text-[#174c37]">
            <span>{removalNotice}</span>
            <button type="button" onClick={() => setRemovalNotice("")} className="shrink-0 text-xs font-semibold underline-offset-2 hover:underline">
              Ausblenden
            </button>
          </div>
        )}

        {createdAccount && (
          <div className="mt-6">
            <OneTimePasswordNotice
              title={`${createdAccount.name} wurde mit Benutzerkonto angelegt.`}
              login={createdAccount.login}
              password={createdAccount.password}
              onClose={() => setCreatedAccount(null)}
            />
          </div>
        )}

        <section className="mt-7 grid grid-cols-2 gap-3 sm:max-w-xl sm:gap-4" aria-label="Mitarbeiterübersicht">
          <div className="rounded-xl border border-[#e0e7e0] bg-white px-4 py-3.5 sm:px-5">
            <p className="text-xs font-medium text-[#718077]">Gesamt</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{employees.length}</p>
          </div>
          <div className="rounded-xl border border-[#e0e7e0] bg-white px-4 py-3.5 sm:px-5">
            <p className="text-xs font-medium text-[#718077]">Aktiv</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{activeCount}</p>
            <span className="sr-only">{inactiveCount} inaktiv</span>
          </div>
        </section>

        <section className="mt-7" aria-label="Mitarbeiterliste">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative block min-w-0 flex-1">
              <span className="sr-only">Mitarbeiter suchen</span>
              <svg
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#809087]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="10.8" cy="10.8" r="6.8" />
                <path d="m16 16 4.5 4.5" />
              </svg>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, Personalnummer oder E-Mail"
                className="h-11 w-full rounded-lg border border-[#dce4dc] bg-white pl-10 pr-3 text-sm outline-none placeholder:text-[#8b9890] focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10"
              />
            </label>
            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              aria-label="Nach Rolle filtern"
              className="h-11 rounded-lg border border-[#dce4dc] bg-white px-3 text-sm text-[#34443a] outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10"
            >
              <option>Alle Rollen</option>
              {employeeRoles.map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
            <div className="flex h-11 w-fit items-center rounded-lg border border-[#dce4dc] bg-white p-1" aria-label="Statusfilter">
              {(["Alle", "Aktiv", "Inaktiv"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  aria-pressed={statusFilter === status}
                  className={`h-full rounded-md px-3 text-xs font-medium transition ${
                    statusFilter === status
                      ? "bg-[#e8f0e9] text-[#174c37]"
                      : "text-[#68766d] hover:bg-[#f4f6f2]"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <p className="mb-3 text-xs text-[#77847b]" aria-live="polite">
            {filteredEmployees.length} von {employees.length} Mitarbeitern
          </p>

          <div className="hidden overflow-hidden rounded-xl border border-[#e0e7e0] bg-white md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1220px] border-collapse text-left">
                <thead className="bg-[#f8faf7] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77847b]">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">Mitarbeiter</th>
                    <th scope="col" className="px-4 py-3.5">Personalnummer</th>
                    <th scope="col" className="px-4 py-3.5">Rolle</th>
                    <th scope="col" className="px-4 py-3.5">Schichtmodell</th>
                    <th scope="col" className="px-4 py-3.5">Schichtgruppe</th>
                    <th scope="col" className="px-4 py-3.5">Bereich</th>
                    <th scope="col" className="px-4 py-3.5">Status</th>
                    <th scope="col" className="px-4 py-3.5">Konto</th>
                    <th scope="col" className="px-4 py-3.5"><span className="sr-only">Aktionen</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf0ec]">
                  {filteredEmployees.map((employee) => (
                    <tr key={employee.id} className="transition hover:bg-[#fbfcfa]">
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold">
                          {employee.firstName} {employee.lastName}
                        </p>
                        <p className="mt-0.5 text-xs text-[#758279]">{employee.email}</p>
                      </td>
                      <td className="px-4 py-4 text-sm tabular-nums text-[#526056]">
                        {employee.personnelNumber}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${roleStyles[employee.role]}`}>
                          {employee.role}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-[#526056]">
                        {shiftModelOptions.find((option) => option.id === employee.shiftModel)?.label}
                      </td>
                      <td className="px-4 py-4 text-sm text-[#526056]">{employee.shiftGroup}</td>
                      <td className="px-4 py-4 text-sm text-[#526056]">{areaName(employee.areaId, areas)}</td>
                      <td className="px-4 py-4">
                        <StatusBadge isActive={employee.isActive} />
                      </td>
                      <td className="px-4 py-4">
                        <AccountBadge account={employee.account} />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openEditEmployee(employee)}
                          className="rounded-md px-3 py-2 text-xs font-semibold text-[#286044] transition hover:bg-[#eaf2eb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]"
                        >
                          Bearbeiten
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredEmployees.length === 0 && <EmptyState />}
          </div>

          <div className="space-y-3 md:hidden">
            {filteredEmployees.map((employee) => (
              <article key={employee.id} className="rounded-xl border border-[#e0e7e0] bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">
                      {employee.firstName} {employee.lastName}
                    </h2>
                    <p className="mt-1 break-all text-xs text-[#718077]">{employee.email}</p>
                  </div>
                  <StatusBadge isActive={employee.isActive} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-[#edf0ec] pt-3">
                  <Description label="Personalnummer" value={employee.personnelNumber} />
                  <Description label="Rolle" value={employee.role} />
                  <Description
                    label="Schichtmodell"
                    value={shiftModelOptions.find((option) => option.id === employee.shiftModel)?.label ?? ""}
                  />
                  <Description label="Schichtgruppe" value={employee.shiftGroup} />
                  <Description label="Bereich" value={areaName(employee.areaId, areas)} />
                  <div className="min-w-0">
                    <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-[#859189]">Benutzerkonto</dt>
                    <dd className="mt-1"><AccountBadge account={employee.account} /></dd>
                  </div>
                </dl>
                <button
                  type="button"
                  onClick={() => openEditEmployee(employee)}
                  className="mt-4 min-h-10 w-full rounded-lg border border-[#ccdbcf] text-sm font-semibold text-[#286044] transition hover:bg-[#f4f8f4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]"
                >
                  Bearbeiten
                </button>
              </article>
            ))}
            {filteredEmployees.length === 0 && <EmptyState />}
          </div>
        </section>
      </div>

      {draft && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-[#10251c]/50 p-3 backdrop-blur-[2px] sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDraft(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-dialog-title"
            className="mx-auto my-2 flex max-h-[calc(100dvh-1.5rem)] max-w-3xl flex-col overflow-hidden rounded-xl border border-[#e0e7e0] bg-white shadow-2xl sm:my-6 sm:max-h-[calc(100dvh-3rem)]"
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#e8ede8] bg-white px-5 py-4 sm:px-7">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.14em] text-[#668071]">
                  MITARBEITERVERWALTUNG
                </p>
                <h2 id="employee-dialog-title" className="mt-1 text-xl font-semibold">
                  {draft.id ? "Mitarbeiter bearbeiten" : "Mitarbeiter hinzufügen"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDraft(null)}
                aria-label="Dialog schließen"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[#68766d] transition hover:bg-[#f2f5f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]"
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <form onSubmit={saveEmployee} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-6 sm:px-7">
                <section aria-labelledby="stammdaten-title">
                  <h3 id="stammdaten-title" className="mb-4 text-sm font-semibold">Stammdaten</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Vorname" htmlFor="firstName">
                      <input
                        id="firstName"
                        autoFocus
                        required
                        value={draft.firstName}
                        onChange={(event) => updateField("firstName", event.target.value)}
                        className={inputClass}
                        autoComplete="given-name"
                      />
                    </Field>
                    <Field label="Nachname" htmlFor="lastName">
                      <input
                        id="lastName"
                        required
                        value={draft.lastName}
                        onChange={(event) => updateField("lastName", event.target.value)}
                        className={inputClass}
                        autoComplete="family-name"
                      />
                    </Field>
                    <Field label="Personalnummer" htmlFor="personnelNumber">
                      <input
                        id="personnelNumber"
                        required
                        value={draft.personnelNumber}
                        onChange={(event) => updateField("personnelNumber", event.target.value)}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="E-Mail-Adresse (optional)" htmlFor="email">
                      <input
                        id="email"
                        type="email"
                        value={draft.email}
                        onChange={(event) => updateField("email", event.target.value)}
                        className={inputClass}
                        autoComplete="email"
                      />
                    </Field>
                    <Field label="Rolle" htmlFor="role">
                      <select
                        id="role"
                        value={draft.role}
                        onChange={(event) => updateField("role", event.target.value as Employee["role"])}
                        className={inputClass}
                      >
                        {employeeRoles.map((role) => <option key={role}>{role}</option>)}
                      </select>
                    </Field>
                    <Field label="Schichtmodell" htmlFor="shiftModel">
                      <select
                        id="shiftModel"
                        value={draft.shiftModel}
                        onChange={(event) => updateField("shiftModel", event.target.value as Employee["shiftModel"])}
                        className={inputClass}
                      >
                        {shiftModelOptions.map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Schichtgruppe" htmlFor="shiftGroup">
                      <select
                        id="shiftGroup"
                        value={draft.shiftGroup}
                        onChange={(event) => updateField("shiftGroup", event.target.value as Employee["shiftGroup"])}
                        className={inputClass}
                      >
                        {shiftGroups.map((group) => <option key={group}>{group}</option>)}
                      </select>
                    </Field>
                    <Field label="Bereich" htmlFor="areaId">
                      <select
                        id="areaId"
                        value={draft.areaId ?? ""}
                        onChange={(event) => updateField("areaId", event.target.value || null)}
                        className={inputClass}
                      >
                        <option value="">Kein Bereich</option>
                        {areas.map((area) => (
                          <option key={area.id} value={area.id}>
                            {area.active ? area.name : `${area.name} (inaktiv)`}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="flex items-end pb-1">
                      <Toggle
                        label={draft.isActive ? "Aktiv" : "Inaktiv"}
                        checked={draft.isActive}
                        onChange={(value) => updateField("isActive", value)}
                        description="Mitarbeiterstatus"
                      />
                    </div>
                    <Field label="Jahresurlaubsanspruch (Tage)" htmlFor="annualLeaveAllowance">
                      <input
                        id="annualLeaveAllowance"
                        type="number"
                        min="0"
                        step="0.5"
                        required
                        value={draft.annualLeaveAllowance}
                        onChange={(event) => updateField("annualLeaveAllowance", Number(event.target.value))}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Resturlaub Vorjahr (Tage)" htmlFor="carryOverLeaveDays">
                      <input
                        id="carryOverLeaveDays"
                        type="number"
                        min="0"
                        step="0.5"
                        required
                        value={draft.carryOverLeaveDays}
                        onChange={(event) => updateField("carryOverLeaveDays", Number(event.target.value))}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                  {!draft.id && session.canManageAccounts && (
                    <div className="mt-5 rounded-lg border border-[#e3e9e3] px-3.5 py-3.5 sm:px-4">
                      <TemporaryPasswordInput
                        id="startPassword"
                        label="Startpasswort"
                        value={startPassword}
                        onChange={(value, generated) => {
                          setStartPassword(value);
                          setStartPasswordGenerated(generated);
                        }}
                      />
                      <p className="mt-2 text-xs text-[#77847b]">
                        Es wird automatisch ein Benutzerkonto mit der Personalnummer als Anmeldename angelegt.
                        Beim ersten Login muss ein eigenes Passwort festgelegt werden.
                      </p>
                    </div>
                  )}
                </section>

                {draft.id && (
                  <AccountPanel
                    key={draft.id}
                    employee={draft}
                    canManage={session.canManageAccounts}
                    isSelf={!!session.employeeId && session.employeeId === draft.id}
                    onChanged={reloadEmployees}
                  />
                )}

                <section aria-labelledby="permissions-title">
                  <div className="mb-4 flex items-end justify-between gap-3">
                    <div>
                      <h3 id="permissions-title" className="text-sm font-semibold">Berechtigungen</h3>
                      <p className="mt-1 text-xs text-[#77847b]">Zugriff einzeln festlegen</p>
                    </div>
                    <span className="text-xs tabular-nums text-[#77847b]">
                      {Object.values(draft.permissions).filter(Boolean).length} aktiv
                    </span>
                  </div>
                  <div className="divide-y divide-[#edf0ec] rounded-lg border border-[#e3e9e3]">
                    {permissionOptions.map((option) => (
                      <Toggle
                        key={option.id}
                        label={option.label}
                        checked={draft.permissions[option.id]}
                        onChange={(value) => updatePermission(option.id, value)}
                        description={`Berechtigung: ${option.label}`}
                      />
                    ))}
                  </div>
                </section>

                <section aria-labelledby="qualifications-title">
                  <div className="mb-4">
                    <h3 id="qualifications-title" className="text-sm font-semibold">Qualifikationen</h3>
                    <p className="mt-1 text-xs text-[#77847b]">Stufen werden sofort gespeichert.</p>
                  </div>
                  {draft.id ? (
                    <div className="divide-y divide-[#edf0ec] rounded-lg border border-[#e3e9e3]">
                      {qualifications.map((qualification) => {
                        const level = (draft.qualifications?.[qualification.id] ?? 0) as QualificationLevel;
                        return (
                          <div key={qualification.id} className="flex min-h-12 items-center justify-between gap-4 px-3.5 py-2.5 sm:px-4">
                            <span className="min-w-0 text-sm font-medium text-[#34443a]">
                              {qualification.name}
                              {!qualification.active && <span className="ml-1.5 text-xs font-normal text-[#8b9890]">(inaktiv)</span>}
                            </span>
                            <label className="sr-only" htmlFor={`profile-level-${qualification.id}`}>{qualification.name}, Qualifikationsstufe</label>
                            <select
                              id={`profile-level-${qualification.id}`}
                              value={level}
                              onChange={(event) => void setQualificationLevel(draft.id, qualification.id, Number(event.target.value) as QualificationLevel)}
                              className="h-9 w-40 shrink-0 rounded-lg border border-[#dce4dc] bg-white px-2 text-sm outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10"
                            >
                              {qualificationLevels.map((option) => (
                                <option key={option} value={option}>{option} – {qualificationLevelShortLabels[option]}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-[#d7dfd8] px-4 py-5 text-sm text-[#68766d]">
                      Qualifikationen können bearbeitet werden, sobald der Mitarbeiter gespeichert wurde.
                    </p>
                  )}
                  {qualificationError && (
                    <p role="alert" className="mt-3 rounded-lg border border-[#f0c8bd] bg-[#fff2ed] px-3 py-2.5 text-sm text-[#9f422d]">
                      {qualificationError}
                    </p>
                  )}
                </section>

                {draft.id && session.canManageAccounts && (
                  <EmployeeRemovalPanel
                    key={`removal-${draft.id}`}
                    employee={draft}
                    isSelf={!!session.employeeId && session.employeeId === draft.id}
                    onDeactivated={async () => {
                      // Entwurf angleichen, damit „Änderungen speichern“ nicht wieder aktiviert.
                      const id = draft.id;
                      setDraft((current) => (current?.id === id ? { ...current, isActive: false } : current));
                      setEmployees((current) => current.map((entry) => (entry.id === id ? { ...entry, isActive: false } : entry)));
                      await reloadEmployees();
                    }}
                    onDeleted={(name) => {
                      const id = draft.id;
                      setDraft(null);
                      setEmployees((current) => current.filter((entry) => entry.id !== id));
                      setRemovalNotice(`${name} wurde endgültig gelöscht. Der Vorgang ist im Audit-Log protokolliert.`);
                      void reloadEmployees();
                    }}
                  />
                )}

                {formError && (
                  <p role="alert" className="rounded-lg border border-[#f0c8bd] bg-[#fff2ed] px-3 py-2.5 text-sm text-[#9f422d]">
                    {formError}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[#e8ede8] bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="min-h-11 rounded-lg border border-[#dce4dc] px-4 text-sm font-medium text-[#526056] transition hover:bg-[#f6f8f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="min-h-11 rounded-lg bg-[#174c37] px-5 text-sm font-semibold text-white transition hover:bg-[#103d2b] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#174c37] disabled:cursor-wait disabled:opacity-70"
                >
                  {isSaving ? "Wird gespeichert …" : !draft.id && session.canManageAccounts ? "Mitarbeiter mit Konto anlegen" : "Änderungen speichern"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

const inputClass = "h-11 w-full rounded-lg border border-[#dce4dc] bg-white px-3 text-sm text-[#27372d] outline-none focus:border-[#71937d] focus:ring-2 focus:ring-[#174c37]/10";

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block min-w-0">
      <span className="mb-1.5 block text-xs font-medium text-[#526056]">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description: string;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 px-3.5 py-2.5 sm:px-4">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[#34443a]">{label}</span>
        {description === "Mitarbeiterstatus" && (
          <span className="mt-0.5 block text-xs text-[#7b897f]">{description}</span>
        )}
      </span>
      <span className="relative inline-flex shrink-0 items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-label={description}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-[#dce4dc] transition peer-checked:bg-[#28734c] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#174c37] after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition peer-checked:after:translate-x-5" />
      </span>
    </label>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${isActive ? "bg-[#e6f3e9] text-[#286341]" : "bg-[#eef0ed] text-[#66726a]"}`}>
      <span className={`size-1.5 rounded-full ${isActive ? "bg-[#398557]" : "bg-[#929b94]"}`} />
      {isActive ? "Aktiv" : "Inaktiv"}
    </span>
  );
}

function Description({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-[#859189]">{label}</dt>
      <dd className="mt-0.5 truncate text-xs font-medium text-[#45544a]">{value}</dd>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-[#cfd9d0] bg-white px-5 py-12 text-center">
      <p className="text-sm font-semibold text-[#34443a]">Keine Mitarbeiter gefunden</p>
      <p className="mt-1 text-xs text-[#77847b]">Passe die Suche oder Filter an.</p>
    </div>
  );
}
