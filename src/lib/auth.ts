import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { Role } from "@prisma/client";
import { randomUUID } from "crypto";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      role: Role;
      employeeId?: string;
      needsSetup?: boolean;
      name?: string;
    };
  }

  interface User {
    role: Role;
    employeeId?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
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
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: { employee: true },
        });

        if (!user) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!isPasswordValid) {
          return null;
        }

        // Block INACTIVE employees from logging in
        if (user.employee?.status === "INACTIVE") {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          employeeId: user.employee?.id,
          name: user.employee
            ? user.employee.name
            : user.email,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Handle Google OAuth sign-in
      if (account?.provider === "google" && user.email) {
        try {
          // Check if user exists
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email },
            include: { employee: true },
          });

          // Block INACTIVE employees from Google sign-in
          if (existingUser?.employee?.status === "INACTIVE") {
            return false;
          }

          if (!existingUser) {
            // Create new user with STAFF role by default
            // Admin will need to create employee record and assign proper role
            const newUser = await prisma.user.create({
              data: {
                id: randomUUID(),
                email: user.email,
                password: "", // No password for OAuth users
                role: "STAFF",
                updatedAt: new Date(),
              },
            });

            user.id = newUser.id;
            user.role = "STAFF";
            user.employeeId = undefined;
          } else {
            user.id = existingUser.id;
            user.role = existingUser.role;
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
    async jwt({ token, user }) {
      // Initial sign in
      if (user) {
        // Explicitly set token.sub since NextAuth v5 beta may not auto-set it for credentials
        if (user.id) token.sub = user.id;
        (token as any).role = user.role;
        (token as any).employeeId = user.employeeId;
        (token as any).needsSetup = !user.employeeId;
      }

      // Fetch fresh user data on subsequent requests
      if (token.email && !user) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          include: { employee: true },
        });

        if (dbUser) {
          (token as any).role = dbUser.role;
          (token as any).employeeId = dbUser.employee?.id;
          (token as any).needsSetup = !dbUser.employee?.id;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub!;
        session.user.role = (token as any).role;
        session.user.employeeId = (token as any).employeeId;
        session.user.needsSetup = (token as any).needsSetup;
      }
      return session;
    },
  },
});
