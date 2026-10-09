import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

const credentialsSchema = z.object({
  login: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(200),
});

/** Wird nur bei korrektem Passwort geworfen, damit keine Konten ausgespäht werden können. */
export class InactiveAccountError extends CredentialsSignin {
  code = "inactive";
}

let dummyHash: Promise<string> | null = null;
// Gleicht die Antwortzeit für unbekannte Anmeldenamen an (kein Konto-Enumerieren über Timing).
function getDummyHash() {
  dummyHash ??= hash("timing-equalizer-not-a-password", 12);
  return dummyHash;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        login: { label: "E-Mail oder Personalnummer", type: "text" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const identifier = parsed.data.login;
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { login: { equals: identifier, mode: "insensitive" } },
              { email: { equals: identifier, mode: "insensitive" } },
            ],
          },
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
            employee: { include: { permissions: { include: { permission: true } } } },
          },
        });

        if (!user) {
          await compare(parsed.data.password, await getDummyHash());
          return null;
        }
        if (!await compare(parsed.data.password, user.passwordHash)) return null;
        if (!user.active || user.employee?.isActive === false) {
          throw new InactiveAccountError();
        }

        const permissions = Object.fromEntries(
          user.role.permissions.map((entry) => [entry.permission.key, entry.allowed]),
        );
        for (const entry of user.employee?.permissions ?? []) {
          permissions[entry.permission.key] = entry.allowed;
        }

        return {
          id: user.id,
          name: user.employee
            ? `${user.employee.firstName} ${user.employee.lastName}`
            : user.email ?? user.login,
          email: user.email,
          role: user.role.code,
          employeeId: user.employeeId,
          permissions,
          mustChangePassword: user.mustChangePassword,
          passwordChangedAt: user.passwordChangedAt?.getTime() ?? null,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.employeeId = user.employeeId;
        token.permissions = user.permissions;
        token.mustChangePassword = user.mustChangePassword;
        token.passwordChangedAt = user.passwordChangedAt;
        return token;
      }
      if (!token.sub) return null;
      // Bei jeder Anfrage gegen die Datenbank prüfen: deaktivierte Konten und Sitzungen,
      // deren Passwort inzwischen geändert/zurückgesetzt wurde, werden sofort beendet.
      const current = await prisma.user.findUnique({
        where: { id: token.sub },
        select: {
          active: true,
          mustChangePassword: true,
          passwordChangedAt: true,
          employee: { select: { isActive: true } },
        },
      });
      if (!current?.active || current.employee?.isActive === false) return null;
      if ((current.passwordChangedAt?.getTime() ?? null) !== (token.passwordChangedAt ?? null)) {
        return null;
      }
      token.mustChangePassword = current.mustChangePassword;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const authToken = token as typeof token & {
          role?: string;
          employeeId?: string | null;
          permissions?: Record<string, boolean>;
          mustChangePassword?: boolean;
        };
        session.user.mustChangePassword = authToken.mustChangePassword === true;
        session.user.id = authToken.sub ?? "";
        session.user.role = authToken.role ?? "EMPLOYEE";
        session.user.employeeId = authToken.employeeId ?? null;
        session.user.permissions = authToken.permissions ?? {};
      }
      return session;
    },
  },
});
