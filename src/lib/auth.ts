import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { Role } from "@prisma/client";
import { authConfig } from "./auth.config";

const ROLE_PRIORITY: Role[] = ["ADMIN", "HR", "MANAGER", "ACCOUNTANT", "STAFF", "INTERN"];

const DEFAULT_PASSWORD = process.env.DEFAULT_EMPLOYEE_PASSWORD || "Password123";

function getPrimaryRole(roles: Role[]): Role {
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r;
  }
  return "STAFF";
}

async function checkPassword(stored: string, input: string): Promise<boolean> {
  if (!stored) {
    // No password set — allow default password
    return input === DEFAULT_PASSWORD;
  }
  return bcrypt.compare(input, stored);
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      role: Role;
      roles: Role[];
      employeeId?: string;
      needsSetup?: boolean;
      name?: string;
    };
  }

  interface User {
    role: Role;
    roles: Role[];
    employeeId?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
              params: {
                prompt: "select_account",
                access_type: "offline",
                response_type: "code",
              },
            },
          }),
        ]
      : []),
    // Password login
    Credentials({
      id: "credentials",
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: { employee: true },
        });

        if (!user) return null;

        const valid = await checkPassword(user.password, credentials.password as string);
        if (!valid) return null;

        if (user.employee?.status === "INACTIVE") return null;

        const roles = user.roles.length > 0 ? user.roles : ["STAFF" as Role];
        return {
          id: user.id,
          email: user.email,
          role: getPrimaryRole(roles),
          roles,
          employeeId: user.employee?.id,
          name: user.employee ? user.employee.name : user.email,
        };
      },
    }),
    // OTP login
    Credentials({
      id: "otp",
      name: "otp",
      credentials: {
        email: { label: "Email", type: "email" },
        otp: { label: "OTP", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.otp) return null;

        const normalizedEmail = (credentials.email as string).toLowerCase().trim();

        const otpRecord = await prisma.otpCode.findFirst({
          where: {
            email: normalizedEmail,
            used: false,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
        });

        if (!otpRecord) return null;
        if (otpRecord.code !== credentials.otp) return null;

        // Mark OTP as used
        await prisma.otpCode.update({
          where: { id: otpRecord.id },
          data: { used: true },
        });

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          include: { employee: true },
        });

        if (!user) return null;
        if (user.employee?.status === "INACTIVE") return null;

        const roles = user.roles.length > 0 ? user.roles : ["STAFF" as Role];
        return {
          id: user.id,
          email: user.email,
          role: getPrimaryRole(roles),
          roles,
          employeeId: user.employee?.id,
          name: user.employee ? user.employee.name : user.email,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        try {
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email },
            include: { employee: true },
          });

          if (existingUser?.employee?.status === "INACTIVE") return false;

          if (!existingUser) {
            const newUser = await prisma.user.create({
              data: {
                id: crypto.randomUUID(),
                email: user.email,
                password: "",
                roles: ["STAFF"],
                updatedAt: new Date(),
              },
            });
            user.id = newUser.id;
            user.role = "STAFF";
            user.roles = ["STAFF"];
            user.employeeId = undefined;
          } else {
            const roles = existingUser.roles.length > 0 ? existingUser.roles : ["STAFF" as Role];
            user.id = existingUser.id;
            user.role = getPrimaryRole(roles);
            user.roles = roles;
            user.employeeId = existingUser.employee?.id;
          }

          return true;
        } catch (error) {
          console.error("Error during Google sign-in:", error);
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        if (user.id) token.sub = user.id;
        (token as any).role = user.role;
        (token as any).roles = user.roles;
        (token as any).employeeId = user.employeeId;
        (token as any).needsSetup = !user.employeeId;
        return token;
      }

      // Only re-fetch from DB on explicit update (e.g., role change) or if
      // the token is missing role data. Querying every request races with
      // RSC navigation and can throw, which would clear the session cookie.
      const needsRefresh = trigger === "update" || !(token as any).role;
      if (needsRefresh && token.email) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { email: token.email },
            include: { employee: true },
          });
          if (dbUser) {
            const roles = dbUser.roles.length > 0 ? dbUser.roles : ["STAFF" as Role];
            (token as any).role = getPrimaryRole(roles);
            (token as any).roles = roles;
            (token as any).employeeId = dbUser.employee?.id;
            (token as any).needsSetup = !dbUser.employee?.id;
          }
        } catch (err) {
          console.error("[auth] jwt DB lookup failed, keeping existing token:", err);
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub!;
        session.user.role = (token as any).role;
        session.user.roles = (token as any).roles ?? [(token as any).role];
        session.user.employeeId = (token as any).employeeId;
        session.user.needsSetup = (token as any).needsSetup;
      }
      return session;
    },
  },
});
