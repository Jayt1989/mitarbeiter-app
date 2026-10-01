import type { AbsenceType } from "../admin/staffing-data";
import type { Shift } from "./rotation";
import type { VacationStatus } from "../urlaub/vacation-data";

export const shiftStyles: Record<Shift, string> = {
  Früh: "bg-[#e4f0fb] text-[#245c87]",
  Spät: "bg-[#fff0df] text-[#9a4c16]",
  Nacht: "bg-[#29395f] text-white",
  Frei: "bg-[#ecefeb] text-[#526056]",
};

export const vacationStyles: Record<Exclude<VacationStatus, "Storniert">, string> = {
  Beantragt: "bg-[#fff3d9] text-[#886719]",
  Genehmigt: "border border-[#398557] bg-[#ccebd2] font-semibold text-[#174c2e] ring-1 ring-inset ring-[#398557]",
  Abgelehnt: "border border-l-4 border-[#d6dcde] border-l-[#c54d3f] bg-[#eef0ed] text-[#66726a]",
};

export const absenceStyles: Record<AbsenceType, string> = {
  Urlaub: vacationStyles.Genehmigt,
  Krank: "border border-[#e69b93] bg-[#fce4e2] text-[#9b342b]",
  Schulung: "border border-[#8bcfc8] bg-[#d9f2ef] text-[#146b66]",
  Sonderurlaub: "border border-[#dfabc2] bg-[#f8e3ed] text-[#91405e]",
  "Sonstige Abwesenheit": "border border-[#d8cfc2] bg-[#f1eeea] text-[#716454]",
};

/** Feiertage und Sondertage werden nur markiert, die Schichtfarbe bleibt erhalten. */
export const holidayMarkerStyle = "border-t-4 border-t-[#c54d3f]";
export const holidayBadgeStyle = "bg-[#fde9e7] text-[#a33e31]";
export const companyDayMarkerStyle = "border-b-4 border-b-[#9272b6]";
export const companyDayBadgeStyle = "bg-[#f2eaf7] text-[#704d89]";
