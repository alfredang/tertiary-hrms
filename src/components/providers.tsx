"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { APPEARANCE_STORAGE_KEY, defaultAppearanceFor, isAppearance } from "@/lib/appearance";

/** Keeps the browser / PWA chrome colour in step with the page. */
function BrowserThemeColor() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolvedTheme === "dark" ? "#030712" : "#F3F6FD");
  }, [resolvedTheme]);
  return null;
}

/**
 * Applies the signed-in person's starting appearance when this browser has no saved choice
 * (Light for the accounts in LIGHT_DEFAULT_EMAILS; everyone else stays on System).
 */
function AccountAppearanceDefault() {
  const { data: session } = useSession();
  const { setTheme } = useTheme();
  const email = session?.user?.email;
  useEffect(() => {
    if (!email) return;
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    } catch {
      return; // storage blocked: nothing can be saved, keep the provider default
    }
    if (isAppearance(saved)) return;
    const start = defaultAppearanceFor(email);
    if (start !== "system") setTheme(start);
  }, [email, setTheme]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <SessionProvider>
      {/* Light / Dark / System, chosen in My Profile -> Appearance (Alfred, 19 Nov 2026). */}
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem themes={["light", "dark"]}
        storageKey={APPEARANCE_STORAGE_KEY} disableTransitionOnChange>
        <BrowserThemeColor />
        <AccountAppearanceDefault />
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
