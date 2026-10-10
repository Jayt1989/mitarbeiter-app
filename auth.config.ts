import type { NextAuthConfig } from "next-auth";
import { canAccessPage } from "./lib/access-policy";

export const passwordChangePath = "/passwort-aendern";

const loginRequiredPrefixes = [
  "/admin", "/mitarbeiter", "/schichtplan", "/schichttausch", "/leistung", "/urlaub", "/export",
  "/profil", "/dashboard", "/nachrichten", "/benachrichtigungen", passwordChangePath,
];

// Proxy hinter Vercel/Reverse-Proxy: öffentlichen Host und Protokoll für Weiterleitungen verwenden.
function publicRequestUrl(request: Request) {
  const targetUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host");
  if (host) targetUrl.host = host;
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedProtocol === "http" || forwardedProtocol === "https") {
    targetUrl.protocol = `${forwardedProtocol}:`;
  }
  return targetUrl;
}

export const authConfig = {
  providers: [],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      if (path === "/login" || path.startsWith("/api/auth")) return true;
      if (!auth?.user) {
        // APIs antworten selbst mit 401; Seiten prüfen die Sitzung zusätzlich serverseitig.
        if (!loginRequiredPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
          return true;
        }
        const loginUrl = new URL("/login", publicRequestUrl(request));
        loginUrl.searchParams.set("callbackUrl", publicRequestUrl(request).toString());
        return Response.redirect(loginUrl);
      }

      if (auth.user.mustChangePassword) {
        if (path === passwordChangePath) return true;
        if (path.startsWith("/api/")) {
          return Response.json(
            { error: "Bitte zuerst ein eigenes Passwort festlegen." },
            { status: 403 },
          );
        }
        return Response.redirect(new URL(passwordChangePath, publicRequestUrl(request)));
      }

      const { role, permissions } = auth.user;
      if (!canAccessPage({ role, employeeId: auth.user.employeeId, permissions: permissions ?? {} }, path)) {
        return Response.redirect(new URL("/", publicRequestUrl(request)));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
