import { beforeEach, describe, expect, it } from "vitest";
import { GET as teacherGET, POST as teacherPOST } from "@/app/api/teacher/route";
import { GET as recGET } from "@/app/api/rec/route";
import { getWho, limitsFor, TEACHER_LIMITS, TEACHER_STUDENT_LIMITS, Who } from "@/lib/auth";
import { redis } from "@/lib/store";
import { mock, req } from "./helpers";

const OWNER = { "x-passcode": "teach-pass" };
const as = (code: string) => ({ "x-passcode": code });
const post = async (headers: Record<string, string>, json: Record<string, unknown>) => {
  const res = await teacherPOST(req("/api/teacher", { json, headers }));
  return { status: res.status, body: await res.json() };
};
const dash = async (headers: Record<string, string>) => (await teacherGET(req("/api/teacher", { headers }))).json();

async function invite(name = "Ольга", seats = 10, days = 14) {
  const { body } = await post(OWNER, { action: "teacherCreate", name, seats, days });
  const code = new URL(body.link).searchParams.get("code")!;
  return { id: body.teacher.id as string, code, link: body.link as string };
}

describe("other teachers' cabinets", () => {
  beforeEach(async () => {
    await mock().reset();
  });

  it("the owner invites a teacher: the link opens their own cabinet, without money or Telegram", async () => {
    const t = await invite();
    expect(t.link).toMatch(/\/teacher\?code=/);
    const who = (await getWho(req("/api/me", { headers: as(t.code) }))) as Who;
    expect(who.role).toBe("teacher");
    const d = await dash(as(t.code));
    expect(d.me).toMatchObject({ owner: false, name: "Ольга", seats: 10, used: 0, active: true });
    expect(d.money).toBeNull();
    expect(d.teachers).toBeUndefined();
    // The owner sees the teacher in the «Учителя» tab.
    const o = await dash(OWNER);
    expect(o.me.owner).toBe(true);
    expect(o.teachers).toHaveLength(1);
    expect(o.teachers[0]).toMatchObject({ name: "Ольга", students: 0, seats: 10, active: true });
  });

  it("each cabinet sees only its own students and can't touch anyone else's", async () => {
    const t = await invite();
    const lena = (await post(OWNER, { action: "create", name: "Лена" })).body.student;
    const olya = (await post(as(t.code), { action: "create", name: "Оля" })).body.student;
    expect((await dash(as(t.code))).students.map((s: { name: string }) => s.name)).toEqual(["Оля"]);
    expect((await dash(OWNER)).students.map((s: { name: string }) => s.name)).toEqual(["Лена"]);
    expect((await post(as(t.code), { action: "delete", id: lena.id })).status).toBe(404);
    expect((await post(as(t.code), { action: "assign", id: lena.id, phrases: ["Hi"] })).status).toBe(404);
    expect((await post(OWNER, { action: "assign", id: olya.id, phrases: ["Hi"] })).status).toBe(404);
    // A teacher's student practises with the teacher plan's limits.
    const who = (await getWho(req("/api/me", { headers: as(olya.code) }))) as Who;
    expect(limitsFor(who)).toEqual(TEACHER_STUDENT_LIMITS);
  });

  it("money, Telegram and inviting teachers stay the owner's", async () => {
    const t = await invite();
    for (const action of ["grant", "telegram", "teacherCreate", "teacherExtend"]) {
      expect((await post(as(t.code), { action, name: "X", id: t.id })).status).toBe(403);
    }
  });

  it("a teacher can't add more students than they pay for, or raise limits past the plan", async () => {
    const t = await invite("Ольга", 2);
    expect((await post(as(t.code), { action: "create", name: "A" })).status).toBe(200);
    const b = (await post(as(t.code), { action: "create", name: "B" })).body.student;
    const third = await post(as(t.code), { action: "create", name: "C" });
    expect(third.status).toBe(402);
    expect(third.body.message).toMatch(/2 из 2/);
    await post(as(t.code), { action: "limits", id: b.id, limits: { breakdown: 9999 } });
    const row = (await dash(as(t.code))).students.find((s: { id: string }) => s.id === b.id);
    expect(row.limits.breakdown).toBe(TEACHER_STUDENT_LIMITS.breakdown);
    // The owner adds seats.
    await post(OWNER, { action: "teacherSeats", id: t.id, seats: 3 });
    expect((await post(as(t.code), { action: "create", name: "C" })).status).toBe(200);
  });

  it("when the paid period ends: no new students, their students become free visitors; +30 days brings it back", async () => {
    const t = await invite();
    const olya = (await post(as(t.code), { action: "create", name: "Оля" })).body.student;
    const r = redis()!;
    const rec = await r.hget<Record<string, unknown>>("teachers", t.id);
    await r.hset("teachers", { [t.id]: { ...rec, until: new Date(Date.now() - 1000).toISOString() } });
    expect((await post(as(t.code), { action: "create", name: "Петя" })).status).toBe(402);
    expect(((await getWho(req("/api/me", { headers: as(olya.code) }))) as Who).role).toBe("demo");
    // The teacher still gets into the cabinet to see what to do.
    expect((await dash(as(t.code))).me).toMatchObject({ owner: false, active: false });
    await post(OWNER, { action: "teacherExtend", id: t.id, days: 30 });
    expect(((await getWho(req("/api/me", { headers: as(olya.code) }))) as Who).role).toBe("student");
  });

  it("a recording from a teacher's student can be played by that teacher, not by another one", async () => {
    const a = await invite("Ольга");
    const b = await invite("Ирина");
    await redis()!.set("rec:r1", { id: "r1", studentId: "s1", name: "Оля", text: "Hi", score: 80, stored: { url: "https://blob.test/x" }, at: new Date().toISOString(), teacher: a.id });
    const play = (code: string) => recGET(req(`/api/rec?id=r1&code=${encodeURIComponent(code)}`));
    expect((await play(b.code)).status).toBe(403);
    expect((await play(a.code)).status).not.toBe(403);
    expect((await play("teach-pass")).status).not.toBe(403);
  });

  it("an invited teacher practising has the teacher plan's limits; the owner has none", async () => {
    const t = await invite();
    expect(limitsFor((await getWho(req("/api/me", { headers: as(t.code) }))) as Who)).toEqual(TEACHER_LIMITS);
    expect(limitsFor((await getWho(req("/api/me", { headers: OWNER }))) as Who)).toBeNull();
  });
});
