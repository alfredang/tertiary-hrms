import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * Always-visible health for the Woods Square auto-invite: is the REAL monthly send actually
 * happening? Surfaces when it's off, stuck in test mode, never-sent, or stale — so it can't
 * silently never run. Shown on the Send-Invites landing tab (from the saved config) AND in
 * the Settings tab (reflecting the live toggles). "Last real send" = the production watermark
 * (set by the monthly run or a production "Run now"); test runs don't count toward it.
 */
export function WoodsSquareHealthBanner({
  enabled,
  testMode,
  lastProdFiredAt,
}: {
  enabled: boolean;
  testMode: boolean;
  lastProdFiredAt: string | null;
}) {
  const lastReal = lastProdFiredAt ? parseISO(lastProdFiredAt) : null;
  const daysSinceReal = lastReal ? differenceInCalendarDays(new Date(), lastReal) : null;
  const lastRealText = lastReal
    ? `${format(lastReal, "d MMM yyyy")} · ${
        daysSinceReal === 0 ? "today" : daysSinceReal === 1 ? "1 day ago" : `${daysSinceReal} days ago`
      }`
    : "never";
  const health: { tone: "ok" | "warn"; title: string; body: string } = !enabled
    ? {
        tone: "warn",
        title: "Automatic invites are OFF",
        body: "Staff are not being sent building PINs automatically. Turn on “Enable automatic invites” in the Settings tab to start the monthly send.",
      }
    : testMode
      ? {
          tone: "warn",
          title: "Test mode is ON — real send paused",
          body: "Only your test recipients get invites. The real monthly send to all staff will NOT run until you switch Test mode off in Settings.",
        }
      : !lastReal
        ? {
            tone: "warn",
            title: "Active — but nothing sent yet",
            body: "Automatic invites are on, but no real monthly send has gone out yet. It fires on the next last-Monday run, or use “Run now” in Settings.",
          }
        : daysSinceReal !== null && daysSinceReal > 40
          ? {
              tone: "warn",
              title: "No automatic send in over a month",
              body: `Last real send was ${lastRealText}. Staff may be missing building PINs — use “Run now” in Settings.`,
            }
          : {
              tone: "ok",
              title: "Active — sending automatically",
              body: `Last real send: ${lastRealText}.`,
            };

  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border p-3 ${
        health.tone === "ok"
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-amber-500/40 bg-amber-500/10"
      }`}
    >
      {health.tone === "ok" ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      )}
      <div className="min-w-0">
        <p
          className={`text-sm font-medium ${
            health.tone === "ok" ? "text-emerald-300" : "text-amber-300"
          }`}
        >
          {health.title}
        </p>
        <p className="mt-0.5 text-xs text-gray-400">{health.body}</p>
      </div>
    </div>
  );
}
