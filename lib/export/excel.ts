import ExcelJS from "exceljs";
import {
  cellColors,
  cellShortLabels,
  COMPANY_DAY_COLOR,
  employeeName,
  formatCreatedAt,
  formatDateDe,
  HOLIDAY_COLOR,
  weekdayNames,
  type DayCell,
  type QualificationRow,
  type StaffingRow,
} from "./model";
import type { ExportResult } from "./build";

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;
const thin = { style: "thin" as const, color: { argb: "FFC9D3CB" } };
const border = { top: thin, left: thin, bottom: thin, right: thin };
const headerFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#174c37") } };
const statusColors: Record<StaffingRow["status"], string> = {
  Ausreichend: "#e7f3e9",
  Knapp: "#fff3d9",
  Unterbesetzt: "#fde9e7",
};

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = border;
  });
  row.height = 32;
}

function styleBody(sheet: ExcelJS.Worksheet, fromRow: number) {
  for (let index = fromRow; index <= sheet.rowCount; index += 1) {
    sheet.getRow(index).eachCell({ includeEmpty: false }, (cell) => {
      cell.border = border;
      cell.alignment = { vertical: "middle", wrapText: true, ...cell.alignment };
      cell.font = { size: 10, ...cell.font };
    });
  }
}

function addTitle(sheet: ExcelJS.Worksheet, title: string, subtitle: string, columns: number) {
  sheet.addRow([title]);
  sheet.mergeCells(1, 1, 1, columns);
  sheet.getCell(1, 1).font = { bold: true, size: 14, color: { argb: argb("#174c37") } };
  sheet.addRow([`${subtitle} · erstellt am ${formatCreatedAt()}`]);
  sheet.mergeCells(2, 1, 2, columns);
  sheet.getCell(2, 1).font = { size: 9, color: { argb: argb("#68766d") } };
  sheet.addRow([]);
}

function paintDayCell(cell: ExcelJS.Cell, day: DayCell, text: string) {
  const colors = cellColors[day.kind];
  cell.value = text;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(colors.bg) } };
  cell.font = { size: 10, bold: day.kind !== "Nicht geplant", color: { argb: argb(colors.fg) } };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  const marks = [
    ...(day.holiday ? [`Feiertag: ${day.holiday}`] : []),
    ...day.companyDays.map((name) => `Sondertag: ${name}`),
    ...(day.assignmentArea ? [`${day.additionalShift ? "Zusatzschicht" : "Einsatz"}: ${day.assignmentArea}`] : []),
  ];
  if (marks.length > 0) cell.note = marks.join("\n");
  cell.border = {
    ...border,
    ...(day.holiday ? { top: { style: "thick", color: { argb: argb(HOLIDAY_COLOR) } } } : {}),
    ...(day.companyDays.length > 0 ? { bottom: { style: "thick", color: { argb: argb(COMPANY_DAY_COLOR) } } } : {}),
  };
}

function addStaffingSheet(workbook: ExcelJS.Workbook, rows: StaffingRow[], subtitle: string) {
  const sheet = workbook.addWorksheet("Besetzung", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const headers = [
    "Datum", "Feiertag", "Bereich", "Eingeplant", "Verfügbar", "Urlaub", "Krank",
    "Früh verfügbar", "Spät verfügbar", "Nacht verfügbar", "Mindestbesetzung",
    "Qualifizierte Mitarbeiter", "Mindestanzahl qualifiziert", "Status",
  ];
  addTitle(sheet, "Personalbesetzung", subtitle, headers.length);
  styleHeader(sheet.addRow(headers));
  for (const row of rows) {
    const added = sheet.addRow([
      formatDateDe(row.date, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }),
      row.holiday ?? "",
      row.areaName,
      row.planned, row.available, row.vacation, row.sick,
      row.early, row.late, row.night, row.minimum,
      row.qualified, row.minimumQualified, row.status,
    ]);
    added.getCell(14).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(statusColors[row.status]) } };
    if (row.holiday) added.getCell(2).font = { bold: true, color: { argb: argb(HOLIDAY_COLOR) } };
  }
  styleBody(sheet, 5);
  sheet.columns.forEach((column, index) => {
    column.width = index === 2 ? 30 : index <= 1 ? 18 : 13;
  });
  sheet.views = [{ state: "frozen", ySplit: 4 }];
}

function addQualificationSheet(workbook: ExcelJS.Workbook, rows: QualificationRow[]) {
  const sheet = workbook.addWorksheet("Qualifikationen");
  styleHeader(sheet.addRow(["Mitarbeiter", "Personalnummer", "Bereich", "Qualifikation", "Stufe", "Beschreibung"]));
  for (const row of rows) {
    sheet.addRow([row.name, row.personnelNumber, row.areaName, row.qualification, row.level, row.description]);
  }
  styleBody(sheet, 2);
  [28, 16, 30, 24, 8, 28].forEach((width, index) => (sheet.getColumn(index + 1).width = width));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function addTable(
  workbook: ExcelJS.Workbook,
  name: string,
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number)[][],
  widths: number[],
) {
  const sheet = workbook.addWorksheet(name, {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  addTitle(sheet, title, subtitle, headers.length);
  styleHeader(sheet.addRow(headers));
  rows.forEach((row) => sheet.addRow(row));
  styleBody(sheet, 5);
  widths.forEach((width, index) => (sheet.getColumn(index + 1).width = width));
  sheet.views = [{ state: "frozen", ySplit: 4 }];
  return sheet;
}

export async function createWorkbook(result: ExportResult): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Mitarbeiter-App";
  workbook.created = new Date();

  if (result.type === "performance") {
    const { data } = result;
    const sheet = addTable(
      workbook, "Leistungen", "Leistungsauswertung",
      `${formatDateDe(data.from)} – ${formatDateDe(data.to)} · Sollwerte zum Erfassungszeitpunkt`,
      ["Datum", "Mitarbeiter", "Personalnummer", "Schicht", "Bereich", "Arbeitsplatz", "Menge",
        "Arbeitszeit (Min.)", "Soll Stück/Std.", "Ist Stück/Std.", "Leistungsgrad %", "Bemerkung", "Erfasst am"],
      data.rows.map((row) => [
        formatDateDe(row.workDate), row.employeeName, row.personnelNumber, row.shift, row.areaLabel,
        row.workstation, row.quantity, row.durationMinutes, row.targetPerHour ?? "Nicht hinterlegt",
        row.perHour, row.achievement ?? "Nicht hinterlegt", row.note ?? "", row.createdAt,
      ]),
      [14, 26, 16, 12, 22, 14, 14, 20, 18, 18, 20, 36, 26],
    );
    for (const column of [9, 10, 11]) sheet.getColumn(column).numFmt = "0.0";
  }

  if (result.type === "week" || result.type === "staffing") {
    const { data } = result;
    const period = `KW ${data.week} · ${formatDateDe(data.monday)} – ${formatDateDe(data.sunday)} · Feiertage ${data.stateName}`;

    if (result.type === "week") {
      const sheet = workbook.addWorksheet(`Wochenplan KW ${String(data.week).padStart(2, "0")}`, {
        pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      });
      addTitle(sheet, "Wochenschichtplan", period, 10);
      const header = sheet.addRow([
        "Mitarbeiter",
        "Personalnummer",
        "Bereich",
        ...data.days.map((day, index) => {
          const marks = [day.holiday, ...day.companyDays].filter(Boolean).join(" · ");
          return `${weekdayNames[index]}\n${formatDateDe(day.date, { day: "2-digit", month: "2-digit" })}${marks ? `\n${marks}` : ""}`;
        }),
      ]);
      styleHeader(header);
      header.height = 48;
      data.days.forEach((day, index) => {
        if (day.holiday) header.getCell(index + 4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(HOLIDAY_COLOR) } };
        else if (day.companyDays.length > 0) header.getCell(index + 4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(COMPANY_DAY_COLOR) } };
      });

      for (const group of data.groups) {
        const groupRow = sheet.addRow([group.areaName]);
        sheet.mergeCells(groupRow.number, 1, groupRow.number, 10);
        groupRow.getCell(1).font = { bold: true, size: 11, color: { argb: argb("#174c37") } };
        groupRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#e8f0e9") } };

        for (const row of group.rows) {
          const added = sheet.addRow([employeeName(row.employee), row.employee.personnelNumber, row.areaName]);
          [1, 2, 3].forEach((column) => {
            added.getCell(column).border = border;
            added.getCell(column).font = { size: 10 };
          });
          row.cells.forEach((cell, index) => {
            const text = cell.assignmentArea ? `${cell.kind}\n${cell.additionalShift ? "Zusatzschicht" : "Einsatz"}: ${cell.assignmentArea}` : cell.label;
            paintDayCell(added.getCell(index + 4), cell, text);
          });
          added.height = row.cells.some((cell) => cell.assignmentArea) ? 30 : 18;
        }
      }
      [26, 15, 28, 14, 14, 14, 14, 14, 14, 14].forEach((width, index) => (sheet.getColumn(index + 1).width = width));
      sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 4 }];
      sheet.pageSetup.printTitlesRow = "4:4";

      addStaffingSheet(workbook, data.staffing, period);
      addQualificationSheet(workbook, data.qualifications);
    } else {
      addStaffingSheet(workbook, data.staffing, period);
    }
  }

  if (result.type === "year") {
    const { data } = result;
    const sheet = workbook.addWorksheet(`Jahresplan ${data.year}`, {
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
    });
    addTitle(
      sheet,
      `Jahresplan ${data.year} – ${employeeName(data.employee)}`,
      `${data.employee.personnelNumber} · ${data.areaName} · Feiertage ${data.stateName}`,
      32,
    );
    styleHeader(sheet.addRow(["Monat", ...Array.from({ length: 31 }, (_, index) => String(index + 1))]));
    for (const month of data.months) {
      const added = sheet.addRow([month.name]);
      added.getCell(1).font = { bold: true, size: 10 };
      added.getCell(1).border = border;
      month.cells.forEach((cell, index) => {
        const target = added.getCell(index + 2);
        if (!cell) {
          target.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9DED9" } };
          return;
        }
        paintDayCell(target, cell, cellShortLabels[cell.kind] + (cell.assignmentArea ? "*" : ""));
      });
      added.height = 22;
    }
    sheet.getColumn(1).width = 13;
    for (let column = 2; column <= 32; column += 1) sheet.getColumn(column).width = 5;
    sheet.addRow([]);
    sheet.addRow(["Legende: F = Früh · S = Spät · N = Nacht · fr = Frei · U = Urlaub · K = Krank · Sch = Schulung · SU = Sonderurlaub · FZA = Freizeitausgleich · Abw = sonstige Abwesenheit · * = temporärer Einsatz / Zusatzschicht (Details in Zellnotiz) · roter Rand oben = Feiertag"]);

    addTable(
      workbook,
      "Feiertage & Einsätze",
      "Feiertage, Sondertage, Einsätze und Zusatzschichten",
      `${employeeName(data.employee)} · ${data.year}`,
      ["Art", "Datum / Von", "Bis", "Bezeichnung", "Schicht"],
      [
        ...data.holidays.map((day) => [
          day.holiday ? "Feiertag" : "Sondertag",
          formatDateDe(day.date, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }),
          "",
          [day.holiday, ...day.companyDays].filter(Boolean).join(" · "),
          "",
        ]),
        ...data.assignments.map((entry) => [
          entry.additionalShift ? "Zusatzschicht" : "Temporärer Einsatz",
          formatDateDe(entry.startDate),
          formatDateDe(entry.endDate),
          entry.areaName,
          entry.shift,
        ]),
      ],
      [20, 18, 14, 36, 16],
    );
  }

  if (result.type === "vacation") {
    const { data } = result;
    addTable(
      workbook,
      `Urlaub ${data.year}`,
      `Urlaubsübersicht ${data.year}`,
      "Gesetzliche Feiertage zählen nicht als Urlaubstag",
      ["Mitarbeiter", "Personalnummer", "Bereich", "Jahresurlaub", "Resturlaub Vorjahr", "Genehmigt", "Beantragt", "Verbleibend"],
      data.rows.map((row) => [
        row.name, row.personnelNumber, row.areaName, row.annualAllowance, row.carryOverDays,
        row.approved, row.requested, row.remaining,
      ]),
      [26, 15, 30, 13, 16, 12, 12, 13],
    );
    if (result.withPeriods) {
      addTable(
        workbook,
        "Urlaubszeiträume",
        `Urlaubszeiträume ${data.year}`,
        "Genehmigte und beantragte Zeiträume",
        ["Mitarbeiter", "Personalnummer", "Von", "Bis", "Urlaubstage im Jahr", "Status"],
        data.periods.map((row) => [row.name, row.personnelNumber, formatDateDe(row.startDate), formatDateDe(row.endDate), row.days, row.status]),
        [26, 15, 13, 13, 18, 13],
      );
    }
  }

  if (result.type === "absence") {
    const { data } = result;
    addTable(
      workbook,
      "Abwesenheiten",
      `Abwesenheitsübersicht ${data.title}`,
      `${formatDateDe(data.from)} – ${formatDateDe(data.to)} · ohne medizinische Angaben`,
      ["Mitarbeiter", "Personalnummer", "Bereich", "Abwesenheitsart", "Von", "Bis", "Anzahl Tage", "Status"],
      data.rows.map((row) => [
        row.name, row.personnelNumber, row.areaName, row.kind,
        formatDateDe(row.startDate), formatDateDe(row.endDate), row.days, row.status,
      ]),
      [26, 15, 30, 22, 13, 13, 12, 12],
    );
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
