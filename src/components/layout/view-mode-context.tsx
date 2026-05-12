"use client";

import { createContext, useContext, useState, useCallback } from "react";

export type ViewMode = "admin" | "staff" | "accountant" | "intern";
const VALID: ViewMode[] = ["admin", "staff", "accountant", "intern"];

interface Ctx {
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
}

const ViewModeContext = createContext<Ctx | null>(null);

export function ViewModeProvider({
  initial,
  children,
}: {
  initial: ViewMode;
  children: React.ReactNode;
}) {
  const [viewMode, setViewState] = useState<ViewMode>(
    VALID.includes(initial) ? initial : "admin",
  );

  // Synchronous React state update + cookie persistence. No navigation, no
  // server round-trip — the sidebar (and any other consumer) re-renders
  // immediately. The cookie is updated so the next SSR paint reflects the
  // chosen view too.
  const setViewMode = useCallback((v: ViewMode) => {
    setViewState(v);
    document.cookie = `viewAs=${v};path=/;max-age=${60 * 60 * 24 * 365}`;
  }, []);

  return (
    <ViewModeContext.Provider value={{ viewMode, setViewMode }}>
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
