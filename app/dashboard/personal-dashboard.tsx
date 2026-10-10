import Link from "@/app/components/access-link";
import NotificationBell from "@/app/components/notification-bell";
import NotificationSummary from "@/app/components/notification-summary";
import MessageUnreadBadge from "@/app/components/message-unread-badge";
import type { ReactNode } from "react";
import type { DashboardDay, PersonalDashboardData } from "@/lib/personal-dashboard";
import { performanceDashboardLink } from "@/lib/performance-rules";
import { shiftTimeLabel } from "@/lib/shift-interval";
import { absenceStyles, companyDayMarkerStyle, holidayMarkerStyle, shiftStyles } from "../schichtplan/shift-styles";
import { qualificationLevelLabels, type QualificationLevel } from "../admin/qualifications-data";

const shiftLongLabels: Record<string, string> = {
  Früh: "Frühschicht",
  Spät: "Spätschicht",
  Nacht: "Nachtschicht",
};
const unplannedStyle = "border border-dashed border-[#d7dfd8] bg-white text-[#87928b]";

function formatDate(value: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("de-DE", { ...options, timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00.000Z`),
  );
}

const fullDate = (value: string) => formatDate(value, { day: "2-digit", month: "2-digit", year: "numeric" });
const shortDate = (value: string) => formatDate(value, { day: "2-digit", month: "2-digit" });

function dayLabel(day: DashboardDay) {
  switch (day.kind) {
    case "vacation": return "Urlaub";
    case "absence": return day.absence?.label ?? "Abwesend";
    case "free": return "Frei";
    case "unplanned": return "–";
    case "shift": return day.shift ?? "–";
  }
}

function dayHeadline(day: DashboardDay) {
  if (day.kind === "shift" && day.shift) return shiftLongLabels[day.shift] ?? day.shift;
  if (day.kind === "unplanned") return "Keine Schicht geplant";
  return dayLabel(day);
}

function dayStyle(day: DashboardDay) {
  switch (day.kind) {
    case "vacation": return absenceStyles.Urlaub;
    case "absence": return absenceStyles[day.absence?.styleKey ?? "Sonstige Abwesenheit"];
    case "free": return shiftStyles.Frei;
    case "unplanned": return unplannedStyle;
    case "shift": return day.shift ? shiftStyles[day.shift] : unplannedStyle;
  }
}

export default function PersonalDashboard({ data }: { data: PersonalDashboardData }) {
  const { employee, permissions } = data;
  const performanceLink = performanceDashboardLink(permissions);
  const quickLinks = [
    permissions.messages && { href: "/nachrichten", title: "Nachrichten", text: "Informationen lesen und antworten" },
    permissions.additionalShifts && { href: "/admin/zusatzschichten", title: "Zusatzschichten", text: "Wochenendarbeit planen und freigeben" },
    performanceLink,
    permissions.performanceReport && permissions.performance && { href: "/leistung", title: "Leistung erfassen", text: "Menge und Arbeitszeit eintragen" },
    permissions.performanceTargets && { href: "/admin/leistung/arbeitsplaetze", title: "Arbeitsplatz-Sollwerte", text: "Soll-Stückzahlen pro Stunde pflegen" },
    permissions.yearPlan && { href: "/schichtplan", title: "Jahres-Schichtplan", text: "Alle Dienste des Jahres" },
    permissions.requestVacation && { href: "/urlaub?antrag=neu", title: "Urlaub beantragen", text: "Neuen Antrag stellen" },
    permissions.ownVacation && { href: "/urlaub#antraege-eigen-titel", title: "Meine Urlaubsanträge", text: "Status deiner Anträge" },
    permissions.qualifications && { href: "#meine-qualifikationen", title: "Meine Qualifikationen", text: "Stufen im Überblick" },
    permissions.shiftSwap && { href: "/schichttausch", title: "Schichttausch", text: "Anfragen stellen und beantworten" },
    permissions.shiftPlan && { href: `/export/druck?type=year&year=${data.todayKey.slice(0, 4)}&print=1`, title: "Jahresplan als PDF", text: "Eigener Plan zum Drucken", external: true },
    permissions.shiftPlan && { href: `/api/export/excel?type=year&year=${data.todayKey.slice(0, 4)}`, title: "Jahresplan als Excel", text: "Eigener Plan als .xlsx", external: true },
  ].filter((entry): entry is { href: string; title: string; text: string; external?: boolean } => Boolean(entry));

  return (
    <main className="min-h-screen bg-[#f4f6f2] text-[#1c2b23]">
      <header className="border-b border-[#dce4dc] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-lg focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#174c37]"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#174c37] text-sm font-bold text-white">
              TP
            </span>
            <span className="hidden text-sm font-semibold tracking-[0.02em] sm:inline">TeamPlan</span>
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-1 sm:gap-2" aria-label="Hauptnavigation">
            {permissions.yearPlan && (
              <Link href="/schichtplan" className="rounded-lg px-3 py-2 text-sm font-medium text-[#41634f] transition hover:bg-[#edf3ee] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]">
                Schichtplan
              </Link>
            )}
            {(permissions.ownVacation || permissions.requestVacation) && (
              <Link href="/urlaub" className="rounded-lg px-3 py-2 text-sm font-medium text-[#41634f] transition hover:bg-[#edf3ee] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]">
                Urlaub
              </Link>
            )}
            {performanceLink && (
              <Link href={performanceLink.href} className="rounded-lg px-3 py-2 text-sm font-medium text-[#41634f] transition hover:bg-[#edf3ee] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]">
                Leistung
              </Link>
            )}
            <NotificationBell />
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pb-14 pt-6 sm:px-8 sm:pt-10">
        <section aria-labelledby="begruessung-titel">
          <p className="text-xs font-semibold tracking-[0.15em] text-[#668071]">MEIN DASHBOARD</p>
          <h1 id="begruessung-titel" className="mt-2 text-2xl font-semibold sm:text-4xl">
            {data.greeting}, {employee.firstName}
          </h1>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-[#e0e7e0] bg-white p-4 sm:grid-cols-4 sm:px-6">
            <Detail label="Personalnummer" value={employee.personnelNumber} />
            <Detail label="Bereich" value={data.areaName ?? "Kein Bereich"} />
            <Detail label="Schichtmodell" value={data.shiftModelLabel} />
            <Detail label="Schichtgruppe" value={employee.shiftGroup} />
          </dl>
        </section>

        <NotificationSummary />
        {data.upcomingAdditionalShift?.additionalShift && <section aria-label="Bevorstehende Zusatzschicht"
          className="mt-6 rounded-xl border border-[#ecd49a] bg-[#fff3d9] p-5">
          <h2 className="font-semibold text-[#886719]">Zusatzschicht</h2>
          <p className="mt-1 font-semibold">{formatDate(data.upcomingAdditionalShift.date, { weekday: "long" })}, {fullDate(data.upcomingAdditionalShift.date)} · {dayHeadline(data.upcomingAdditionalShift)}</p>
          <p className="mt-1 text-sm">{data.upcomingAdditionalShift.areaName} · {shiftTimeLabel(data.upcomingAdditionalShift.additionalShift.shift)}</p>
          <Link href="/schichtplan" className="mt-3 inline-block text-sm font-semibold underline">Zum Schichtplan</Link>
        </section>}

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {data.today && (
            <section
              aria-labelledby="heute-titel"
              className="relative overflow-hidden rounded-2xl bg-[#174c37] px-5 py-6 text-white sm:px-8 sm:py-8 lg:col-span-2"
            >
              <div className="absolute -right-12 -top-16 size-48 rounded-full border border-white/10" />
              <p className="relative text-xs font-semibold tracking-[0.16em] text-[#a8d5b9]">
                <span id="heute-titel">HEUTE</span> · {formatDate(data.todayKey, { weekday: "long", day: "numeric", month: "long" }).toUpperCase()}
              </p>
              <p className="relative mt-3 text-3xl font-semibold sm:text-4xl">{dayHeadline(data.today)}</p>
              {data.today.additionalShift && <p className="relative mt-2 font-semibold">Zusatzschicht · {shiftTimeLabel(data.today.additionalShift.shift)}</p>}
              {data.today.kind === "shift" && (
                <p className="relative mt-2 text-sm text-[#d4e4d9] sm:text-base">
                  {data.today.assignment
                    ? `Hauptbereich: ${data.areaName ?? "Kein Bereich"}`
                    : data.today.areaName ?? "Kein Bereich"}
                </p>
              )}
              {data.today.assignment && (
                <p className="relative mt-4 inline-flex rounded-lg bg-[#fff0df] px-3 py-2 text-sm font-semibold text-[#9a4c16]">
                  Heute eingesetzt in: {data.today.assignment.areaName}
                </p>
              )}
              {(data.today.marks.holiday || data.today.marks.companyDays.length > 0) && (
                <div className="relative mt-3 flex flex-wrap gap-2">
                  {data.today.marks.holiday && (
                    <span className="rounded-lg bg-[#fde9e7] px-3 py-1.5 text-sm font-semibold text-[#a33e31]">
                      Feiertag: {data.today.marks.holiday.name}
                    </span>
                  )}
                  {data.today.marks.companyDays.map((entry) => (
                    <span key={entry.id} className="rounded-lg bg-[#f2eaf7] px-3 py-1.5 text-sm font-semibold text-[#704d89]">
                      {entry.name}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}

          {data.today && (
            <Card title="Nächste Schicht" id="naechste-schicht">
              {data.nextShift ? (
                <>
                  <p className="text-sm capitalize text-[#68766d]">
                    {formatDate(data.nextShift.date, { weekday: "long" })}, {fullDate(data.nextShift.date)}
                  </p>
                  <p className="mt-2 text-2xl font-semibold">{dayHeadline(data.nextShift)}</p>
                  {data.nextShift.additionalShift && <p className="mt-1 text-sm font-semibold text-[#886719]">Zusatzschicht</p>}
                  <p className="mt-1 text-sm text-[#526056]">{data.nextShift.areaName ?? "Kein Bereich"}</p>
                  {data.nextShift.assignment && (
                    <p className="mt-2 text-xs font-semibold text-[#9a4c16]">
                      Temporärer Einsatz: {data.nextShift.assignment.areaName}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-[#77847b]">In den nächsten 60 Tagen ist keine Schicht geplant.</p>
              )}
            </Card>
          )}

          {data.week.length > 0 && (
            <Card title="Meine Woche" id="meine-woche" className="lg:col-span-3">
              <ol className="grid grid-cols-7 gap-1 sm:gap-2">
                {data.week.map((day) => {
                  const isToday = day.date === data.todayKey;
                  const label = dayLabel(day);
                  const markNames = [
                    ...(day.marks.holiday ? [day.marks.holiday.name] : []),
                    ...day.marks.companyDays.map((entry) => entry.name),
                  ];
                  return (
                    <li
                      key={day.date}
                      title={markNames.join(" · ") || undefined}
                      aria-label={`${formatDate(day.date, { weekday: "long" })}, ${shortDate(day.date)}: ${label}${day.assignment ? `, Einsatz: ${day.assignment.areaName}` : ""}${markNames.length > 0 ? `, ${markNames.join(", ")}` : ""}`}
                      className={`flex min-h-16 min-w-0 flex-col justify-between rounded-md px-1 py-1.5 text-center sm:px-2 ${dayStyle(day)} ${
                        isToday ? "outline-2 outline-offset-2 outline-[#174c37]" : ""
                      } ${day.assignment ? "border-l-4 border-l-[#d18a2c]" : ""} ${
                        day.marks.holiday ? holidayMarkerStyle : ""
                      } ${day.marks.companyDays.length > 0 ? companyDayMarkerStyle : ""}`}
                    >
                      <span className="text-[10px] font-semibold leading-3">
                        {formatDate(day.date, { weekday: "short" }).replace(".", "")}
                      </span>
                      <span title={label} className="truncate text-[10px] font-medium leading-3 sm:text-xs">
                        {label}
                      </span>
                      {markNames.length > 0 && (
                        <span className="truncate text-[8px] font-semibold leading-3 sm:text-[10px]">
                          {markNames.join(" · ")}
                        </span>
                      )}
                      <span className="text-[9px] leading-3 tabular-nums opacity-80">{shortDate(day.date)}</span>
                    </li>
                  );
                })}
              </ol>
            </Card>
          )}

          {data.vacation && (
            <Card title="Mein Urlaub" id="mein-urlaub" className="lg:col-span-2">
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label="Jahresurlaub" value={`${data.vacation.annualAllowance} Tage`} />
                <Stat label="Resturlaub Vorjahr" value={`${data.vacation.carryOverDays} Tage`} />
                <Stat label="Genehmigt" value={`${data.vacation.approvedDays} Tage`} />
                <Stat label="Offene Anträge" value={`${data.vacation.openRequests} (${data.vacation.requestedDays} Tage)`} />
                <Stat label="Verfügbarer Resturlaub" value={`${data.vacation.availableDays} Tage`} emphasis />
              </dl>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                {permissions.requestVacation && (
                  <Link href="/urlaub?antrag=neu" className="flex min-h-11 items-center justify-center rounded-lg bg-[#174c37] px-4 text-sm font-semibold text-white transition hover:bg-[#103d2b] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]">
                    Urlaub beantragen
                  </Link>
                )}
                <Link href="/urlaub#antraege-eigen-titel" className="flex min-h-11 items-center justify-center rounded-lg border border-[#dce4dc] px-4 text-sm font-medium text-[#41634f] transition hover:bg-[#edf3ee] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#174c37]">
                  Meine Urlaubsanträge
                </Link>
              </div>
            </Card>
          )}

          {data.vacation?.nextVacation && (
            <Card title="Nächster Urlaub" id="naechster-urlaub">
              <p className="text-lg font-semibold">
                {fullDate(data.vacation.nextVacation.startDate)} – {fullDate(data.vacation.nextVacation.endDate)}
              </p>
              <p className="mt-1 text-sm text-[#68766d]">{data.vacation.nextVacation.daysRequested} Urlaubstage</p>
            </Card>
          )}

          {data.upcomingAssignment && (
            <Card title="Kommender Einsatz" id="kommender-einsatz">
              <p className="text-lg font-semibold text-[#9a4c16]">{data.upcomingAssignment.areaName}</p>
              <p className="mt-1 text-sm text-[#526056]">
                {shortDate(data.upcomingAssignment.startDate)} – {shortDate(data.upcomingAssignment.endDate)}
                {data.upcomingAssignment.startDate <= data.todayKey && " · läuft"}
              </p>
              <p className="mt-1 text-sm text-[#68766d]">
                {data.upcomingAssignment.shift
                  ? shiftLongLabels[data.upcomingAssignment.shift]
                  : "Alle Schichten laut Plan"}
              </p>
            </Card>
          )}

          {data.absences.length > 0 && (
            <Card title="Abwesenheiten" id="abwesenheiten">
              <ul className="space-y-2">
                {data.absences.map((absence) => (
                  <li key={absence.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className={`rounded-md px-2 py-1 text-xs font-medium ${absenceStyles[absence.styleKey]}`}>
                      {absence.label}
                      {absence.requested && " (beantragt)"}
                    </span>
                    <span className="text-xs tabular-nums text-[#68766d]">
                      {absence.startDate === absence.endDate
                        ? shortDate(absence.startDate)
                        : `${shortDate(absence.startDate)} – ${shortDate(absence.endDate)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {data.qualifications && (
            <Card title="Meine Qualifikationen" id="meine-qualifikationen">
              {data.qualifications.length === 0 ? (
                <p className="text-sm text-[#77847b]">Noch keine Qualifikationen hinterlegt.</p>
              ) : (
                <ul className="divide-y divide-[#edf0ec]">
                  {data.qualifications.map((qualification) => (
                    <li key={qualification.id} className="py-2 first:pt-0 last:pb-0">
                      <p className="text-sm font-semibold">{qualification.name}</p>
                      <p className="text-xs text-[#68766d]">
                        Stufe {qualification.level} – {qualificationLevelLabels[Math.min(3, qualification.level) as QualificationLevel]}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {quickLinks.length > 0 && (
            <section aria-labelledby="schnellzugriffe-titel" className="lg:col-span-3">
              <h2 id="schnellzugriffe-titel" className="text-base font-semibold">Schnellzugriffe</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {quickLinks.map((link) => {
                  const className = "rounded-xl border border-[#e0e7e0] bg-white p-4 transition hover:-translate-y-0.5 hover:border-[#bdcfc1] hover:shadow-[0_10px_24px_rgba(28,43,35,0.08)] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#174c37]";
                  const content = (
                    <>
                      <p className="text-sm font-semibold">{link.title}{link.href === "/nachrichten" && <MessageUnreadBadge />}</p>
                      <p className="mt-1 text-xs text-[#77847b]">{link.text}</p>
                    </>
                  );
                  // Export-Links liefern Druckansicht bzw. Datei und laufen daher nicht über den Client-Router.
                  return link.external ? (
                    <a key={link.title} href={link.href} target="_blank" rel="noopener" className={className}>
                      {content}
                    </a>
                  ) : (
                    <Link key={link.title} href={link.href} className={className}>
                      {content}
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

function Card({
  title,
  id,
  className = "",
  children,
}: {
  title: string;
  id: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titel`}
      className={`scroll-mt-6 rounded-xl border border-[#e0e7e0] bg-white p-4 shadow-[0_2px_10px_rgba(28,43,35,0.03)] sm:p-5 ${className}`}
    >
      <h2 id={`${id}-titel`} className="mb-3 text-xs font-semibold tracking-[0.12em] text-[#668071] uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#859189]">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-[#34443a]">{value}</dd>
    </div>
  );
}

function Stat({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2.5 ${emphasis ? "bg-[#e7f3e9] text-[#174c37]" : "bg-[#f8faf7]"}`}>
      <dt className="text-[11px] font-medium text-[#718077]">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
