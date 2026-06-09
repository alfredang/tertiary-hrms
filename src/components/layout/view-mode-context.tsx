"use client";

import { createContext, useContext, useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";

export type ViewMode = "admin" | "staff" | "accountant" | "intern";
const VALID: ViewMode[] = ["admin", "staff", "accountant", "intern"];

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
  // refresh server components inside a transition so `isSwitching` stays true
  // until the new view's server content has re-rendered.
  const setViewMode = useCallback(
    (v: ViewMode) => {
      setViewState(v);
      document.cookie = `viewAs=${v};path=/;max-age=${60 * 60 * 24 * 365}`;
      startTransition(() => router.refresh());
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
