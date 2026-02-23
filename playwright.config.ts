import { defineConfig } from "@playwright/test";

const isProduction = process.env.TEST_ENV === "production";
const baseURL = isProduction
  ? "https://hrms.tertiaryinfo.tech"
  : "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: isProduction ? 90000 : 60000,
  expect: { timeout: isProduction ? 20000 : 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  ...(isProduction
    ? {}
    : {
        webServer: {
          command: "npm run dev",
          url: "http://localhost:3000",
          reuseExistingServer: true,
          timeout: 120000,
        },
      }),
});
