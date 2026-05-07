// Runs once when the Next.js server starts (both dev and production).
// Used to auto-apply seed data without any manual steps after deploy.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { runStartupSetup } = await import("./src/lib/startup-setup");
      await runStartupSetup();
    } catch (err) {
      console.error("[Startup] Failed:", err);
    }
  }
}
