import { beforeEach, describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import { redis, dayKey } from "@/lib/store";
import { DEMO_GLOBAL_LIMITS, DEMO_IP_LIMITS, DEMO_LIMITS, FREE_PHRASES, Who, clientIp, freePhraseGate, getWho, isActive, mayVoice, rememberUnlocked, useChars, useLimit } from "@/lib/auth";
import { grantPro, revokePro } from "@/lib/pro";
import { mock, req } from "./helpers";

const demo = (dev: string, ip = "10.0.0.1"): Who => ({ role: "demo", id: `dev:${dev}`, name: "Гость", ip });

describe("isActive", () => {
  it("teacher-made students never run out", () => {
    expect(isActive({ id: "1", name: "a", code: "a-1", created: "" })).toBe(true);
  });
  it("Pro runs out at its end date", () => {
    expect(isActive({ id: "1", name: "a", code: "a-1", created: "", plan: "pro", until: new Date(Date.now() + 1000).toISOString() })).toBe(true);
    expect(isActive({ id: "1", name: "a", code: "a-1", created: "", plan: "pro", until: new Date(Date.now() - 1000).toISOString() })).toBe(false);
  });
});

describe("free visitor limits", () => {
  beforeEach(async () => {
    await mock().reset();
  });

  it("one device: stops after its daily allowance", async () => {
    const who = demo("aaaaaaaaaaaaaaaa");
    for (let i = 0; i < DEMO_LIMITS.score; i++) expect(await useLimit(who, "score")).toBeNull();
    const denied = await useLimit(who, "score");
    expect(denied).toBeInstanceOf(NextResponse);
    expect(denied!.status).toBe(429);
    expect((await denied!.json()).upgrade).toBe(true);
  });

  it("one network: new browser ids don't get around the cap", async () => {
    let denied: NextResponse | null = null;
    for (let i = 0; i <= DEMO_IP_LIMITS.words && !denied; i++) denied = await useLimit(demo(`dev${String(i).padStart(14, "0")}`, "10.9.9.9"), "words");
    expect(denied?.status).toBe(429);
  });

  it("everyone together: the global safety net kicks in", async () => {
    await redis()!.set(`useall:${dayKey()}:speak`, DEMO_GLOBAL_LIMITS.speak);
    const denied = await useLimit(demo("bbbbbbbbbbbbbbbb", "10.1.1.1"), "speak");
    expect(denied?.status).toBe(429);
  });

  it("5 different phrases a day; repeating one is free", async () => {
    const who = demo("cccccccccccccccc");
    for (let i = 0; i < FREE_PHRASES; i++) expect(await freePhraseGate(who, `phrase number ${i}`)).toBeNull();
    expect(await freePhraseGate(who, "phrase number 0")).toBeNull();
    expect((await freePhraseGate(who, "a brand new phrase"))?.status).toBe(429);
  });
});

describe("getWho", () => {
  beforeEach(async () => {
    await mock().reset();
  });

  it("the teacher passcode is the teacher", async () => {
    const who = await getWho(req("/api/me", { headers: { "x-passcode": "teach-pass" } }));
    expect((who as Who).role).toBe("teacher");
  });

  it("an active Pro code is a student; an expired one falls back to free with 'lapsed'", async () => {
    const { student } = await grantPro({ src: "manual", name: "Лена", days: 30 });
    const ok = (await getWho(req("/api/me", { headers: { "x-passcode": student.code } }))) as Who;
    expect(ok.role).toBe("student");

    await revokePro(student.id);
    const lapsed = (await getWho(req("/api/me", { headers: { "x-passcode": student.code, "x-device": "dddddddddddddddd" } }))) as Who;
    expect(lapsed.role).toBe("demo");
    expect(lapsed.role === "demo" && lapsed.lapsed?.id).toBe(student.id);
  });

  it("a wrong code never locks anyone out", async () => {
    const who = (await getWho(req("/api/me", { headers: { "x-passcode": "nope-0000" } }))) as Who;
    expect(who.role).toBe("demo");
  });
});

describe("abuse protection (from the review)", () => {
  beforeEach(async () => {
    await mock().reset();
  });

  it("60 simultaneous new phrases from one device: only 5 get through", async () => {
    const who = demo("eeeeeeeeeeeeeeee", "10.2.2.2");
    const results = await Promise.all(Array.from({ length: 60 }, (_, i) => freePhraseGate(who, `parallel phrase ${i}`)));
    expect(results.filter((x) => x === null).length).toBe(FREE_PHRASES);
  });

  it("free visitors can voice pack phrases and what they unlocked, not any text", async () => {
    const who = demo("ffffffffffffffff", "10.3.3.3");
    expect(await mayVoice(who, "Can I get a coffee to go?")).toBe(true);
    expect(await mayVoice(who, "a coffee")).toBe(true); // a piece of a pack phrase
    expect(await mayVoice(who, "Read this whole essay aloud for free please")).toBe(false);
    await rememberUnlocked(who, ["My manager wants the report by Friday."]);
    expect(await mayVoice(who, "the report")).toBe(true);
  });

  it("voice is budgeted in characters", async () => {
    const who = demo("abababababababab", "10.4.4.4");
    expect(await useChars(who, 3900)).toBeNull();
    expect((await useChars(who, 200))?.status).toBe(429);
  });

  it("after 30 wrong codes from one network, codes stop being checked there (no guessing)", async () => {
    const { student } = await grantPro({ src: "manual", name: "Лена", days: 30 });
    for (let i = 0; i < 30; i++) await getWho(req("/api/me", { headers: { "x-passcode": `guess-${i}`, "x-forwarded-for": "10.5.5.5" } }));
    const who = (await getWho(req("/api/me", { headers: { "x-passcode": student.code, "x-forwarded-for": "10.5.5.5" } }))) as Who;
    expect(who.role).toBe("demo");
    const elsewhere = (await getWho(req("/api/me", { headers: { "x-passcode": student.code, "x-forwarded-for": "10.6.6.6" } }))) as Who;
    expect(elsewhere.role).toBe("student");
    // the teacher password can't be brute-forced either
    const teacher = (await getWho(req("/api/me", { headers: { "x-passcode": "teach-pass", "x-forwarded-for": "10.5.5.5" } }))) as Who;
    expect(teacher.role).not.toBe("teacher");
  });

  it("IPv6 visitors are counted per /64 block", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "2a02:6b8:1:2:aaaa:bbbb:cccc:dddd" } }))).toBe("2a02:6b8:1:2::/64");
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4" } }))).toBe("1.2.3.4");
  });
});
