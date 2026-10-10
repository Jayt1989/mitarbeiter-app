import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logoutAction } from "@/app/profil/actions";
import { LogoutButton } from "@/app/components/password-field";
import InitialPasswordForm, { PasswordChangedNotice } from "./initial-password-form";

export const metadata: Metadata = {
  title: "Neues Passwort festlegen | TeamPlan",
};

function changedWithinLastMinute(changedAt: Date | null) {
  return !!changedAt && Date.now() - changedAt.getTime() < 60_000;
}

export default async function PasswordChangePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mustChangePassword: true, passwordChangedAt: true },
  });
  if (!user) redirect("/login");
  // Nach dem Speichern rendert Next die Seite mit der neuen Sitzung erneut: kurz die Bestätigung zeigen.
  if (!user.mustChangePassword && !changedWithinLastMinute(user.passwordChangedAt)) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f6f2] px-4 py-10 text-[#1c2b23]">
      <section className="w-full max-w-md rounded-xl border border-[#e0e7e0] bg-white p-6 shadow-[0_8px_30px_rgba(28,43,35,0.07)] sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#174c37] text-sm font-bold text-white">
            TP
          </span>
          <div>
            <p className="text-xs font-semibold tracking-[0.1em] text-[#668071]">TeamPlan</p>
            <h1 className="mt-0.5 text-xl font-semibold">Neues Passwort festlegen</h1>
          </div>
        </div>
        <p className="mb-6 text-sm leading-6 text-[#526056]">
          Du verwendest aktuell ein Startpasswort. Bitte lege jetzt dein persönliches Passwort fest.
        </p>
        {user.mustChangePassword ? <InitialPasswordForm /> : <PasswordChangedNotice />}
        <form action={logoutAction} className="mt-6 border-t border-[#edf1ec] pt-5 text-center">
          <LogoutButton className="text-sm font-medium text-[#526056] underline-offset-4 hover:underline" />
        </form>
      </section>
    </main>
  );
}
