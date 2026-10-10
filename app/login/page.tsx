import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Anmelden | TeamPlan",
  description: "Bei TeamPlan anmelden.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : undefined;

  // Zugangsdaten dürfen nie in der URL bleiben (z. B. Lesezeichen/Verlauf alter Versionen).
  if ("password" in params || "login" in params) {
    redirect(callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login");
  }

  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f6f2] px-4 py-10 text-[#1c2b23]">
      <section className="w-full max-w-md rounded-xl border border-[#e0e7e0] bg-white p-6 shadow-[0_8px_30px_rgba(28,43,35,0.07)] sm:p-8">
        <div className="mb-7 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-[#174c37] text-sm font-bold text-white">
            TP
          </span>
          <div>
            <p className="text-xs font-semibold tracking-[0.1em] text-[#668071]">TeamPlan</p>
            <h1 className="mt-0.5 text-xl font-semibold">Anmelden</h1>
          </div>
        </div>
        <LoginForm callbackUrl={callbackUrl} />
      </section>
    </main>
  );
}