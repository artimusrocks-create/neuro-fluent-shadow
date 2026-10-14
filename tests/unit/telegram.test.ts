import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/telegram/route";
import { redis } from "@/lib/store";
import { appBase, healWebhook, tgSecret } from "@/lib/telegram";
import { SITE_URL } from "@/lib/site";
import { getClaim, starsPrice } from "@/lib/pro";
import type { Student } from "@/lib/auth";
import { mock, req } from "./helpers";

const nonce = "0123456789abcdef01234567";
const hook = (update: unknown, secret = tgSecret()) => POST(req("/api/telegram", { json: update, headers: { "x-telegram-bot-api-secret-token": secret } }));
const msg = (text: string, extra: Record<string, unknown> = {}) => ({ message: { chat: { id: 1001 }, from: { id: 1001, first_name: "Лена", username: "lena" }, text, ...extra } });

describe("Telegram bot", () => {
  beforeEach(async () => {
    await mock().reset();
    await redis()!.set("cfg:appUrl", "https://shadow.test");
  });

  it("rejects calls without the secret header", async () => {
    expect((await hook({}, "wrong")).status).toBe(403);
  });

  it("/start pro_<nonce> sends a 30-day Stars subscription invoice", async () => {
    await hook(msg(`/start pro_${nonce}`));
    const calls = await mock().calls("telegram");
    const inv = calls.find((c) => c.method === "createInvoiceLink")!;
    expect(inv.body).toMatchObject({ currency: "XTR", payload: `n:${nonce}`, subscription_period: 2592000, prices: [{ label: "Shadow Pro", amount: starsPrice() }] });
    const sent = calls.find((c) => c.method === "sendMessage")!;
    expect(JSON.stringify(sent.body)).toContain("mockinvoice");
  });

  it("answers the pre-checkout question within the rules", async () => {
    await hook({ pre_checkout_query: { id: "q1", from: { id: 1 }, currency: "XTR", total_amount: 450, invoice_payload: `n:${nonce}` } });
    await hook({ pre_checkout_query: { id: "q2", from: { id: 1 }, currency: "USD", total_amount: 450, invoice_payload: "weird" } });
    const answers = (await mock().calls("telegram")).filter((c) => c.method === "answerPreCheckoutQuery");
    expect(answers[0].body).toMatchObject({ pre_checkout_query_id: "q1", ok: true });
    expect(answers[1].body).toMatchObject({ pre_checkout_query_id: "q2", ok: false });
  });

  it("a successful payment turns the buyer into Pro, once", async () => {
    const expires = Math.floor(Date.now() / 1000) + 30 * 86400;
    const payment = {
      currency: "XTR",
      total_amount: 450,
      invoice_payload: `n:${nonce}`,
      telegram_payment_charge_id: "charge-1",
      subscription_expiration_date: expires,
      is_recurring: true,
      is_first_recurring: true,
    };
    const res = await hook(msg("", { successful_payment: payment }));
    expect(res.status).toBe(200);

    const r = redis()!;
    const id = (await r.get<string>("pro:tg:1001"))!;
    const s = (await r.hget<Student>("students", id))!;
    expect(s.plan).toBe("pro");
    expect(Math.round(Date.parse(s.until!) / 1000)).toBe(expires + 86400); // one spare day
    expect(s.starsSub).toBe("charge-1");
    expect(s.starsCharge).toBe("charge-1");
    expect(await getClaim(nonce)).toBe(s.code);
    expect(await r.get<string>("tg:code:1001")).toBe(s.code);

    const sent = (await mock().calls("telegram")).filter((c) => c.method === "sendMessage");
    expect(JSON.stringify(sent.at(-1)!.body)).toContain(`code=${s.code}`);

    // Telegram re-delivers the same update: nothing changes.
    await hook(msg("", { successful_payment: payment }));
    const again = (await r.hget<Student>("students", id))!;
    expect(again.until).toBe(s.until);
    expect((await r.lrange("pay:log", 0, -1)).length).toBe(1);
  });

  it("without a bot token the webhook doesn't exist (no guessable secret)", async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    try {
      const fake = { message: { chat: { id: 1 }, from: { id: 1 }, successful_payment: { currency: "XTR", total_amount: 1, invoice_payload: "pro", telegram_payment_charge_id: "x" } } };
      const res = await POST(req("/api/telegram", { json: fake, headers: { "x-telegram-bot-api-secret-token": "e3b0c44298fc1c149afbf4c8996fb924" } }));
      expect(res.status).toBe(404);
      expect(await redis()!.get("pro:tg:1")).toBeNull();
    } finally {
      process.env.TELEGRAM_BOT_TOKEN = token;
    }
  });

  it("a buyer who blocked the bot still gets Pro, and the payment is counted once", async () => {
    const pay = { currency: "XTR", total_amount: 450, invoice_payload: "pro", telegram_payment_charge_id: "charge-666", subscription_expiration_date: Math.floor(Date.now() / 1000) + 30 * 86400, is_recurring: true, is_first_recurring: false };
    const update = { message: { chat: { id: 666 }, from: { id: 666, first_name: "Blocked" }, successful_payment: pay } };
    expect((await hook(update)).status).toBe(200);
    expect((await hook(update)).status).toBe(200);
    expect(await redis()!.get("pro:tg:666")).toBeTruthy();
    expect((await redis()!.lrange("pay:log", 0, -1)).length).toBe(1);
  });

  it("subscription updates: cancel turns off renewal, failed tells the teacher", async () => {
    await hook(msg("", { successful_payment: { currency: "XTR", total_amount: 450, invoice_payload: "pro", telegram_payment_charge_id: "c-sub", subscription_expiration_date: Math.floor(Date.now() / 1000) + 86400 * 30, is_recurring: true, is_first_recurring: true } }));
    await redis()!.set("cfg:adminChat", "777");
    await hook({ subscription: { user: { id: 1001, username: "lena" }, invoice_payload: "pro", state: "canceled" } });
    const id = (await redis()!.get<string>("pro:tg:1001"))!;
    expect((await redis()!.hget<Student>("students", id))!.autoRenew).toBe(false);
    await hook({ subscription: { user: { id: 1001, username: "lena" }, invoice_payload: "pro", state: "failed" } });
    const alerts = (await mock().calls("telegram")).filter((c) => c.method === "sendMessage" && String(c.body?.chat_id) === "777");
    expect(alerts.length).toBeGreaterThanOrEqual(2);
  });

  it("/pro doesn't sell a second subscription to someone already renewing", async () => {
    await hook(msg("", { successful_payment: { currency: "XTR", total_amount: 450, invoice_payload: "pro", telegram_payment_charge_id: "c-twice", subscription_expiration_date: Math.floor(Date.now() / 1000) + 86400 * 30, is_recurring: true, is_first_recurring: true } }));
    const invoicesBefore = (await mock().calls("telegram")).filter((c) => c.method === "createInvoiceLink").length;
    await hook(msg("/pro"));
    const calls = await mock().calls("telegram");
    expect(calls.filter((c) => c.method === "createInvoiceLink").length).toBe(invoicesBefore);
    expect(String(calls.filter((c) => c.method === "sendMessage").at(-1)!.body!.text)).toContain("уже есть Pro");
  });

  it("/admin with the right passcode subscribes the teacher to alerts", async () => {
    await hook(msg("/admin wrong"));
    expect(await redis()!.get("cfg:adminChat")).toBeNull();
    await hook(msg("/admin teach-pass"));
    expect(String(await redis()!.get("cfg:adminChat"))).toBe("1001");
  });

  it("/code returns the personal link only to active Pro", async () => {
    await hook(msg("/code"));
    let sent = (await mock().calls("telegram")).filter((c) => c.method === "sendMessage");
    expect(String(sent.at(-1)!.body!.text)).toContain("/pro");
    await hook(
      msg("", { successful_payment: { currency: "XTR", total_amount: 450, invoice_payload: "pro", telegram_payment_charge_id: "charge-2", subscription_expiration_date: Math.floor(Date.now() / 1000) + 86400 * 30, is_recurring: true, is_first_recurring: true } })
    );
    await hook(msg("/code"));
    sent = (await mock().calls("telegram")).filter((c) => c.method === "sendMessage");
    expect(String(sent.at(-1)!.body!.text)).toContain("?code=");
  });

  it("with only TELEGRAM_BOT_TOKEN set, the daily job connects the bot to the site address by itself", async () => {
    const saved = process.env.APP_URL;
    delete process.env.APP_URL;
    try {
      await redis()!.del("cfg:appUrl");
      expect(await appBase()).toBe(SITE_URL);
      expect(await healWebhook()).toBe(true); // the webhook was missing, so it was set up
      const hookCall = (await mock().calls("telegram")).find((c) => c.method === "setWebhook")!;
      expect(hookCall.body).toMatchObject({ url: `${SITE_URL}/api/telegram`, secret_token: tgSecret() });
      expect(await redis()!.get("cfg:appUrl")).toBe(SITE_URL);
    } finally {
      process.env.APP_URL = saved;
    }
  });
});
