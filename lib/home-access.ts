import { canAccessPage, type AccessContext } from "./access-policy";

export function homeDestinations(context: AccessContext) {
  const can = (path: string) => canAccessPage(context, path);
  return {
    shiftPlan: can("/schichtplan") ? "/schichtplan" : null,
    vacation: can("/urlaub") ? "/urlaub" : can("/admin/urlaub") ? "/admin/urlaub" : null,
    employees: can("/mitarbeiter") ? "/mitarbeiter" : null,
    admin: can("/admin") ? "/admin" : null,
    personal: can("/dashboard") ? "/dashboard" : null,
    qualifications: can("/admin/qualifikationen") ? "/admin/qualifikationen"
      : can("/dashboard") && context.permissions.ownQualifications === true ? "/dashboard#meine-qualifikationen" : null,
    shiftSwap: can("/schichttausch") ? "/schichttausch"
      : can("/admin/schichttausch") ? "/admin/schichttausch" : null,
    additionalShifts: can("/admin/zusatzschichten") ? "/admin/zusatzschichten"
      : context.permissions.ownShiftPlan === true && can("/schichtplan") ? "/schichtplan" : null,
    messages: can("/nachrichten") ? "/nachrichten" : null,
  };
}
