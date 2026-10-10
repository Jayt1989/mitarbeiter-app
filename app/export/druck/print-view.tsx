import type { ReactNode } from "react";
import {
  cellColors,
  cellShortLabels,
  COMPANY_DAY_COLOR,
  employeeName,
  formatDateDe,
  HOLIDAY_COLOR,
  weekdayNames,
  type DayCell,
  type StaffingRow,
} from "@/lib/export/model";
import type { ExportResult } from "@/lib/export/build";

const th = "border border-[#9fb0a4] bg-[#e8f0e9] px-1.5 py-1 text-left font-semibold text-[#174c37]";
const td = "border border-[#9fb0a4] px-1.5 py-1 align-middle";
const statusColors: Record<StaffingRow["status"], string> = {
  Ausreichend: "#e7f3e9",
  Knapp: "#fff3d9",
  Unterbesetzt: "#fde9e7",
};

function Header({ title, lines, createdAt }: { title: string; lines: string[]; createdAt: string }) {
  return (
    <header className="mb-3 flex items-end justify-between gap-4 border-b-2 border-[#174c37] pb-2">
      <div>
        <h1 className="text-lg font-bold text-[#174c37] print:text-base">{title}</h1>
        {lines.map((line) => (
          <p key={line} className="text-xs text-[#34443a] print:text-[10px]">{line}</p>
        ))}
      </div>
      <p className="text-right text-[10px] text-[#68766d]">
        Mitarbeiter-App
        <br />
        Erstellt am {createdAt}
      </p>
    </header>
  );
}

function ShiftCell({ cell, compact = false }: { cell: DayCell; compact?: boolean }) {
  const colors = cellColors[cell.kind];
  const marks = [cell.holiday, ...cell.companyDays].filter(Boolean).join(" · ");
  return (
    <td
      className={`${td} text-center font-semibold`}
      title={[cell.additionalShift ? cell.label : "", marks].filter(Boolean).join(" · ") || undefined}
      style={{
        background: colors.bg,
        color: colors.fg,
        borderTop: cell.holiday ? `3px solid ${HOLIDAY_COLOR}` : undefined,
        borderBottom: cell.companyDays.length > 0 ? `3px solid ${COMPANY_DAY_COLOR}` : undefined,
      }}
    >
      {compact ? cellShortLabels[cell.kind] + (cell.assignmentArea ? "*" : "") : cell.kind === "Nicht geplant" ? cell.label : cell.kind}
      {!compact && cell.assignmentArea && (
        <span className="block text-[8px] font-medium leading-tight">{cell.additionalShift ? "Zusatzschicht" : "Einsatz"}: {cell.assignmentArea}</span>
      )}
    </td>
  );
}

function Legend({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[9px] leading-snug text-[#526056]">{children}</p>;
}

function StaffingTable({ rows }: { rows: StaffingRow[] }) {
  return (
    <table className="w-full border-collapse text-[10px] print:text-[8px]">
      <thead>
        <tr>
          {["Datum", "Bereich", "Eingeplant", "Verfügbar", "Urlaub", "Krank", "Früh", "Spät", "Nacht", "Mindest", "Qualifiziert", "Mind. qual.", "Status"].map((label) => (
            <th key={label} className={th}>{label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.date}-${row.areaName}`} className="break-inside-avoid">
            <td className={td}>
              {formatDateDe(row.date, { weekday: "short", day: "2-digit", month: "2-digit" })}
              {row.holiday && <span className="block font-semibold" style={{ color: HOLIDAY_COLOR }}>{row.holiday}</span>}
            </td>
            <td className={td}>{row.areaName}</td>
            {[row.planned, row.available, row.vacation, row.sick, row.early, row.late, row.night, row.minimum, row.qualified, row.minimumQualified].map((value, index) => (
              <td key={index} className={`${td} text-right tabular-nums`}>{value}</td>
            ))}
            <td className={`${td} font-semibold`} style={{ background: statusColors[row.status] }}>{row.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full border-collapse text-[10px] print:text-[8.5px]">
      <thead>
        <tr>{headers.map((label) => <th key={label} className={th}>{label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex} className="break-inside-avoid">
            {row.map((value, index) => (
              <td key={index} className={`${td} ${typeof value === "number" ? "text-right tabular-nums" : ""}`}>{value}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function PrintView({ result, createdAt }: { result: ExportResult; createdAt: string }) {
  if (result.type === "performance") {
    const { data } = result;
    const rate = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return (
      <>
        <Header title="Leistungsauswertung"
          lines={[`${formatDateDe(data.from)} – ${formatDateDe(data.to)} · Sollwerte zum Erfassungszeitpunkt`]}
          createdAt={createdAt} />
        <SimpleTable
          headers={["Datum", "Mitarbeiter", "Personalnummer", "Schicht", "Bereich", "Arbeitsplatz", "Menge",
            "Arbeitszeit (Min.)", "Soll Stück/Std.", "Ist Stück/Std.", "Leistungsgrad %", "Bemerkung"]}
          rows={data.rows.map((row) => [
            formatDateDe(row.workDate), row.employeeName, row.personnelNumber, row.shift, row.areaLabel,
            row.workstation, row.quantity, row.durationMinutes, row.targetPerHour ?? "Nicht hinterlegt",
            rate.format(row.perHour), row.achievement === null ? "Nicht hinterlegt" : `${rate.format(row.achievement)} %`,
            row.note ?? "",
          ])}
        />
      </>
    );
  }

  if (result.type === "week" || result.type === "staffing") {
    const { data } = result;
    const period = `KW ${data.week} · ${formatDateDe(data.monday)} – ${formatDateDe(data.sunday)}`;

    if (result.type === "staffing") {
      return (
        <>
          <Header title="Personalbesetzung" lines={[period]} createdAt={createdAt} />
          <StaffingTable rows={data.staffing} />
        </>
      );
    }

    return (
      <>
        <Header title="Wochenschichtplan" lines={[period, `Feiertage: ${data.stateName}`]} createdAt={createdAt} />
        {data.groups.length === 0 && <p className="text-sm">Keine Mitarbeiter für die gewählten Filter.</p>}
        {data.groups.map((group) => (
          <section key={group.areaId ?? "none"} className="mb-3 break-inside-avoid">
            <table className="w-full table-fixed border-collapse text-[10px] print:text-[8.5px]">
              <colgroup>
                <col className="w-[16%]" />
                <col className="w-[8%]" />
                {data.days.map((day) => <col key={day.date} />)}
              </colgroup>
              <thead>
                <tr>
                  <th colSpan={9} className="border border-[#9fb0a4] bg-[#174c37] px-1.5 py-1 text-left text-[11px] font-bold text-white print:text-[9px]">
                    {group.areaName}
                  </th>
                </tr>
                <tr>
                  <th className={th}>Mitarbeiter</th>
                  <th className={th}>Pers.-Nr.</th>
                  {data.days.map((day, index) => {
                    const marks = [day.holiday, ...day.companyDays].filter(Boolean).join(" · ");
                    return (
                      <th
                        key={day.date}
                        className={`${th} text-center`}
                        style={day.holiday ? { background: "#fde9e7", color: HOLIDAY_COLOR } : day.companyDays.length > 0 ? { background: "#f2eaf7", color: COMPANY_DAY_COLOR } : undefined}
                      >
                        {weekdayNames[index].slice(0, 2)} {formatDateDe(day.date, { day: "2-digit", month: "2-digit" })}
                        {marks && <span className="block font-medium normal-case">{marks}</span>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.employee.id} className="break-inside-avoid">
                    <td className={`${td} font-medium`}>{row.employee.lastName}, {row.employee.firstName}</td>
                    <td className={td}>{row.employee.personnelNumber}</td>
                    {row.cells.map((cell) => <ShiftCell key={cell.date} cell={cell} />)}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
        <Legend>
          Roter Rand oben = gesetzlicher Feiertag (Schicht bleibt bestehen) · Violetter Rand unten = betrieblicher Sondertag ·
          „Einsatz“ = temporärer Einsatz in anderem Bereich · „Zusatzschicht“ = freigegebene Wochenendarbeit
        </Legend>
      </>
    );
  }

  if (result.type === "year") {
    const { data } = result;
    return (
      <>
        <Header
          title={`Jahresplan ${data.year}`}
          lines={[`${employeeName(data.employee)} · ${data.employee.personnelNumber} · ${data.areaName}`, `Feiertage: ${data.stateName}`]}
          createdAt={createdAt}
        />
        <table className="w-full table-fixed border-collapse text-[9px] print:text-[7.5px]">
          <colgroup>
            <col className="w-[9%]" />
            {Array.from({ length: 31 }, (_, index) => <col key={index} />)}
          </colgroup>
          <thead>
            <tr>
              <th className={th}>Monat</th>
              {Array.from({ length: 31 }, (_, index) => <th key={index} className={`${th} text-center`}>{index + 1}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.months.map((month) => (
              <tr key={month.name}>
                <td className={`${td} font-semibold capitalize`}>{month.name}</td>
                {month.cells.map((cell, index) =>
                  cell ? <ShiftCell key={index} cell={cell} compact /> : <td key={index} className={`${td} bg-[#d9ded9]`} />,
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <Legend>
          F = Früh · S = Spät · N = Nacht · fr = Frei · U = Urlaub · K = Krank · Sch = Schulung · SU = Sonderurlaub ·
          FZA = Freizeitausgleich · Abw = sonstige Abwesenheit · * = temporärer Einsatz / Zusatzschicht · roter Rand oben = Feiertag ·
          violetter Rand unten = Sondertag
        </Legend>
        <div className="mt-3 grid grid-cols-2 gap-4 break-inside-avoid">
          <SimpleTable
            headers={["Feiertage / Sondertage", "Datum"]}
            rows={data.holidays.map((day) => [
              [day.holiday, ...day.companyDays].filter(Boolean).join(" · "),
              formatDateDe(day.date, { weekday: "short", day: "2-digit", month: "2-digit" }),
            ])}
          />
          <SimpleTable
            headers={["Einsatz / Zusatzschicht", "Von", "Bis", "Schicht"]}
            rows={data.assignments.length > 0
              ? data.assignments.map((entry) => [entry.additionalShift ? `Zusatzschicht: ${entry.areaName}` : entry.areaName, formatDateDe(entry.startDate), formatDateDe(entry.endDate), entry.shift])
              : [["Keine Einsätze", "", "", ""]]}
          />
        </div>
      </>
    );
  }

  if (result.type === "vacation") {
    const { data } = result;
    return (
      <>
        <Header title={`Urlaubsübersicht ${data.year}`} lines={["Gesetzliche Feiertage zählen nicht als Urlaubstag"]} createdAt={createdAt} />
        <SimpleTable
          headers={["Mitarbeiter", "Personalnummer", "Bereich", "Jahresurlaub", "Resturlaub Vorjahr", "Genehmigt", "Beantragt", "Verbleibend"]}
          rows={data.rows.map((row) => [row.name, row.personnelNumber, row.areaName, row.annualAllowance, row.carryOverDays, row.approved, row.requested, row.remaining])}
        />
        {result.withPeriods && (
          <div className="mt-4">
            <h2 className="mb-1 text-sm font-semibold text-[#174c37]">Urlaubszeiträume</h2>
            <SimpleTable
              headers={["Mitarbeiter", "Personalnummer", "Von", "Bis", "Urlaubstage im Jahr", "Status"]}
              rows={data.periods.map((row) => [row.name, row.personnelNumber, formatDateDe(row.startDate), formatDateDe(row.endDate), row.days, row.status])}
            />
          </div>
        )}
      </>
    );
  }

  const { data } = result;
  return (
    <>
      <Header
        title={`Abwesenheitsübersicht ${data.title}`}
        lines={[`${formatDateDe(data.from)} – ${formatDateDe(data.to)} · ohne medizinische Angaben`]}
        createdAt={createdAt}
      />
      <SimpleTable
        headers={["Mitarbeiter", "Personalnummer", "Bereich", "Abwesenheitsart", "Von", "Bis", "Anzahl Tage", "Status"]}
        rows={data.rows.map((row) => [row.name, row.personnelNumber, row.areaName, row.kind, formatDateDe(row.startDate), formatDateDe(row.endDate), row.days, row.status])}
      />
      {data.rows.length === 0 && <p className="mt-2 text-sm">Keine Abwesenheiten im gewählten Zeitraum.</p>}
    </>
  );
}
