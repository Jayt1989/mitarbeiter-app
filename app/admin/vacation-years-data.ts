export type VacationAccountDto = {
  employeeId: string;
  year: number;
  annualAllowance: number;
  carryOverDays: number;
};

export type VacationYearRow = {
  employeeId: string;
  name: string;
  personnelNumber: string;
  shiftModel: string;
  shiftGroup: string;
  previous: {
    hasAccount: boolean;
    annualAllowance: number;
    carryOverDays: number;
    approvedDays: number;
    remainingDays: number;
  };
  next: {
    exists: boolean;
    annualAllowance: number;
    carryOverDays: number;
  };
};

export type VacationYearEntry = {
  employeeId: string;
  annualAllowance: number;
  carryOverDays: number;
};

export const MAX_VACATION_DAYS = 365;

export function isValidYear(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 2000 && value <= 2100;
}
