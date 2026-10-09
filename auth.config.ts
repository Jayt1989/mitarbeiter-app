import type { NextAuthConfig } from "next-auth";

function hasPermission(
  permissions: Record<string, boolean> | undefined,
  permission: string,
) {
  return permissions?.[permission] === true;
}

export const passwordChangePath = "/passwort-aendern";

const loginRequiredPrefixes = [
  "/admin", "/mitarbeiter", "/schichtplan", "/schichttausch", "/leistung", "/urlaub", "/export",
  "/profil", passwordChangePath,
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
      if (path.startsWith("/admin/schichttausch")) {
        return (role === "ADMIN" || role === "FOREMAN") &&
          hasPermission(permissions, "approveShiftSwap");
      }
      // Die Leistungsrechte prüfen Seite und Server Actions mit aktuellen DB-Rechten, damit
      // bestehende Sitzungen nach der Migration nicht erst neu angemeldet werden müssen.
      if (path.startsWith("/admin/leistung")) {
        return role === "ADMIN" || role === "FOREMAN";
      }
      if (path.startsWith("/schichttausch")) {
        return hasPermission(permissions, "requestShiftSwap");
      }
      if (path.startsWith("/admin/qualifikationen")) {
        return hasPermission(permissions, "viewQualifications") ||
          hasPermission(permissions, "editQualifications") ||
          hasPermission(permissions, "manageQualifications");
      }
      if (path.startsWith("/admin/mindestbesetzung")) {
        return hasPermission(permissions, "editMinimumStaffing") &&
          hasPermission(permissions, "editDepartments");
      }
      if (path.startsWith("/admin/urlaub")) {
        return role === "ADMIN" && hasPermission(permissions, "openAdmin") &&
          (hasPermission(permissions, "otherVacations") ||
            hasPermission(permissions, "approveVacation"));
      }
      if (path.startsWith("/admin")) {
        return role === "ADMIN" && hasPermission(permissions, "openAdmin");
      }
      if (path.startsWith("/mitarbeiter")) {
        return hasPermission(permissions, "viewEmployees");
      }
      if (path.startsWith("/schichtplan")) {
        return hasPermission(permissions, "ownShiftPlan") ||
          hasPermission(permissions, "teamShiftPlan");
      }
      if (path.startsWith("/urlaub")) {
        return hasPermission(permissions, "requestVacation") ||
          hasPermission(permissions, "ownVacation") ||
          hasPermission(permissions, "otherVacations");
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
