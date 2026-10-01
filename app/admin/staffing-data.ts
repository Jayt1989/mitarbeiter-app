export const absenceTypes = [
  "Urlaub",
  "Krank",
  "Schulung",
  "Sonderurlaub",
  "Sonstige Abwesenheit",
] as const;

export type AbsenceType = (typeof absenceTypes)[number];
export type AbsenceApproval = "Genehmigt" | "Erfasst" | "Beantragt";

export type AbsenceEntry = {
  employeeId: string;
  startDate: string;
  endDate: string;
  type: AbsenceType;
  approval: AbsenceApproval;
};

export const sampleAbsences: AbsenceEntry[] = [
  {
    employeeId: "employee-1002",
    startDate: "2026-10-12",
    endDate: "2026-10-12",
    type: "Krank",
    approval: "Erfasst",
  },
  {
    employeeId: "employee-1003",
    startDate: "2026-10-14",
    endDate: "2026-10-14",
    type: "Schulung",
    approval: "Genehmigt",
  },
  {
    employeeId: "employee-1002",
    startDate: "2026-10-15",
    endDate: "2026-10-15",
    type: "Sonstige Abwesenheit",
    approval: "Genehmigt",
  },
  {
    employeeId: "employee-1004",
    startDate: "2026-10-16",
    endDate: "2026-10-16",
    type: "Sonderurlaub",
    approval: "Genehmigt",
  },
];
