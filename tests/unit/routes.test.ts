import { beforeEach, describe, expect, it } from "vitest";
import { GET as claimGET } from "@/app/api/pro/claim/route";
import { POST as checkoutPOST } from "@/app/api/pro/checkout/route";
import { POST as starsPOST } from "@/app/api/pro/stars/route";
import { POST as lavaPOST } from "@/app/api/pay/lava/route";
import { POST as eventPOST } from "@/app/api/event/route";
import { GET as meGET } from "@/app/api/me/route";
import { GET as cronGET } from "@/app/api/cron/daily/route";
import { GET as assetGET } from "@/app/api/assetlinks/route";
import { POST as breakdownPOST } from "@/app/api/breakdown/route";
import { GET as teacherGET, POST as teacherPOST } from "@/app/api/teacher/route";
import { redis, dayKey } from "@/lib/store";
import { mock, req } from "./helpers";

const nonce = "fedcba9876543210fedcba98";

describe("API routes", () => {
  beforeEach(async () => {
    await mock().reset();
  });

  it("/api/me tells a free visitor what the paywall can offer", async () => {
    const me = await (await meGET(req("/api/me", { headers: { "x-device": "abcdefabcdefabcd" } }))).json();
    expect(me.plan).toBe("free");
    expect(me.offer).toMatchObject({ telegram: true, card: true, stars: 450 });
    expect(me.free).toMatchObject({ used: 0, limit: 5 });
  });

  it("card checkout: validates, creates the lava.top payment and remembers who's waiting", async () => {
    expect((await checkoutPOST(req("/api/pro/checkout", { json: { nonce, email: "bad", currency: "RUB" } }))).status).toBe(400);
    const res = await checkoutPOST(req("/api/pro/checkout", { json: { nonce, email: "lena@example.com", currency: "RUB", utm: { utm_source: "instagram", evil: "x" } } }));
    expect(res.status).toBe(200);
    const { url } = await res.json();
    expect(url).toContain("/lava-pay/");
    const sent = (await mock().calls("lava"))[0].body as Record<string, unknown>;
    expect(sent).toMatchObject({ email: "lena@example.com", currency: "RUB", periodicity: "MONTHLY", successful_return_url: "http://localhost:3000/?paid=1", clientUtm: { utm_source: "instagram" } });
    expect(JSON.stringify(sent)).not.toContain("evil");
    const contract = url.split("/").pop();
    expect(await redis()!.get(`lava:contract:${contract}`)).toBe(nonce);
  });

  it("full card flow: webhook arrives → the waiting browser gets its code", async () => {
    const { url } = await (await checkoutPOST(req("/api/pro/checkout", { json: { nonce, email: "max@example.com", currency: "USD" } }))).json();
    const contractId = url.split("/").pop();
    expect(await (await claimGET(req(`/api/pro/claim?nonce=${nonce}`))).json()).toEqual({ pending: true });

    const body = { eventType: "payment.success", contractId, buyer: { email: "max@example.com" }, amount: 9, currency: "USD", status: "subscription-active" };
    expect((await lavaPOST(req("/api/pay/lava", { json: body }))).status).toBe(401);
    const ok = await lavaPOST(req("/api/pay/lava", { json: body, headers: { "X-Api-Key": "lava-hook-secret" } }));
    expect(await ok.json()).toEqual({ ok: true, result: "granted" });

    const claim = await (await claimGET(req(`/api/pro/claim?nonce=${nonce}`))).json();
    expect(claim.code).toMatch(/^max-[a-z0-9]{4}$/);
    const me = await (await meGET(req("/api/me", { headers: { "x-passcode": claim.code } }))).json();
    expect(me.plan).toBe("pro");
    expect(me.pro.autoRenew).toBe(true);
  });

  it("Stars checkout returns an invoice link", async () => {
    const res = await starsPOST(req("/api/pro/stars", { json: { nonce } }));
    expect((await res.json()).link).toContain("t.me/$mockinvoice");
  });

  it("counts only known events", async () => {
    expect((await eventPOST(req("/api/event", { json: { e: "paywall", d: "abcdefabcdefabcd" } }))).status).toBe(204);
    await eventPOST(req("/api/event", { json: { e: "made-up" } }));
    const ev = await redis()!.hgetall<Record<string, number>>(`ev:${dayKey()}`);
    expect(Number(ev!.paywall)).toBe(1);
    expect(ev!["made-up"]).toBeUndefined();
  });

  it("the free gate stops the 6th new phrase and asks to upgrade", async () => {
    const h = { "x-device": "1234567890abcdef" };
    for (let i = 0; i < 5; i++) expect((await breakdownPOST(req("/api/breakdown", { json: { text: `Phrase ${i} here` }, headers: h }))).status).toBe(200);
    const sixth = await breakdownPOST(req("/api/breakdown", { json: { text: "One more phrase" }, headers: h }));
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toMatchObject({ error: "limit", upgrade: true });
  });

  it("the daily job runs once a day and only with the secret", async () => {
    expect((await cronGET(req("/api/cron/daily", { headers: { authorization: "Bearer nope" } }))).status).toBe(403);
    await redis()!.sadd("tg:subs", "42");
    const first = await (await cronGET(req("/api/cron/daily", { headers: { authorization: "Bearer cron-secret" } }))).json();
    expect(first).toMatchObject({ ok: true, sent: 1 });
    const second = await (await cronGET(req("/api/cron/daily", { headers: { authorization: "Bearer cron-secret" } }))).json();
    expect(second.skipped).toBeTruthy();
  });

  it("assetlinks vouches for the Android app", async () => {
    const data = await (await assetGET()).json();
    expect(data[0].target.package_name).toBe("com.neurofluent.shadow");
    expect(data[0].target.sha256_cert_fingerprints[0]).toMatch(/^6C:44:71/);
  });

  it("teacher can grant, extend and revoke Pro, and sees the money", async () => {
    const t = { "x-passcode": "teach-pass" };
    const g = await (await teacherPOST(req("/api/teacher", { json: { action: "grant", name: "Оля", days: 7 }, headers: t }))).json();
    expect(g.link).toContain("?code=");
    const dash = await (await teacherGET(req("/api/teacher", { headers: t }))).json();
    expect(dash.money.pro).toHaveLength(1);
    expect(dash.students.find((s: { name: string }) => s.name === "Оля")).toBeUndefined(); // Pro lives in the money tab
    const id = dash.money.pro[0].id;
    await teacherPOST(req("/api/teacher", { json: { action: "extend", id, days: 30 }, headers: t }));
    await teacherPOST(req("/api/teacher", { json: { action: "revoke", id }, headers: t }));
    const after = await (await teacherGET(req("/api/teacher", { headers: t }))).json();
    expect(after.money.pro[0].active).toBe(false);
    expect((await teacherGET(req("/api/teacher"))).status).toBe(403);
  });
});
