"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";

export type LoginState = { error: string | null };

const inactiveAccountMessage =
  "Dein Benutzerkonto ist nicht aktiv. Bitte wende dich an deinen Ansprechpartner.";

// Nur interne Pfade zulassen (kein Open Redirect); Host bleibt der aktuelle Request-Host.
function safeRedirectPath(callbackUrl: FormDataEntryValue | null) {
  if (typeof callbackUrl !== "string" || !callbackUrl) return "/dashboard";
  try {
    const url = new URL(callbackUrl, "http://internal");
    const path = `${url.pathname}${url.search}${url.hash}`;
    if (!path.startsWith("/") || path.startsWith("//") || url.pathname === "/login") {
      return "/dashboard";
    }
    return path;
  } catch {
    return "/dashboard";
  }
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const login = formData.get("login");
  const password = formData.get("password");
  if (typeof login !== "string" || typeof password !== "string" || !login.trim() || !password) {
    return { error: "Anmeldename oder Passwort ist falsch." };
  }

  const identifier = login.trim();
  try {
    await signIn("credentials", { login: identifier, password, redirect: false });
  } catch (error) {
    if (error instanceof CredentialsSignin && error.code === "inactive") {
      return { error: inactiveAccountMessage };
    }
    if (error instanceof AuthError) {
      return {
        error: error.type === "CredentialsSignin"
          ? "Anmeldename oder Passwort ist falsch."
          : "Die Anmeldung ist derzeit nicht möglich.",
      };
    }
    throw error;
  }

  // Mit Startpasswort direkt zur Pflicht-Passwortänderung (der Proxy erzwingt das zusätzlich).
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { login: { equals: identifier, mode: "insensitive" } },
        { email: { equals: identifier, mode: "insensitive" } },
      ],
    },
    select: { mustChangePassword: true },
  });
  redirect(user?.mustChangePassword ? "/passwort-aendern" : safeRedirectPath(formData.get("callbackUrl")));
}
