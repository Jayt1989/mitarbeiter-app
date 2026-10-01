"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export type LoginState = { error: string | null };

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

  try {
    await signIn("credentials", {
      login: login.trim(),
      password,
      redirectTo: safeRedirectPath(formData.get("callbackUrl")),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error: error.type === "CredentialsSignin"
          ? "Anmeldename oder Passwort ist falsch."
          : "Die Anmeldung ist derzeit nicht möglich.",
      };
    }
    // Erfolgreicher Login wirft NEXT_REDIRECT – muss weitergereicht werden.
    throw error;
  }

  return { error: null };
}
