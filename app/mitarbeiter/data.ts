import type { Shift, ShiftModelId } from "../schichtplan/rotation";

export const employeeRoles = ["Mitarbeiter", "Vorarbeiter", "Admin"] as const;
export type EmployeeRole = (typeof employeeRoles)[number];

export const shiftGroups = [
  "Gruppe A",
  "Gruppe B",
  "Gruppe C",
  "Keine Gruppe",
] as const;
export type EmployeeShiftGroup = (typeof shiftGroups)[number];

export type EmployeePermissions = {
  ownShiftPlan: boolean;
  teamShiftPlan: boolean;
  requestVacation: boolean;
  ownVacation: boolean;
  otherVacations: boolean;
  approveVacation: boolean;
  viewEmployees: boolean;
  editEmployees: boolean;
  editShiftPlans: boolean;
  recordAbsence: boolean;
  openAdmin: boolean;
  editMinimumStaffing: boolean;
  editDepartments: boolean;
  editQualifications: boolean;
  viewQualifications: boolean;
  manageQualifications: boolean;
  ownQualifications: boolean;
  editAssignments: boolean;
  editCalendar: boolean;
  manageVacationYears: boolean;
  exportReports: boolean;
  viewReports: boolean;
  requestShiftSwap: boolean;
  approveShiftSwap: boolean;
  recordPerformance: boolean;
  viewPerformance: boolean;
};

export const permissionOptions = [
  { id: "ownShiftPlan", label: "Eigenen Schichtplan sehen" },
  { id: "teamShiftPlan", label: "Team-Schichtplan sehen" },
  { id: "requestVacation", label: "Urlaub beantragen" },
  { id: "ownVacation", label: "Eigenen Urlaub sehen" },
  { id: "otherVacations", label: "Urlaub anderer sehen" },
  { id: "approveVacation", label: "Urlaub genehmigen" },
  { id: "viewEmployees", label: "Mitarbeiter sehen" },
  { id: "editEmployees", label: "Mitarbeiter bearbeiten" },
  { id: "editShiftPlans", label: "Schichtpläne bearbeiten" },
  { id: "recordAbsence", label: "Abwesenheiten eintragen" },
  { id: "openAdmin", label: "Adminbereich öffnen" },
  { id: "editMinimumStaffing", label: "Mindestbesetzung bearbeiten" },
  { id: "editDepartments", label: "Bereiche bearbeiten" },
  { id: "editQualifications", label: "Qualifikationen bearbeiten" },
  { id: "viewQualifications", label: "Qualifikationen sehen" },
  { id: "manageQualifications", label: "Qualifikationen verwalten" },
  { id: "ownQualifications", label: "Eigene Qualifikationen sehen" },
  { id: "editAssignments", label: "Einsatzplanung bearbeiten" },
  { id: "editCalendar", label: "Feiertage & Kalender bearbeiten" },
  { id: "manageVacationYears", label: "Urlaubsjahre verwalten" },
  { id: "exportReports", label: "Exporte erstellen" },
  { id: "viewReports", label: "Auswertungen sehen" },
  { id: "requestShiftSwap", label: "Eigenen Schichttausch anfragen und beantworten" },
  { id: "approveShiftSwap", label: "Schichttausch prüfen und genehmigen" },
  { id: "recordPerformance", label: "Eigene Leistung erfassen" },
  { id: "viewPerformance", label: "Leistungen auswerten" },
] as const satisfies ReadonlyArray<{
  id: keyof EmployeePermissions;
  label: string;
}>;

export type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  personnelNumber: string;
  email: string;
  role: EmployeeRole;
  shiftModel: ShiftModelId;
  shiftGroup: EmployeeShiftGroup;
  areaId: string | null;
  isActive: boolean;
  annualLeaveAllowance: number;
  carryOverLeaveDays: number;
  permissions: EmployeePermissions;
  individualAssignments?: Readonly<Record<string, Shift>>;
  qualifications?: Readonly<Record<string, number>>;
  account?: EmployeeAccount | null;
};

export type EmployeeAccount = {
  login: string;
  active: boolean;
  mustChangePassword: boolean;
};

function makePermissions(
  overrides: Partial<EmployeePermissions> = {},
): EmployeePermissions {
  return {
    ownShiftPlan: true,
    teamShiftPlan: false,
    requestVacation: true,
    ownVacation: true,
    otherVacations: false,
    approveVacation: false,
    viewEmployees: false,
    editEmployees: false,
    editShiftPlans: false,
    recordAbsence: false,
    openAdmin: false,
    editMinimumStaffing: false,
    editDepartments: false,
    editQualifications: false,
    viewQualifications: false,
    manageQualifications: false,
    ownQualifications: true,
    editAssignments: false,
    editCalendar: false,
    manageVacationYears: false,
    exportReports: false,
    viewReports: false,
    requestShiftSwap: true,
    approveShiftSwap: false,
    recordPerformance: true,
    viewPerformance: false,
    ...overrides,
  };
}

const foremanPermissions = makePermissions({
  teamShiftPlan: true,
  otherVacations: true,
  viewEmployees: true,
  editShiftPlans: true,
  recordAbsence: true,
  viewQualifications: true,
  approveShiftSwap: true,
  viewPerformance: true,
});

const adminPermissions = Object.fromEntries(
  permissionOptions.map(({ id }) => [id, true]),
) as EmployeePermissions;

export const sampleEmployees: Employee[] = [
  {
    id: "employee-1001",
    firstName: "Mia",
    lastName: "Schneider",
    personnelNumber: "MA-1001",
    email: "mia.schneider@example.com",
    role: "Admin",
    shiftModel: "3-schicht",
    shiftGroup: "Gruppe A",
    areaId: "packaging",
    isActive: true,
    annualLeaveAllowance: 30,
    carryOverLeaveDays: 2,
    permissions: adminPermissions,
    qualifications: { packaging: 3, picking: 2 },
  },
  {
    id: "employee-1002",
    firstName: "Jonas",
    lastName: "Weber",
    personnelNumber: "MA-1002",
    email: "jonas.weber@example.com",
    role: "Vorarbeiter",
    shiftModel: "2-schicht",
    shiftGroup: "Gruppe B",
    areaId: "autosort",
    isActive: true,
    annualLeaveAllowance: 28,
    carryOverLeaveDays: 1,
    permissions: foremanPermissions,
    qualifications: { autosort: 3, "high-rack": 1 },
  },
  {
    id: "employee-1003",
    firstName: "Lena",
    lastName: "Fischer",
    personnelNumber: "MA-1003",
    email: "lena.fischer@example.com",
    role: "Mitarbeiter",
    shiftModel: "nur-frueh",
    shiftGroup: "Gruppe A",
    areaId: "packaging",
    isActive: true,
    annualLeaveAllowance: 30,
    carryOverLeaveDays: 2,
    permissions: makePermissions(),
    qualifications: { packaging: 2, picking: 3 },
  },
  {
    id: "employee-1004",
    firstName: "Emir",
    lastName: "Yilmaz",
    personnelNumber: "MA-1004",
    email: "emir.yilmaz@example.com",
    role: "Mitarbeiter",
    shiftModel: "nur-spaet",
    shiftGroup: "Gruppe C",
    areaId: "loading",
    isActive: true,
    annualLeaveAllowance: 28,
    carryOverLeaveDays: 0,
    permissions: makePermissions(),
    qualifications: { loading: 2 },
  },
  {
    id: "employee-1005",
    firstName: "Sophie",
    lastName: "Bauer",
    personnelNumber: "MA-1005",
    email: "sophie.bauer@example.com",
    role: "Mitarbeiter",
    shiftModel: "individuell",
    shiftGroup: "Keine Gruppe",
    areaId: null,
    isActive: false,
    annualLeaveAllowance: 30,
    carryOverLeaveDays: 2,
    permissions: makePermissions({ requestVacation: false }),
  },
];

export function createEmployeeDraft(): Employee {
  return {
    id: "",
    firstName: "",
    lastName: "",
    personnelNumber: "",
    email: "",
    role: "Mitarbeiter",
    shiftModel: "3-schicht",
    shiftGroup: "Keine Gruppe",
    areaId: null,
    isActive: true,
    annualLeaveAllowance: 30,
    carryOverLeaveDays: 0,
    permissions: makePermissions(),
  };
}