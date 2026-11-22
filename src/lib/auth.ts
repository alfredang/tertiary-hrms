import NextAuth from "next-auth";
import { isSignInBlocked } from "@/lib/account-status";
import { isLoginEmailAllowed } from "@/lib/login-policy";
import { effectiveRoles } from "@/lib/role-policy";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { Role } from "@prisma/client";
import { authConfig } from "./auth.config";

const ROLE_PRIORITY: Role[] = ["ADMIN", "HR", "MANAGER", "ACCOUNTANT", "STAFF", "INTERN"];

/** How often a signed-in session re-reads its roles from the database. */
const ROLE_REFRESH_MS = 5 * 60 * 1000;

const DEFAULT_PASSWORD =process.env.DEFAULT_EMPLOYEE_PASSWORD || "Password123";

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

        if (isSignInBlocked(user.employee?.status)) return null;
        // Staff sign in with their company address; personal email only for part-time staff and interns.
        if (!isLoginEmailAllowed(user.email, user.employee?.employmentType)) return null;

        const roles = effectiveRoles(user.email, user.roles); // only allowed roles (role-policy.ts)
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
        const submittedOtp = (credentials.otp as string).trim();

        const otpRecord = await prisma.otpCode.findFirst({
          where: {
            email: normalizedEmail,
            used: false,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
        });

        if (!otpRecord) {
          // Check if there's an expired/used record to give a better hint
          const anyRecord = await prisma.otpCode.findFirst({
            where: { email: normalizedEmail },
            orderBy: { createdAt: "desc" },
          });
          console.warn(`[auth/otp] No valid OTP for ${normalizedEmail}. Last record: used=${anyRecord?.used}, expired=${anyRecord ? anyRecord.expiresAt < new Date() : "none"}`);
          return null;
        }

        if (otpRecord.code !== submittedOtp) {
          console.warn(`[auth/otp] Wrong OTP for ${normalizedEmail}. Expected length: ${otpRecord.code.length}, got length: ${submittedOtp.length}`);
          return null;
        }

        // Mark OTP as used
        await prisma.otpCode.update({
          where: { id: otpRecord.id },
          data: { used: true },
        });

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          include: { employee: true },
        });

        if (!user) {
          console.warn(`[auth/otp] OTP valid but user not found for ${normalizedEmail}`);
          return null;
        }
        if (isSignInBlocked(user.employee?.status)) {
          console.warn(`[auth/otp] OTP valid but employee has left (sign-in blocked) for ${normalizedEmail}`);
          return null;
        }
        if (!isLoginEmailAllowed(user.email, user.employee?.employmentType)) {
          console.warn(`[auth/otp] sign-in refused for ${normalizedEmail}: personal email on a full-time account`);
          return null;
        }

        const roles = effectiveRoles(user.email, user.roles); // only allowed roles (role-policy.ts)
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
          // Accounts are stored in lower case; match the Google address the same way.
          user.email = user.email.toLowerCase().trim();
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email },
            include: { employee: true },
          });

          if (isSignInBlocked(existingUser?.employee?.status)) {
            console.warn(`[auth/google] sign-in refused for ${user.email}: employee status ${existingUser?.employee?.status}`);
            return false;
          }
          // Also refuses a new account on a personal address (no employee record yet).
          if (!isLoginEmailAllowed(user.email, existingUser?.employee?.employmentType)) {
            console.warn(`[auth/google] sign-in refused for ${user.email}: company email required`);
            return false;
          }

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
            const roles = effectiveRoles(existingUser.email, existingUser.roles);
            user.id = existingUser.id;
            user.role = getPrimaryRole(roles);
            user.roles = roles;
            user.employeeId = existingUser.employee?.id;
          }

          return true;
        } catch (error) {
          console.error(`[auth/google] sign-in failed for ${user.email}:`, error);
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

      // Re-fetch from DB on explicit update, when the token lacks role data, or at most every
      // ROLE_REFRESH_MS so role changes made by an admin (e.g. granting TRAINER_ADMIN) reach
      // signed-in users without a sign-out. Not on every request: that raced with RSC navigation
      // and could throw, clearing the session cookie. A failed lookup keeps the existing token.
      const checkedAt = Number((token as any).rolesCheckedAt ?? 0);
      const needsRefresh = trigger === "update" || !(token as any).role || Date.now() - checkedAt > ROLE_REFRESH_MS;
      if (needsRefresh && token.email) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { email: token.email },
            include: { employee: true },
          });
          // Someone who has left: end the session (null clears the session cookie).
          if (dbUser && isSignInBlocked(dbUser.employee?.status)) return null;
          // A personal address that is no longer allowed (e.g. changed to full time): end the session.
          if (dbUser && !isLoginEmailAllowed(dbUser.email, dbUser.employee?.employmentType)) return null;
          if (dbUser) {
            const roles = effectiveRoles(dbUser.email, dbUser.roles);
            (token as any).role = getPrimaryRole(roles);
            (token as any).roles = roles;
            (token as any).employeeId = dbUser.employee?.id;
            (token as any).needsSetup = !dbUser.employee?.id;
          }
          (token as any).rolesCheckedAt = Date.now();
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
