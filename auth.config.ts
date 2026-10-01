import type { NextAuthConfig } from "next-auth";

function hasPermission(
  permissions: Record<string, boolean> | undefined,
  permission: string,
) {
  return permissions?.[permission] === true;
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
      if (path === "/login") return true;
      if (!auth?.user) {
        const targetUrl = new URL(request.url);
        const forwardedHost = request.headers.get("x-forwarded-host")
          ?.split(",")[0]
          ?.trim();
        const host = forwardedHost || request.headers.get("host");
        if (host) targetUrl.host = host;

        const forwardedProtocol = request.headers.get("x-forwarded-proto")
          ?.split(",")[0]
          ?.trim();
        if (forwardedProtocol === "http" || forwardedProtocol === "https") {
          targetUrl.protocol = `${forwardedProtocol}:`;
        }

        const loginUrl = new URL("/login", targetUrl);
        loginUrl.searchParams.set("callbackUrl", targetUrl.toString());
        return Response.redirect(loginUrl);
      }

      const { role, permissions } = auth.user;
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
