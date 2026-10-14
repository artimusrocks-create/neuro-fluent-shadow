import { defineConfig, devices } from "@playwright/test";

// Browser tests run against a production build (`npm run build` first) and fake outside services,
// so they never touch real payments, AI credits or Telegram.
const MOCK = 4010;
const APP = 3100;
const mock = `http://localhost:${MOCK}`;

export const E2E_ENV: Record<string, string> = {
  KV_REST_API_URL: mock,
  KV_REST_API_TOKEN: "test",
  APP_PASSCODE: "teach-pass",
  ANTHROPIC_API_KEY: "test",
  ANTHROPIC_BASE_URL: mock,
  ELEVENLABS_API_KEY: "test",
  ELEVENLABS_BASE_URL: mock,
  TELEGRAM_BOT_TOKEN: "123:TEST",
  TELEGRAM_API_BASE: mock,
  LAVA_API_KEY: "lava-key",
  LAVA_OFFER_ID: "836b9fc5-7ae9-4a27-9642-592bc44072b7",
  LAVA_WEBHOOK_SECRET: "lava-hook-secret",
  LAVA_API_BASE: mock,
  CRON_SECRET: "cron-secret",
};

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    ...devices["Pixel 7"],
    baseURL: `http://localhost:${APP}`,
    trace: "retain-on-failure",
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  webServer: [
    { command: "node tests/mock-server.mjs", port: MOCK, env: { MOCK_PORT: String(MOCK) }, reuseExistingServer: false },
    { command: `npx next start -p ${APP}`, port: APP, env: E2E_ENV, reuseExistingServer: false, timeout: 60_000 },
  ],
});
