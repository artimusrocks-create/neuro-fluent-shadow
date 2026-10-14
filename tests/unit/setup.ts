// Starts the fake outside services for this test file and points the app at them.
import type { AddressInfo } from "node:net";
// @ts-expect-error plain JS module
import { createMockServer } from "../mock-server.mjs";

const server = createMockServer();
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

Object.assign(process.env, {
  MOCK_BASE: base,
  KV_REST_API_URL: base,
  KV_REST_API_TOKEN: "test",
  APP_PASSCODE: "teach-pass",
  ANTHROPIC_API_KEY: "test",
  ANTHROPIC_BASE_URL: base,
  ELEVENLABS_API_KEY: "test",
  // The removed cloned voice, as it may still be set in Vercel: the app must ignore it (see speak.test.ts).
  ELEVENLABS_VOICE_ID: "Os4ZX8JiIw21ZTNqYl53",
  ELEVENLABS_BASE_URL: base,
  TELEGRAM_BOT_TOKEN: "123:TEST",
  TELEGRAM_API_BASE: base,
  LAVA_API_KEY: "lava-key",
  LAVA_OFFER_ID: "836b9fc5-7ae9-4a27-9642-592bc44072b7",
  LAVA_WEBHOOK_SECRET: "lava-hook-secret",
  LAVA_API_BASE: base,
  RESEND_API_KEY: "re_test",
  RESEND_API_BASE: base,
  EMAIL_FROM: "Shadow <shadow@example.com>",
  APP_URL: "https://shadow.test",
  CRON_SECRET: "cron-secret",
});

export const mock = {
  base,
  async calls(service: string) {
    return (await (await fetch(`${base}/__calls?service=${service}`)).json()) as { method?: string; body?: Record<string, unknown> }[];
  },
  async reset() {
    await fetch(`${base}/__reset`, { method: "POST" });
  },
};
(globalThis as unknown as { __mock: typeof mock }).__mock = mock;
