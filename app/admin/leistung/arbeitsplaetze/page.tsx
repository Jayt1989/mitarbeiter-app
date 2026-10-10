import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/authorization";
import { listPerformanceWorkstations } from "@/lib/performance";
import { canManagePerformanceTargets, canViewPerformance, performanceAreas } from "@/lib/performance-rules";
import TargetForm from "./target-form";

export const metadata: Metadata = { title: "Arbeitsplatz-Sollwerte | Mitarbeiter-App" };

export default async function WorkstationTargetsPage() {
  const context = await getAuthorizationContext();
  if (!context) redirect("/login");
  if (!canManagePerformanceTargets(context)) redirect("/dashboard");
  const workstations = await listPerformanceWorkstations();
  return (
    <main className="min-h-screen bg-[#f4f6f2] text-[#1c2b23]">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
        <nav className="flex gap-4 text-sm font-medium text-[#41634f]" aria-label="Leistungsnavigation">
          <Link href="/dashboard">Dashboard</Link>
          {canViewPerformance(context) && <Link href="/admin/leistung">Leistungsauswertung</Link>}
        </nav>
        <h1 className="mt-6 text-2xl font-semibold sm:text-3xl">Sollwerte der Arbeitsplätze</h1>
        <p className="mt-3 text-sm text-[#5e7366]">
          Sollwerte in Stück pro Stunde gelten nur für neue Leistungseinträge. Bereits gespeicherte
          Sollwerte und Leistungsgrade bleiben unverändert. Ohne Sollwert ist die Erfassung weiterhin
          möglich; der Leistungsgrad bleibt dann dauerhaft ohne Bewertung.
        </p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {performanceAreas.map((area) => (
            <section key={area.id} className="rounded-xl border border-[#e0e7e0] bg-white p-5">
              <h2 className="text-lg font-semibold">{area.label}</h2>
              <div className="mt-4 space-y-3">
                {area.workstations.map((code) => {
                  const workstation = workstations.find((entry) => entry.code === code);
                  return workstation
                    ? <TargetForm key={code} code={code} targetPerHour={workstation.targetPerHour} />
                    : <p key={code} role="alert" className="text-sm text-[#9f422d]">{code}: Arbeitsplatz fehlt. Bitte Datenbankmigration ausführen.</p>;
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
