import { redirect } from "next/navigation";
import { getAuthorizationContext } from "./authorization";
import { canAccessPage } from "./access-policy";

export async function requirePageAccess(path: string) {
  const context = await getAuthorizationContext();
  if (!context) redirect("/login");
  if (!canAccessPage(context, path)) redirect("/");
  return context;
}
