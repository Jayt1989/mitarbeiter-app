"use server";

import { redirect } from "next/navigation";
import { auth, signIn, signOut } from "@/auth";
import { AccountError, changeOwnPassword } from "@/lib/user-accounts";

export type PasswordChangeState = { error: string | null; success: boolean; reauthenticated?: boolean };

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function changePassword(
  currentPassword: string | null,
  formData: FormData,
  successPath: string,
): Promise<PasswordChangeState> {
  const session = await auth();
  // Die Benutzer-ID stammt ausschließlich aus der Sitzung – fremde Konten sind nicht erreichbar.
  if (!session?.user?.id) return { error: "Bitte melde dich erneut an.", success: false };

  const newPassword = field(formData, "newPassword");
  let login: string;
  try {
    ({ login } = await changeOwnPassword(
      session.user.id,
      currentPassword,
      newPassword,
      field(formData, "confirmPassword"),
    ));
  } catch (error) {
    if (error instanceof AccountError) return { error: error.message, success: false };
    console.error("Passwortänderung fehlgeschlagen", error instanceof Error ? error.name : "unknown");
    return { error: "Das Passwort konnte nicht geändert werden. Bitte versuche es erneut.", success: false };
  }

  // Die bisherige Sitzung ist durch die Passwortänderung ungültig; neue Sitzung ausstellen.
  try {
    await signIn("credentials", { login, password: newPassword, redirect: false });
  } catch {
    return { error: null, success: true, reauthenticated: false };
  }
  // Redirect statt Re-Render: Next rendert das Ziel bereits mit dem neuen Sitzungs-Cookie.
  redirect(successPath);
}

export async function changeInitialPasswordAction(
  _prev: PasswordChangeState,
  formData: FormData,
): Promise<PasswordChangeState> {
  return changePassword(null, formData, "/passwort-aendern");
}

export async function changePasswordAction(
  _prev: PasswordChangeState,
  formData: FormData,
): Promise<PasswordChangeState> {
  return changePassword(field(formData, "currentPassword"), formData, "/profil?passwort=geaendert");
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
