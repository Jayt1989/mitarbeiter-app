import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      employeeId: string | null;
      permissions: Record<string, boolean>;
    } & DefaultSession["user"];
  }

  interface User {
    role: string;
    employeeId: string | null;
    permissions: Record<string, boolean>;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    employeeId?: string | null;
    permissions?: Record<string, boolean>;
  }
}
