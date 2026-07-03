import { Loader2 } from "lucide-react";

/**
 * Shown automatically by Next.js in the dashboard content area while a page is
 * loading — i.e. when switching between sidebar tabs that fetch data server-side.
 * The sidebar and header (part of the layout) stay put; only this swaps in.
 */
export default function DashboardLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-gray-400">
        <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
        <p className="text-sm">Loading…</p>
      </div>
    </div>
  );
}
