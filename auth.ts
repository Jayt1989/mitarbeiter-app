import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

const credentialsSchema = z.object({
  login: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(200),
});

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
            active: true,
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

        if (!user || !await compare(parsed.data.password, user.passwordHash)) {
          return null;
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
            : user.email,
          email: user.email,
          role: user.role.code,
          employeeId: user.employeeId,
          permissions,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        const authUser = user as {
          role: string;
          employeeId: string | null;
          permissions: Record<string, boolean>;
        };
        token.role = authUser.role;
        token.employeeId = authUser.employeeId;
        token.permissions = authUser.permissions;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const authToken = token as typeof token & {
          role?: string;
          employeeId?: string | null;
          permissions?: Record<string, boolean>;
        };
        session.user.id = authToken.sub ?? "";
        session.user.role = authToken.role ?? "EMPLOYEE";
        session.user.employeeId = authToken.employeeId ?? null;
        session.user.permissions = authToken.permissions ?? {};
      }
      return session;
    },
  },
});
