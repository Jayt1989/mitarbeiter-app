import type { Metadata } from "next";
import { requirePageAccess } from "@/lib/page-access";
import AdditionalShiftManagement from "./additional-shift-management";

export const metadata: Metadata = { title: "Zusatzschichten / Wochenendarbeit | Mitarbeiter-App" };
export default async function AdditionalShiftPage() {
  const context = await requirePageAccess("/admin/zusatzschichten");
  return <AdditionalShiftManagement permissions={context.permissions} />;
}
