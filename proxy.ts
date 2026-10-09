export { auth as proxy } from "./auth";

export const config = {
  // Alle Seiten und APIs außer statischen Dateien, damit ein erzwungener Passwortwechsel
  // nicht per direkter URL umgangen werden kann. Auth.js-Endpunkte bleiben frei zugänglich.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon\\.ico|icons/|manifest\\.webmanifest|.*\\.(?:png|jpg|jpeg|svg|ico|webp|txt|xml)$).*)",
  ],
};
