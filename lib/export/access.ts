import type { AuthorizationContext } from "@/lib/authorization";

export type ExportAccess = {
  /** Team- und Gesamtexporte (alle Mitarbeiter). */
  team: boolean;
  /** Eigener Jahresplan. */
  own: boolean;
};

export function getExportAccess(context: AuthorizationContext): ExportAccess {
  return {
    team: context.permissions.exportReports === true || context.permissions.viewReports === true,
    own: context.permissions.ownShiftPlan === true,
  };
}
