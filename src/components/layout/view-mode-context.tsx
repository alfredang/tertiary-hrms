"use client";

import { createContext, useContext, useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";

// "trainer" = the Trainer Admin view (TRAINER_ADMIN holders, Alfred, 20 Nov 2026).
export type ViewMode = "admin" | "staff" | "accountant" | "intern" | "trainer";
const VALID: ViewMode[] = ["admin", "staff", "accountant", "intern", "trainer"];

interface Ctx {
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  /** True while server components re-render for the newly selected view. */
  isSwitching: boolean;
}

const ViewModeContext = createContext<Ctx | null>(null);

export function ViewModeProvider({
  initial,
  children,
}: {
  initial: ViewMode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isSwitching, startTransition] = useTransition();
  const [viewMode, setViewState] = useState<ViewMode>(
    VALID.includes(initial) ? initial : "admin",
  );

  // Flip the sidebar/header instantly from context, persist the cookie, and
  // navigate to /dashboard so the user lands on a page accessible to every
  // role instead of staying on an admin-only page (e.g. /accounting).
  // The Trainer Admin view lands on its own page, /trainers.
  const setViewMode = useCallback(
    (v: ViewMode) => {
      setViewState(v);
      document.cookie = `viewAs=${v};path=/;max-age=${60 * 60 * 24 * 365}`;
      // refresh() is what makes the page follow the new view: push() alone reuses the
      // router's cached copy of a page rendered for the previous view (always when
      // already on /dashboard), so the sidebar changed but the page did not.
      startTransition(() => {
        const target = v === "trainer" ? "/trainers" : "/dashboard";
        if (window.location.pathname !== target) router.push(target);
        router.refresh();
      });
    },
    [router],
  );

  return (
    <ViewModeContext.Provider value={{ viewMode, setViewMode, isSwitching }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode(): Ctx {
  const ctx = useContext(ViewModeContext);
  if (!ctx) throw new Error("useViewMode must be used within ViewModeProvider");
  return ctx;
}

// Optional non-throwing variant for components that might render outside the
// provider (e.g. mobile bottom nav rendered in error boundaries).
export function useViewModeOptional(): Ctx | null {
  return useContext(ViewModeContext);
}
