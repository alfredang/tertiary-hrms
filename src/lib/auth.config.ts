import type { NextAuthConfig } from "next-auth";

// Edge-safe NextAuth config used by middleware.ts.
// Providers and DB-touching callbacks live in auth.ts (Node runtime).
export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  providers: [],
} satisfies NextAuthConfig;
