import { beforeEach, describe, expect, it } from "vitest";
import { redis, dayKey } from "@/lib/store";
import type { Student } from "@/lib/auth";
import { EXTENDED, InProgress, extendUntil, getClaim, grantPro, handleLavaEvent, lavaAuthOk, payLog, validEmail, validNonce } from "@/lib/pro";
import { mock } from "./helpers";

const DAY = 86400000;
const nonce = "a1b2c3d4e5f6a7b8c9d0e1f2";

async function student(id: string) {
  return (await redis()!.hget<Student>("students", id))!;
}

describe("dates", () => {
  it("extends from now when access already ran out", () => {
    const now = Date.parse("2026-10-14T00:00:00Z");
    expect(extendUntil("2026-01-01T00:00:00Z", 30, now)).toBe(new Date(now + 30 * DAY).toISOString());
  });
  it("extends from the current end when access is still running", () => {
    const now = Date.parse("2026-10-14T00:00:00Z");
    expect(extendUntil("2026-10-20T00:00:00Z", 30, now)).toBe("2026-11-19T00:00:00.000Z");
  });
});

describe("validation", () => {
  it("accepts real emails and rejects junk", () => {
    expect(validEmail("lena@example.com")).toBe(true);
    expect(validEmail("no-at-sign")).toBe(false);
    expect(validEmail("a@b")).toBe(false);
  });
  it("nonces are 16-40 lowercase hex", () => {
    expect(validNonce(nonce)).toBe(true);
    expect(validNonce("XYZ")).toBe(false);
  });
});

describe("lava.top webhook auth", () => {
  it("accepts the API key header", () => {
    expect(lavaAuthOk(new Request("http://x", { headers: { "X-Api-Key": "lava-hook-secret" } }))).toBe(true);
  });
  it("accepts Basic auth with the secret as password", () => {
    const b = Buffer.from("lava:lava-hook-secret").toString("base64");
    expect(lavaAuthOk(new Request("http://x", { headers: { Authorization: `Basic ${b}` } }))).toBe(true);
  });
  it("rejects anything else", () => {
    expect(lavaAuthOk(new Request("http://x", { headers: { "X-Api-Key": "wrong" } }))).toBe(false);
    expect(lavaAuthOk(new Request("http://x"))).toBe(false);
  });
});

describe("lava.top subscription lifecycle", () => {
  beforeEach(async () => {
    await mock().reset();
  });

  it("first payment → Pro for 31 days, code for the waiting browser, money logged, teacher told, email sent", async () => {
    const r = redis()!;
    await r.set("cfg:adminChat", "777");
    await r.set("lava:contract:c-1", nonce);
    const res = await handleLavaEvent({
      eventType: "payment.success",
      contractId: "c-1",
      buyer: { email: "Lena@Example.com" },
      amount: 690,
      currency: "RUB",
      status: "subscription-active",
    });
    expect(res).toBe("granted");

    const id = (await r.get<string>("pro:email:lena@example.com"))!;
    const s = await student(id);
    expect(s.plan).toBe("pro");
    expect(s.autoRenew).toBe(true);
    expect(s.lavaParent).toBe("c-1");
    expect(Date.parse(s.until!) - Date.now()).toBeGreaterThan(30.9 * DAY);
    expect(await getClaim(nonce)).toBe(s.code);

    const log = await payLog();
    expect(log[0]).toMatchObject({ src: "lava", kind: "new", amount: 690, currency: "RUB" });
    const rev = await r.hgetall<Record<string, number>>(`rev:${dayKey()}`);
    expect(Number(rev!.RUB)).toBe(690);

    const tg = await mock().calls("telegram");
    expect(tg.some((c) => c.method === "sendMessage" && String(c.body?.chat_id) === "777")).toBe(true);
    const mail = await mock().calls("resend");
    expect(mail).toHaveLength(1);
  });

  it("the same webhook twice changes nothing the second time", async () => {
    const ev = { eventType: "payment.success", contractId: "c-2", buyer: { email: "a@b.co" }, amount: 9, currency: "USD", status: "subscription-active" };
    expect(await handleLavaEvent(ev)).toBe("granted");
    const id = (await redis()!.get<string>("pro:email:a@b.co"))!;
    const until1 = (await student(id)).until;
    expect(await handleLavaEvent(ev)).toBe("duplicate");
    expect((await student(id)).until).toBe(until1);
  });

  it("renewal extends from the current end; cancel stops renewal; refund closes access", async () => {
    const r = redis()!;
    await handleLavaEvent({ eventType: "payment.success", contractId: "c-3", buyer: { email: "max@test.dev" }, amount: 690, currency: "RUB", status: "subscription-active" });
    const id = (await r.get<string>("pro:email:max@test.dev"))!;
    const first = Date.parse((await student(id)).until!);

    expect(
      await handleLavaEvent({ eventType: "subscription.recurring.payment.success", contractId: "c-3b", parentContractId: "c-3", buyer: { email: "max@test.dev" }, amount: 690, currency: "RUB", status: "subscription-active" })
    ).toBe("extended");
    const second = Date.parse((await student(id)).until!);
    expect(second - first).toBeGreaterThan(30.9 * DAY);

    const willExpireAt = new Date(Date.now() + 70 * DAY).toISOString();
    expect(await handleLavaEvent({ eventType: "subscription.cancelled", contractId: "c-3", buyer: { email: "max@test.dev" }, willExpireAt })).toBe("cancelled");
    let s = await student(id);
    expect(s.autoRenew).toBe(false);
    expect(s.until).toBe(willExpireAt); // lava's date is later than ours here, so it wins

    expect(await handleLavaEvent({ event_type: "refund.success", event_id: "rf-1", data: { customer_email: "max@test.dev", amount: 690, currency: "RUB" } })).toBe("revoked");
    s = await student(id);
    expect(Date.parse(willExpireAt) - Date.parse(s.until!)).toBeGreaterThan(29.9 * DAY); // one month taken back
  });

  it("unknown events are ignored", async () => {
    expect(await handleLavaEvent({ eventType: "something.new", contractId: "x" })).toBe("ignored");
  });
});

describe("grantPro", () => {
  beforeEach(async () => {
    await mock().reset();
  });
  it("finds the same Telegram buyer again instead of making a second account", async () => {
    const a = await grantPro({ src: "stars", tg: 555, tgUser: "lena", days: 30 });
    const b = await grantPro({ src: "stars", tg: 555, days: 30 });
    expect(b.created).toBe(false);
    expect(b.student.id).toBe(a.student.id);
    expect(Date.parse(b.student.until!) - Date.parse(a.student.until!)).toBeGreaterThan(29.9 * DAY);
  });
  it("a payment adds its days on top of the time that's left", async () => {
    const a = await grantPro({ src: "manual", email: "x@y.zz", days: 90 });
    const b = await grantPro({ src: "lava", email: "x@y.zz", days: 30 });
    expect(Date.parse(b.student.until!) - Date.parse(a.student.until!)).toBeGreaterThan(29.9 * DAY);
  });
  it("an exact end date from Telegram never shortens access that runs longer", async () => {
    const a = await grantPro({ src: "manual", tg: 9, days: 90 });
    const b = await grantPro({ src: "stars", tg: 9, until: new Date(Date.now() + 30 * DAY).toISOString() });
    expect(b.student.until).toBe(a.student.until);
  });
});

describe("money edge cases (from the review)", () => {
  beforeEach(async () => {
    await mock().reset();
  });

  it("paying with an email that already has Pro does NOT hand that account's code to the paying browser", async () => {
    const r = redis()!;
    const victim = await grantPro({ src: "manual", email: "victim@example.com", days: 30 });
    await r.set("lava:contract:c-attack", nonce);
    await handleLavaEvent({ eventType: "payment.success", contractId: "c-attack", buyer: { email: "victim@example.com" }, amount: 690, currency: "RUB", status: "subscription-active" });
    expect(await getClaim(nonce)).toBe(EXTENDED);
    expect(await getClaim(nonce)).not.toBe(victim.student.code);
  });

  it("cancelling a card subscription never removes time added on top", async () => {
    const r = redis()!;
    await handleLavaEvent({ eventType: "payment.success", contractId: "c-keep", buyer: { email: "keep@example.com" }, amount: 690, currency: "RUB", status: "subscription-active" });
    const id = (await r.get<string>("pro:email:keep@example.com"))!;
    await grantPro({ src: "manual", email: "keep@example.com", days: 90 }); // ~121 days total
    const before = Date.parse((await student(id)).until!);
    await handleLavaEvent({ eventType: "subscription.cancelled", contractId: "c-keep", buyer: { email: "keep@example.com" }, willExpireAt: new Date(Date.now() + 31 * DAY).toISOString() });
    expect(Date.parse((await student(id)).until!)).toBe(before);
  });

  it("a refund takes back one month, not everything, and stops renewal at lava.top", async () => {
    const r = redis()!;
    await handleLavaEvent({ eventType: "payment.success", contractId: "c-two", buyer: { email: "two@example.com" }, amount: 690, currency: "RUB", status: "subscription-active" });
    await handleLavaEvent({ eventType: "subscription.recurring.payment.success", contractId: "c-two-b", parentContractId: "c-two", buyer: { email: "two@example.com" }, amount: 690, currency: "RUB", status: "subscription-active" });
    const id = (await r.get<string>("pro:email:two@example.com"))!;
    const before = Date.parse((await student(id)).until!);
    await handleLavaEvent({ event_type: "refund.success", event_id: "rf-two", data: { customer_email: "two@example.com", amount: 690, currency: "RUB" } });
    const s = await student(id);
    expect(before - Date.parse(s.until!)).toBeGreaterThan(29.9 * DAY);
    expect(Date.parse(s.until!)).toBeGreaterThan(Date.now() + 25 * DAY);
    expect(s.autoRenew).toBe(false);
  });

  it("an event that's still being processed makes lava.top retry instead of being dropped", async () => {
    await redis()!.set("lock:lava:payment.success:c-busy", 1, { ex: 60 });
    await expect(handleLavaEvent({ eventType: "payment.success", contractId: "c-busy", buyer: { email: "busy@example.com" }, amount: 1, currency: "USD", status: "completed" })).rejects.toBeInstanceOf(InProgress);
  });
});
