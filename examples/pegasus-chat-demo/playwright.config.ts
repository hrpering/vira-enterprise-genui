import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests-e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:4180",
    headless: true,
  },
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:4180/proof",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
