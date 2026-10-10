import type { ActiveShift, EmployeeShiftPlan } from "../schichtplan/rotation";
import type { Employee, EmployeeShiftGroup } from "./data";

const rotationAnchor = "2025-12-29";
const groupStartShifts: Record<EmployeeShiftGroup, ActiveShift> = {
  "Gruppe A": "Früh",
  "Gruppe B": "Nacht",
  "Gruppe C": "Spät",
  "Keine Gruppe": "Früh",
};

export function toEmployeeShiftPlan(employee: Employee): EmployeeShiftPlan {
  const overrides = employee.individualAssignments;
  const additionalShifts = employee.additionalShifts;
  switch (employee.shiftModel) {
    case "3-schicht":
      return {
        employeeId: employee.id,
        overrides,
        additionalShifts,
        model: "3-schicht",
        startShift: groupStartShifts[employee.shiftGroup],
        anchorMonday: rotationAnchor,
      };
    case "2-schicht":
      return {
        employeeId: employee.id,
        overrides,
        additionalShifts,
        model: "2-schicht",
        startShift: "Früh",
        anchorMonday: rotationAnchor,
      };
    case "nur-frueh":
      return { employeeId: employee.id, model: "nur-frueh", overrides, additionalShifts };
    case "nur-spaet":
      return { employeeId: employee.id, model: "nur-spaet", overrides, additionalShifts };
    case "individuell":
      return {
        employeeId: employee.id,
        model: "individuell",
        additionalShifts,
        assignments: employee.individualAssignments ?? {},
      };
  }
}