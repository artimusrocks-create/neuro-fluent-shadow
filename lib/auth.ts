import { NextResponse } from "next/server";
import { dayKey, redis } from "./store";

export type Kind = "breakdown" | "words" | "speak" | "score";
export type Limits = Record<Kind, number>;
export type Student = { id: string; name: string; code: string; created: string; limits?: Partial<Limits> };
export type Who =
  | { role: "teacher"; id: "teacher"; name: string }
  | { role: "student"; id: string; name: string; student: Student }
  | { role: "demo"; id: string; name: string; ip: string };

export const STUDENT_LIMITS: Limits = { breakdown: 40, words: 20, speak: 300, score: 40 };
export const DEMO_LIMITS: Limits = { breakdown: 5, words: 10, speak: 150, score: 30 };
export const FREE_PHRASES = 5;
export const CONTACT_URL = process.env.CONTACT_URL || "https://t.me/rawmeatsalad";

const deny = (message: string, status = 401) => NextResponse.json({ error: status === 401 ? "passcode" : "limit", message }, { status });

/** Figure out who is calling. Returns a Who, or a ready error response. */
export async function getWho(req: Request): Promise<Who | NextResponse> {
  const code = (req.headers.get("x-passcode") ?? "").trim();
  const teacherCode = process.env.APP_PASSCODE;
  const r = redis();

  if (code && teacherCode && code === teacherCode) return { role: "teacher", id: "teacher", name: "Препод" };

  if (code && r) {
    const id = await r.get<string>(`code:${code.toLowerCase()}`);
    if (id) {
      const student = await r.hget<Student>("students", id);
      if (student) {
        r.hset("seen", { [id]: new Date().toISOString() }).catch(() => {});
        return { role: "student", id, name: student.name, student };
      }
    }
  }

  // A wrong or old code never locks anyone out: they simply continue as a free visitor.

  // No code at all
  if (r) {
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    const dev = (req.headers.get("x-device") ?? "").toLowerCase();
    const id = /^[a-f0-9]{16,40}$/.test(dev) ? `dev:${dev}` : `ip:${ip}`;
    return { role: "demo", id, name: "Гость", ip };
  }
  if (teacherCode) return deny("Нужен пароль.");
  return { role: "teacher", id: "teacher", name: "Препод" }; // no passcode and no database: open app
}

export const isResponse = (x: unknown): x is NextResponse => x instanceof NextResponse;

/** Count one use of `kind` for today. Returns an error response once the daily limit is hit. */
export async function useLimit(who: Who, kind: Kind): Promise<NextResponse | null> {
  if (who.role === "teacher") return null;
  const r = redis();
  if (!r) return null;
  const limits = who.role === "demo" ? DEMO_LIMITS : { ...STUDENT_LIMITS, ...(who.student.limits ?? {}) };
  const key = `use:${who.id}:${dayKey()}:${kind}`;
  const n = await r.incr(key);
  if (n === 1) await r.expire(key, 3 * 86400);
  if (n > limits[kind]) {
    const what = { breakdown: "разборов", words: "разборов по словам", speak: "озвучек", score: "оценок" }[kind];
    return deny(
      who.role === "demo"
        ? `Демо-лимит на сегодня: ${limits[kind]} ${what}. Полный доступ — по личной ссылке от преподавателя.`
        : `Дневной лимит: ${limits[kind]} ${what}. Продолжим завтра.`,
      429
    );
  }
  return null;
}

/** Undo a counted use (e.g. the answer came from cache and cost nothing). */
export async function refund(who: Who, kind: Kind) {
  if (who.role === "teacher") return;
  const r = redis();
  if (!r) return;
  await r.decr(`use:${who.id}:${dayKey()}:${kind}`).catch(() => {});
}

export async function usage(id: string): Promise<Record<Kind, number>> {
  const r = redis();
  const out: Record<Kind, number> = { breakdown: 0, words: 0, speak: 0, score: 0 };
  if (!r) return out;
  const kinds = Object.keys(out) as Kind[];
  const vals = await r.mget<(number | null)[]>(...kinds.map((k) => `use:${id}:${dayKey()}:${k}`));
  kinds.forEach((k, i) => (out[k] = Number(vals[i] ?? 0)));
  return out;
}

/**
 * Free visitors: 5 different phrases a day. Repeating a phrase they already opened is free.
 * Also caps one network address at 40 phrases a day, so clearing the browser doesn't give unlimited use.
 */
export async function freePhraseGate(who: Who, text: string): Promise<NextResponse | null> {
  if (who.role !== "demo") return null;
  const r = redis();
  if (!r) return null;
  const day = dayKey();
  const key = `free:${who.id}:${day}`;
  const ipKey = `freeip:${who.ip}:${day}`;
  const h = text.trim().toLowerCase();
  if (await r.sismember(key, h)) return null;
  const [mine, ipCount] = await Promise.all([r.scard(key), r.scard(ipKey)]);
  if (mine >= FREE_PHRASES || ipCount >= 40) {
    return NextResponse.json(
      { error: "limit", message: `Бесплатно — ${FREE_PHRASES} фраз в день. Завтра будет ещё ${FREE_PHRASES}.`, contact: CONTACT_URL },
      { status: 429 }
    );
  }
  await r.sadd(key, h);
  await r.sadd(ipKey, h);
  await r.expire(key, 2 * 86400);
  await r.expire(ipKey, 2 * 86400);
  return null;
}

export async function freeUsed(who: Who): Promise<number> {
  const r = redis();
  if (!r || who.role !== "demo") return 0;
  return await r.scard(`free:${who.id}:${dayKey()}`);
}
