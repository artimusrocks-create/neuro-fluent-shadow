import { beforeEach, describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import { redis, dayKey } from "@/lib/store";
import { DEMO_GLOBAL_LIMITS, DEMO_IP_LIMITS, DEMO_LIMITS, FREE_PHRASES, Who, freePhraseGate, getWho, isActive, useLimit } from "@/lib/auth";
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
