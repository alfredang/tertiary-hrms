// Runs once when the Next.js server starts (dev and production). Must live inside src/
// for a src-directory project, otherwise Next ignores it.
//
// IMPORTANT: keep the Node-only work INSIDE `if (process.env.NEXT_RUNTIME === "nodejs")`
// (not behind an early return). Next replaces NEXT_RUNTIME at build time and dead-code-
// eliminates this block from the Edge bundle — so the dynamic imports (which pull in
// Playwright/crypto via the scheduler) never get compiled for Edge, where they'd fail.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[instrumentation] register() running");

    // Start the Woods Square scheduler timer first, so a slow seed can't block it.
    try {
      const { startScheduleTimer } = await import("./lib/woods-square-scheduler");
      startScheduleTimer();
    } catch (err) {
      console.error("[woods-square-scheduler] Failed to start timer:", err);
    }

    // Auto-apply seed data (idempotent).
    try {
      const { runStartupSetup } = await import("./lib/startup-setup");
      await runStartupSetup();
    } catch (err) {
      console.error("[Startup] Failed:", err);
    }
  }
}
