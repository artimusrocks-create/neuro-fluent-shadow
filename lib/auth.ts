import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { dayKey, redis } from "./store";
import { PACKS } from "./packs";

export type Kind = "breakdown" | "words" | "speak" | "score";
export type Limits = Record<Kind, number>;
export type ProSource = "stars" | "lava" | "manual";
export type Student = {
  id: string;
  name: string;
  code: string;
  created: string;
  limits?: Partial<Limits>;
  // Paid self-serve accounts have plan "pro". Students the teacher adds by hand have no plan ("class").
  plan?: "pro";
  until?: string; // Pro access ends at this moment (ISO)
  src?: ProSource;
  email?: string;
  tg?: number; // Telegram user id (Stars buyers)
  tgUser?: string;
  autoRenew?: boolean;
  lavaParent?: string; // lava.top subscription (first contract id)
  starsCharge?: string; // last Telegram Stars charge id (needed for refunds)
  starsSub?: string; // charge id of the first payment of the Stars subscription (needed to stop renewals)
};
export type Who =
  | { role: "teacher"; id: "teacher"; name: string }
  | { role: "student"; id: string; name: string; student: Student }
  | { role: "demo"; id: string; name: string; ip: string; lapsed?: Student };

export const STUDENT_LIMITS: Limits = { breakdown: 40, words: 20, speak: 300, score: 40 };
export const PRO_LIMITS: Limits = { breakdown: 25, words: 25, speak: 400, score: 60 };
export const DEMO_LIMITS: Limits = { breakdown: 5, words: 10, speak: 150, score: 30 };
/** One network address (an office Wi-Fi, a phone hotspot) can't spend more than this per day, however many browsers it uses. */
export const DEMO_IP_LIMITS: Limits = { breakdown: 40, words: 40, speak: 600, score: 120 };
/** All free visitors together, per day. A safety net so bots can't drain the API credits. Scale with FREE_BUDGET_SCALE. */
export const DEMO_GLOBAL_LIMITS: Limits = { breakdown: 600, words: 400, speak: 6000, score: 2000 };
export const FREE_PHRASES = 5;
export const CONTACT_URL = process.env.CONTACT_URL || "https://t.me/rawmeatsalad";

const globalScale = () => {
  const n = Number(process.env.FREE_BUDGET_SCALE || 1);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

const deny = (message: string, status = 401, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error: status === 401 ? "passcode" : "limit", message, ...extra }, { status });

/** Pro access counts only while it hasn't run out. Teacher-made students never run out. */
export function isActive(s: Student, now = Date.now()): boolean {
  if (s.plan !== "pro") return true;
  return !!s.until && Date.parse(s.until) > now;
}

export function limitsFor(who: Who): Limits | null {
  if (who.role === "teacher") return null;
  if (who.role === "demo") return DEMO_LIMITS;
  const base = who.student.plan === "pro" ? PRO_LIMITS : STUDENT_LIMITS;
  return { ...base, ...(who.student.limits ?? {}) };
}

/** The caller's network address. IPv6 is cut to its /64 block: one home or phone gets a whole block, so single addresses are free to rotate. */
export function clientIp(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!ip.includes(":")) return ip;
  return ip.split(":").slice(0, 4).join(":") + "::/64";
}

/** Daily voice budget in characters (ElevenLabs bills per character). Free visitors also have per-network and global caps. */
export const CHAR_LIMITS = { demo: 4000, demoIp: 12000, demoAll: 150000, pro: 30000, class: 40000 };

/** Figure out who is calling. Returns a Who, or a ready error response. */
export async function getWho(req: Request): Promise<Who | NextResponse> {
  const code = (req.headers.get("x-passcode") ?? "").trim();
  const teacherCode = process.env.APP_PASSCODE?.trim(); // a space pasted into Vercel must not lock the teacher out
  const r = redis();

  // Wrong codes are counted per network: after 30 different wrong codes a day we stop checking codes from there,
  // so nobody can guess a student's code or the teacher password by trying many.
  // The same wrong code sent again and again (an old code still saved in a browser) counts once,
  // so normal use with a stale code can't lock the teacher out of the right password.
  const missKey = `badcodes:${clientIp(req)}:${dayKey()}`;
  const guessing = code && r ? (await r.scard(missKey).catch(() => 0)) >= GUESSES_PER_DAY : false;

  if (code && teacherCode && !guessing && code === teacherCode) return { role: "teacher", id: "teacher", name: "Препод" };

  let lapsed: Student | undefined;
  if (code && r && !guessing) {
    const id = await r.get<string>(`code:${code.toLowerCase()}`);
    if (!id) await rememberMiss(missKey, code).catch(() => 0);
    if (id) {
      const student = await r.hget<Student>("students", id);
      if (student) {
        if (isActive(student)) {
          r.hset("seen", { [id]: new Date().toISOString() }).catch(() => {});
          return { role: "student", id, name: student.name, student };
        }
        lapsed = student; // Pro ran out: they continue as a free visitor until they renew.
      }
    }
  }

  // A wrong or old code never locks anyone out: they simply continue as a free visitor.
  if (r) {
    const ip = clientIp(req);
    const dev = (req.headers.get("x-device") ?? "").toLowerCase();
    const id = /^[a-f0-9]{16,40}$/.test(dev) ? `dev:${dev}` : `ip:${ip}`;
    return { role: "demo", id, name: lapsed?.name ?? "Гость", ip, ...(lapsed ? { lapsed } : {}) };
  }
  if (teacherCode) return deny("Нужен пароль.");
  return { role: "teacher", id: "teacher", name: "Препод" }; // no passcode and no database: open app
}

export const isResponse = (x: unknown): x is NextResponse => x instanceof NextResponse;

const GUESSES_PER_DAY = 30;

/** Remember a wrong code by its fingerprint (never the code itself: it may be a near-miss of the teacher password). */
async function rememberMiss(key: string, code: string) {
  const r = redis()!;
  const print = createHash("sha256").update(code.toLowerCase()).digest("hex").slice(0, 16);
  if ((await r.sadd(key, print)) === 1) await r.expire(key, 2 * 86400);
}

async function bump(key: string, ttlDays: number): Promise<number> {
  const r = redis()!;
  const n = await r.incr(key);
  if (n === 1) await r.expire(key, ttlDays * 86400);
  return n;
}

/** Count one use of `kind` for today. Returns an error response once a daily limit is hit. */
export async function useLimit(who: Who, kind: Kind): Promise<NextResponse | null> {
  if (who.role === "teacher") return null;
  const r = redis();
  if (!r) return null;
  const limits = limitsFor(who)!;
  const day = dayKey();
  const what = { breakdown: "разборов", words: "разборов по словам", speak: "озвучек", score: "оценок" }[kind];

  if (who.role === "demo") {
    const [mine, ip, all] = await Promise.all([
      bump(`use:${who.id}:${day}:${kind}`, 3),
      bump(`useip:${who.ip}:${day}:${kind}`, 2),
      bump(`useall:${day}:${kind}`, 2),
    ]);
    const upgrade = { upgrade: true, contact: CONTACT_URL };
    if (all > DEMO_GLOBAL_LIMITS[kind] * globalScale()) {
      return deny("Бесплатный лимит на сегодня уже разобрали. Завтра он обновится, а с Pro можно заниматься прямо сейчас.", 429, upgrade);
    }
    if (ip > DEMO_IP_LIMITS[kind]) {
      return deny("С этой сети сегодня уже было много бесплатных занятий. Продолжим завтра — или оформи Pro.", 429, upgrade);
    }
    if (mine > limits[kind]) {
      return deny(`Бесплатно на сегодня: ${limits[kind]} ${what}. Завтра будет ещё, а с Pro — больше.`, 429, upgrade);
    }
    return null;
  }

  const n = await bump(`use:${who.id}:${day}:${kind}`, 3);
  if (n > limits[kind]) return deny(`Дневной лимит: ${limits[kind]} ${what}. Продолжим завтра.`, 429);
  return null;
}

/** Count `n` voice characters for today. Returns an error response once over budget. */
export async function useChars(who: Who, n: number): Promise<NextResponse | null> {
  if (who.role === "teacher") return null;
  const r = redis();
  if (!r) return null;
  const day = dayKey();
  const incr = async (key: string) => {
    const v = await r.incrby(key, n);
    if (v === n) await r.expire(key, 2 * 86400);
    return v;
  };
  if (who.role === "demo") {
    const [mine, ip, all] = await Promise.all([incr(`chars:${who.id}:${day}`), incr(`charsip:${who.ip}:${day}`), incr(`charsall:${day}`)]);
    if (mine > CHAR_LIMITS.demo || ip > CHAR_LIMITS.demoIp || all > CHAR_LIMITS.demoAll * globalScale()) {
      return deny("Бесплатная озвучка на сегодня закончилась. Завтра будет ещё, а с Pro — больше.", 429, { upgrade: true, contact: CONTACT_URL });
    }
    return null;
  }
  const limit = who.student.plan === "pro" ? CHAR_LIMITS.pro : CHAR_LIMITS.class;
  if ((await incr(`chars:${who.id}:${day}`)) > limit) return deny("Дневной лимит озвучки исчерпан. Продолжим завтра.", 429);
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
 * Also caps one network address at 40 phrases a day (so clearing the browser doesn't give unlimited use)
 * and all free visitors together (so a bot can't burn the API budget).
 */
export async function freePhraseGate(who: Who, text: string): Promise<NextResponse | null> {
  if (who.role !== "demo") return null;
  const r = redis();
  if (!r) return null;
  const day = dayKey();
  const key = `free:${who.id}:${day}`;
  const counters = [`freecnt:${who.id}:${day}`, `freecntip:${who.ip}:${day}`, `useall:${day}:breakdown`];
  const h = text.trim().toLowerCase();
  if (await r.sismember(key, h)) return null; // already opened today: free
  if (!(await r.sadd(key, h))) return null; // opened by a request running at the same moment: free
  await r.expire(key, 2 * 86400);
  // Counters hand out a unique number to every request, so many requests at once can't slip past the limit.
  const [mine, ip, all] = await Promise.all(counters.map((k) => bump(k, 2)));
  const over =
    all > DEMO_GLOBAL_LIMITS.breakdown * globalScale()
      ? "Бесплатные фразы на сегодня уже разобрали. Завтра будут новые, а с Pro можно прямо сейчас."
      : mine > FREE_PHRASES || ip > DEMO_IP_LIMITS.breakdown
        ? `Бесплатно — ${FREE_PHRASES} фраз в день. Завтра будет ещё ${FREE_PHRASES}.`
        : null;
  if (!over) return null;
  await Promise.all([r.srem(key, h), ...counters.map((k) => r.decr(k))]);
  return NextResponse.json({ error: "limit", message: over, contact: CONTACT_URL, upgrade: true }, { status: 429 });
}

/** Sentences a free visitor unlocked today: only these (and their pieces) may be voiced for free. */
export async function rememberUnlocked(who: Who, sentences: string[]) {
  if (who.role !== "demo") return;
  const r = redis();
  if (!r || !sentences.length) return;
  const key = `freetxt:${who.id}:${dayKey()}`;
  await r.sadd(key, ...(sentences.map((s) => s.trim().toLowerCase()).filter(Boolean) as [string, ...string[]]));
  await r.expire(key, 2 * 86400);
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9']+/g, " ").trim();
/** Phrase-pack sentences are open to everyone (most of their audio ships pre-made anyway). */
const PACK_TEXT = PACKS.flatMap((p) => p.phrases).map(squash);

/** May this free visitor voice this text? Only pieces of sentences they unlocked today. */
export async function mayVoice(who: Who, text: string): Promise<boolean> {
  if (who.role !== "demo") return true;
  const r = redis();
  if (!r) return true;
  const t = squash(text);
  if (!t) return false;
  if (PACK_TEXT.some((s) => s.includes(t))) return true;
  const unlocked = await r.smembers(`freetxt:${who.id}:${dayKey()}`);
  return unlocked.some((s) => squash(s).includes(t));
}

export async function freeUsed(who: Who): Promise<number> {
  const r = redis();
  if (!r || who.role !== "demo") return 0;
  return await r.scard(`free:${who.id}:${dayKey()}`);
}
