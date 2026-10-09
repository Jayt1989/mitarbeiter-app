import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import NotificationBell from "@/app/components/notification-bell";
import { LogoutButton } from "@/app/components/password-field";
import { logoutAction } from "./actions";
import ChangePasswordForm from "./change-password-form";

export const metadata: Metadata = { title: "Profil | Mitarbeiter-App" };

const dateFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin",
});

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const passwordChanged = (await searchParams).passwort === "geaendert";
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      login: true, email: true, mustChangePassword: true, passwordChangedAt: true,
      role: { select: { name: true } },
      employee: { select: { firstName: true, lastName: true, personnelNumber: true } },
    },
  });
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/passwort-aendern");

  const name = user.employee ? `${user.employee.firstName} ${user.employee.lastName}` : user.login;
  const details: [string, string][] = [
    ["Name", name],
    ["Personalnummer", user.employee?.personnelNumber ?? user.login],
    ["E-Mail", user.email ?? "–"],
    ["Rolle", user.role.name],
    ["Passwort zuletzt geändert", user.passwordChangedAt ? dateFormat.format(user.passwordChangedAt) : "–"],
  ];

  return (
    <main className="min-h-screen bg-[#f4f6f2] text-[#1c2b23]">
      <header className="border-b border-[#dce4dc] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-3 rounded-lg">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#174c37] text-sm font-bold text-white">MA</span>
            <span className="hidden text-sm font-semibold sm:inline">MITARBEITERPORTAL</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Hauptnavigation">
            <Link href="/dashboard" className="rounded-lg px-2 py-2 text-sm font-medium text-[#41634f] hover:bg-[#edf3ee]">Dashboard</Link>
            <NotificationBell />
          </nav>
        </div>
      </header>
      <div className="mx-auto grid max-w-5xl gap-6 px-4 pb-14 pt-8 sm:px-8 sm:pt-12 lg:grid-cols-[1fr_1.2fr]">
        <section className="rounded-xl border border-[#e0e7e0] bg-white p-5 shadow-[0_8px_30px_rgba(28,43,35,0.05)] sm:p-6">
          <p className="text-xs font-semibold tracking-[0.1em] text-[#668071]">PROFIL</p>
          <h1 className="mt-1 text-2xl font-semibold">{name}</h1>
          <dl className="mt-5 divide-y divide-[#edf1ec] text-sm">
            {details.map(([label, value]) => (
              <div key={label} className="flex flex-wrap justify-between gap-2 py-2.5">
                <dt className="text-[#6f7c73]">{label}</dt>
                <dd className="font-medium break-all">{value}</dd>
              </div>
            ))}
          </dl>
          <form action={logoutAction} className="mt-5">
            <LogoutButton />
          </form>
        </section>
        <section className="rounded-xl border border-[#e0e7e0] bg-white p-5 shadow-[0_8px_30px_rgba(28,43,35,0.05)] sm:p-6">
          <h2 className="text-lg font-semibold">Passwort ändern</h2>
          <p className="mt-1 mb-5 text-sm text-[#526056]">
            Zur Bestätigung benötigen wir dein aktuelles Passwort.
          </p>
          {passwordChanged && (
            <p role="status" className="mb-5 rounded-lg border border-[#cfe3d4] bg-[#eef7f0] px-3 py-2.5 text-sm text-[#174c37]">
              Dein Passwort wurde erfolgreich geändert.
            </p>
          )}
          <ChangePasswordForm />
        </section>
      </div>
    </main>
  );
}
