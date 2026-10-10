import { hasPermission, type AuthorizationContext } from "@/lib/authorization";

export type ExportAccess = {
  /** Team- und Gesamtexporte (alle Mitarbeiter). */
  team: boolean;
  /** Eigener Jahresplan. */
  own: boolean;
};

export function getExportAccess(context: AuthorizationContext): ExportAccess {
  return {
    team: hasPermission(context, "exportReports") || hasPermission(context, "viewReports"),
    own: context.employeeId !== null && hasPermission(context, "ownShiftPlan"),
  };
}
