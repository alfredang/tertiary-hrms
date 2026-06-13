"use client";

import { Loader2 } from "lucide-react";
import { useViewModeOptional } from "./view-mode-context";

/**
 * Dim + spinner over the main content area while switching role views.
 * Sits below the header (top-16) and to the right of the sidebar so it covers
 * the page content, not the chrome.
 */
const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  staff: "Staff",
  accountant: "Accountant",
  intern: "Intern",
};

export function ViewSwitchOverlay() {
  const ctx = useViewModeOptional();
  if (!ctx?.isSwitching) return null;

  const role = ROLE_LABELS[ctx.viewMode] ?? ctx.viewMode;

  return (
    <div className="fixed inset-x-0 bottom-0 top-16 z-30 flex items-center justify-center bg-gray-900/70 backdrop-blur-[1px] lg:pl-[var(--sidebar-w,18rem)]">
      <div className="flex flex-col items-center gap-3 text-gray-300">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
        <p className="text-sm font-medium">Switching to {role}…</p>
      </div>
    </div>
  );
}
