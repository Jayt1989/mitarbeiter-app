type AccessContext = { role: string; permissions: Record<string, boolean> };

const ownPermissions = new Set([
  "ownShiftPlan", "requestVacation", "ownVacation", "ownQualifications",
  "requestShiftSwap", "recordPerformance",
]);
const adminPermissions = new Set(["openAdmin", "editEmployees"]);

export function effectivePermissions(role: string, permissions: Record<string, boolean>) {
  return Object.fromEntries(Object.entries(permissions).map(([key, allowed]) => [
    key, allowed === true && (role === "ADMIN" ||
      (role === "FOREMAN" && !adminPermissions.has(key)) ||
      (role === "EMPLOYEE" && ownPermissions.has(key))),
  ]));
}

export function permitted(context: AccessContext, permission: string) {
  return effectivePermissions(context.role, context.permissions)[permission] === true;
}

export function canAccessPage(context: AccessContext, path: string) {
  const has = (key: string) => permitted(context, key);
  const at = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
  const manager = context.role === "ADMIN" || context.role === "FOREMAN";
  if (at("/admin/zusatzschichten")) return manager && has("viewAdditionalShifts");
  if (at("/admin/leistung/arbeitsplaetze")) return manager && has("managePerformanceTargets");
  if (at("/admin/leistung")) return manager && has("viewPerformance");
  if (at("/admin/schichttausch")) return manager && has("approveShiftSwap");
  if (at("/admin/qualifikationen")) return manager &&
    (has("viewQualifications") || has("editQualifications") || has("manageQualifications"));
  if (at("/admin/urlaub")) return manager && (has("otherVacations") || has("approveVacation"));
  if (at("/admin/mindestbesetzung")) return manager && has("editMinimumStaffing") && has("editDepartments");
  if (at("/admin/einsatzplanung")) return manager && has("editAssignments");
  if (at("/admin/einstellungen")) return manager && has("editCalendar");
  if (at("/admin/jahreswechsel")) return manager && has("manageVacationYears");
  if (at("/admin/export")) return manager && (has("exportReports") || has("viewReports"));
  if (at("/admin/wochenplan")) return manager && (has("teamShiftPlan") ||
    (has("openAdmin") && (has("viewEmployees") || has("editEmployees"))));
  if (at("/admin")) return context.role === "ADMIN" && has("openAdmin");
  if (at("/mitarbeiter")) return manager && (has("viewEmployees") || has("editEmployees"));
  if (at("/schichtplan")) return has("ownShiftPlan") || has("teamShiftPlan");
  if (at("/schichttausch")) return has("requestShiftSwap");
  if (at("/leistung")) return has("recordPerformance");
  if (at("/urlaub")) return has("requestVacation") || has("ownVacation") || has("otherVacations");
  return true;
}
