import { timingSafeEqual } from "crypto";
import { claimCode, dayKey, newId, redis } from "./store";
import type { ProSource, Student } from "./auth";
import { count } from "./analytics";
import { appBase, tg, tgConfigured } from "./telegram";
import { TELEGRAM_BOT } from "./site";

/**
 * Shadow Pro: paid, self-serve access.
 * A Pro account is a normal student account (personal code, synced progress) with `plan: "pro"` and an end date.
 * Payments come from Telegram Stars (bot) or lava.top (cards, incl. Russian ones). Both end up in grantPro().
 */

export const PRO_DAYS = 30;
const DAY = 86400000;

export const starsPrice = () => {
  const n = Math.round(Number(process.env.PRO_STARS || 450));
  return Number.isFinite(n) && n > 0 ? n : 450;
};

export type Offer = {
  telegram: boolean;
  bot: string | null;
  stars: number;
  card: boolean;
  priceRub: string;
  priceUsd: string;
  days: number;
};

/** What the paywall can show right now (depends on which keys are set in Vercel). */
export async function offer(): Promise<Offer> {
  const r = redis();
  const bot = process.env.TELEGRAM_BOT_USERNAME || (r ? await r.get<string>("cfg:bot").catch(() => null) : null) || TELEGRAM_BOT || null;
  return {
    telegram: tgConfigured() && !!r,
    bot: bot ?? null,
    stars: starsPrice(),
    card: !!(process.env.LAVA_API_KEY && process.env.LAVA_OFFER_ID && r),
    priceRub: process.env.PRO_PRICE_RUB || "690 ₽",
    priceUsd: process.env.PRO_PRICE_USD || "≈ $8",
    days: PRO_DAYS,
  };
}

/** New end date: add `days` to whichever is later, now or the current end. */
export function extendUntil(current: string | undefined, days: number, now = Date.now()): string {
  const cur = current ? Date.parse(current) : NaN;
  const base = Number.isFinite(cur) && cur > now ? cur : now;
  return new Date(base + days * DAY).toISOString();
}

export const normEmail = (e?: string | null) => (e ?? "").trim().toLowerCase();
export const validEmail = (e: string) => e.length <= 254 && /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/.test(e);
export const validNonce = (n: string) => /^[a-f0-9]{16,40}$/.test(n);

const clean = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as T;

export type Grant = {
  src: ProSource;
  email?: string;
  tg?: number;
  tgUser?: string;
  name?: string;
  until?: string; // exact end date if the payment provider tells us; otherwise we extend by `days`
  days?: number;
  lavaParent?: string;
  starsCharge?: string;
  starsSub?: string;
  autoRenew?: boolean;
};

async function findPro(g: Pick<Grant, "lavaParent" | "tg" | "email">): Promise<Student | null> {
  const r = redis()!;
  const keys = [g.lavaParent && `pro:lava:${g.lavaParent}`, g.tg && `pro:tg:${g.tg}`, g.email && `pro:email:${normEmail(g.email)}`].filter(Boolean) as string[];
  for (const k of keys) {
    const id = await r.get<string>(k);
    if (id) {
      const s = await r.hget<Student>("students", id);
      if (s) return s;
    }
  }
  return null;
}

export async function getStudent(id: string): Promise<Student | null> {
  const r = redis();
  return r ? await r.hget<Student>("students", id) : null;
}

/** Create a Pro account or extend an existing one. Never shortens access that already runs longer. */
export async function grantPro(g: Grant): Promise<{ student: Student; created: boolean }> {
  const r = redis();
  if (!r) throw new Error("База данных не подключена.");
  const existing = await findPro(g);
  const proposed = g.until && Date.parse(g.until) > Date.now() ? g.until : extendUntil(existing?.until, g.days ?? PRO_DAYS);
  const until = existing?.until && Date.parse(existing.until) > Date.parse(proposed) ? existing.until : proposed;
  const email = normEmail(g.email) || undefined;

  let student: Student;
  if (existing) {
    student = clean({
      ...existing,
      plan: "pro" as const,
      until,
      src: g.src,
      autoRenew: g.autoRenew ?? existing.autoRenew,
      email: existing.email ?? email,
      tg: existing.tg ?? g.tg,
      tgUser: g.tgUser ?? existing.tgUser,
      lavaParent: g.lavaParent ?? existing.lavaParent,
      starsCharge: g.starsCharge ?? existing.starsCharge,
      starsSub: g.starsSub ?? existing.starsSub,
    });
  } else {
    const name = (g.name || (email ? email.split("@")[0] : "") || g.tgUser || "Pro").slice(0, 40);
    const id = newId(6);
    student = clean({
      id,
      name,
      code: await claimCode(name, id),
      created: new Date().toISOString(),
      plan: "pro" as const,
      until,
      src: g.src,
      autoRenew: g.autoRenew ?? true,
      email,
      tg: g.tg,
      tgUser: g.tgUser,
      lavaParent: g.lavaParent,
      starsCharge: g.starsCharge,
      starsSub: g.starsSub,
    });
  }
  await r.hset("students", { [student.id]: student });
  if (student.email) await r.set(`pro:email:${student.email}`, student.id);
  if (student.tg) await r.set(`pro:tg:${student.tg}`, student.id);
  if (student.lavaParent) await r.set(`pro:lava:${student.lavaParent}`, student.id);
  await r.sadd("pro:ids", student.id);
  return { student, created: !existing };
}

export async function patchStudent(id: string, patch: Partial<Student>): Promise<Student | null> {
  const r = redis();
  if (!r) return null;
  const s = await r.hget<Student>("students", id);
  if (!s) return null;
  const next = clean({ ...s, ...patch });
  await r.hset("students", { [id]: next });
  return next;
}

/** Stop access right now (teacher's decision) and stop future charges. */
export async function revokePro(id: string) {
  const s = await getStudent(id);
  if (s) await cancelRenewal(s);
  return patchStudent(id, { until: new Date().toISOString(), autoRenew: false });
}

/** Take back one paid month (a refunded payment), never below today, and stop future charges. */
export async function refundMonth(id: string) {
  const s = await getStudent(id);
  if (!s) return null;
  await cancelRenewal(s);
  const end = s.until ? Date.parse(s.until) - PRO_DAYS * DAY : 0;
  return patchStudent(id, { until: new Date(Math.max(Date.now(), end)).toISOString(), autoRenew: false });
}

/** Ask the payment provider not to charge this person again. Never throws; returns whether it worked. */
export async function cancelRenewal(s: Student): Promise<boolean> {
  try {
    if (s.src === "stars" && s.tg && (s.starsSub || s.starsCharge) && tgConfigured()) {
      await tg("editUserStarSubscription", { user_id: s.tg, telegram_payment_charge_id: s.starsSub ?? s.starsCharge, is_canceled: true });
      return true;
    }
    if (s.lavaParent && s.email && process.env.LAVA_API_KEY) {
      const res = await fetch(`${lavaBase()}/api/v1/subscriptions?contractId=${encodeURIComponent(s.lavaParent)}&email=${encodeURIComponent(s.email)}`, {
        method: "DELETE",
        headers: { "X-Api-Key": process.env.LAVA_API_KEY },
      });
      return res.ok || res.status === 404;
    }
  } catch {}
  return false;
}

/**
 * Run `fn` once per `key`, even if a payment provider delivers the same event twice.
 * If `fn` fails, the key is released so the provider's retry gets processed.
 */
export class InProgress extends Error {}

export async function once<T>(key: string, fn: () => Promise<T>): Promise<T | "duplicate"> {
  const r = redis();
  if (!r) throw new Error("no db");
  if (await r.get(`done:${key}`)) return "duplicate";
  const locked = await r.set(`lock:${key}`, 1, { nx: true, ex: 120 });
  // Another delivery is working on it right now: answer with an error so the provider tries again later.
  if (!locked) throw new InProgress(key);
  try {
    const out = await fn();
    await r.set(`done:${key}`, 1, { ex: 400 * 86400 });
    return out;
  } finally {
    await r.del(`lock:${key}`).catch(() => {});
  }
}

// ---------- Claims: how a browser learns its new code after paying somewhere else ----------
/** Stored instead of a code when the payment extended an account that already existed (link sent by email). */
export const EXTENDED = "@extended";
export async function setClaim(nonce: string | null | undefined, code: string) {
  const r = redis();
  if (!r || !nonce || !validNonce(nonce)) return;
  await r.set(`claim:${nonce}`, code, { ex: 7 * 86400 });
}
export async function getClaim(nonce: string): Promise<string | null> {
  const r = redis();
  if (!r || !validNonce(nonce)) return null;
  return await r.get<string>(`claim:${nonce}`);
}

// ---------- Money log ----------
export type PayKind = "new" | "renew" | "refund" | "cancel" | "fail" | "manual";
export type PayEvent = { at: string; src: ProSource; kind: PayKind; amount: number; currency: string; who: string; studentId?: string; note?: string };

export async function logPay(e: Omit<PayEvent, "at">) {
  const r = redis();
  if (!r) return;
  try {
    await r.lpush("pay:log", clean({ at: new Date().toISOString(), ...e }));
    await r.ltrim("pay:log", 0, 999);
    if ((e.kind === "new" || e.kind === "renew") && e.amount > 0) {
      const key = `rev:${dayKey()}`;
      await r.hincrbyfloat(key, e.currency, e.amount);
      await r.hincrby(key, "payments", 1);
      await r.expire(key, 400 * 86400);
    }
    await count(`pay_${e.kind}`);
  } catch {}
}

export async function payLog(n = 50): Promise<PayEvent[]> {
  const r = redis();
  if (!r) return [];
  const raw = await r.lrange<PayEvent | string>("pay:log", 0, n - 1);
  return raw.map((x) => (typeof x === "string" ? (JSON.parse(x) as PayEvent) : x));
}

export async function proAccounts(): Promise<Student[]> {
  const r = redis();
  if (!r) return [];
  const ids = await r.smembers("pro:ids");
  if (!ids.length) return [];
  const all = await r.hmget<Record<string, Student>>("students", ...ids);
  return Object.values(all ?? {}).filter((s): s is Student => !!s && s.plan === "pro");
}

// ---------- Notifications ----------
/** A short Telegram message to the teacher (payments, daily digest). Silently does nothing if not set up. */
export async function notifyTeacher(text: string) {
  try {
    if (!tgConfigured()) return;
    const r = redis();
    const chat = process.env.TEACHER_CHAT_ID || (r ? await r.get<string>("cfg:adminChat") : null);
    if (!chat) return;
    await tg("sendMessage", { chat_id: chat, text, disable_web_page_preview: true });
  } catch {}
}

export const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Asia/Tbilisi" }) : "");

export async function personalLink(s: Student, base?: string) {
  const b = (base || (await appBase())).replace(/\/$/, "");
  return `${b}/?code=${encodeURIComponent(s.code)}`;
}

/** Email the personal link (only if Resend is set up: RESEND_API_KEY + EMAIL_FROM). */
export async function sendAccessEmail(s: Student, base?: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from || !s.email) return false;
  const link = await personalLink(s, base);
  const text = `Привет!\n\nShadow Pro активен до ${fmtDate(s.until)}.\n\nТвоя личная ссылка (открой её на телефоне и на компьютере — прогресс будет общий):\n${link}\n\nСохрани это письмо. Вопросы — пиши в Telegram: ${process.env.CONTACT_URL || "https://t.me/rawmeatsalad"}\n\nАртём, Neuro-Fluent`;
  try {
    const res = await fetch(`${process.env.RESEND_API_BASE || "https://api.resend.com"}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [s.email], subject: "Твой доступ к Shadow Pro", text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------- Telegram Stars ----------
/** A subscription invoice link: 30 days, renews automatically, cancel any time in Telegram. */
export async function starsInvoiceLink(nonce?: string | null): Promise<string> {
  const payload = nonce && validNonce(nonce) ? `n:${nonce}` : "pro";
  return (await tg("createInvoiceLink", {
    title: "Shadow Pro · 30 дней",
    description: "25 своих фраз в день вместо 5, разбор каждого слова и прогресс на всех устройствах. Продлевается раз в 30 дней, отменить можно в любой момент.",
    payload,
    currency: "XTR",
    prices: [{ label: "Shadow Pro", amount: starsPrice() }],
    subscription_period: 30 * 86400,
  })) as string;
}

// ---------- lava.top (cards: Russian and foreign) ----------
const lavaBase = () => (process.env.LAVA_API_BASE || "https://gate.lava.top").replace(/\/$/, "");
export type Currency = "RUB" | "USD" | "EUR";

export async function lavaInvoice(o: { email: string; currency: Currency; okUrl: string; failUrl: string; utm?: Record<string, string> }) {
  const res = await fetch(`${lavaBase()}/api/v3/invoice`, {
    method: "POST",
    headers: { "X-Api-Key": process.env.LAVA_API_KEY ?? "", "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      email: o.email,
      offerId: process.env.LAVA_OFFER_ID,
      currency: o.currency,
      periodicity: process.env.LAVA_PERIODICITY || "MONTHLY",
      buyerLanguage: "RU",
      successful_return_url: o.okUrl,
      failure_return_url: o.failUrl,
      cancel_return_url: o.failUrl,
      ...(o.utm && Object.keys(o.utm).length ? { clientUtm: o.utm } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; paymentUrl?: string; error?: string };
  if (!res.ok || !data.id || !data.paymentUrl) throw new Error(data.error ? `lava.top: ${data.error}` : `lava.top ответил ${res.status}`);
  return { id: data.id, url: data.paymentUrl };
}

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** lava.top sends webhooks with either an X-Api-Key header or Basic auth. Both must carry LAVA_WEBHOOK_SECRET. */
export function lavaAuthOk(req: Request): boolean {
  const secret = process.env.LAVA_WEBHOOK_SECRET;
  if (!secret) return false;
  const key = req.headers.get("x-api-key");
  if (key && same(key, secret)) return true;
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Basic ")) {
    const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
    const pass = decoded.slice(decoded.indexOf(":") + 1);
    return same(pass, secret) || same(decoded, secret);
  }
  return false;
}

export type LavaEvent = {
  eventType?: string;
  event_type?: string;
  event_id?: string;
  contractId?: string;
  parentContractId?: string | null;
  buyer?: { email?: string };
  amount?: number;
  currency?: string;
  status?: string;
  willExpireAt?: string;
  data?: { refund_id?: string; chargeback_id?: string; customer_email?: string; amount?: number; currency?: string };
};

/** Apply one lava.top webhook. Returns what happened (for logs and tests). Safe to receive twice. */
export async function handleLavaEvent(ev: LavaEvent, base?: string): Promise<string> {
  const r = redis();
  if (!r) throw new Error("no db");
  const type = ev.eventType ?? ev.event_type ?? "";
  const dedupe = ev.event_id ?? ev.data?.refund_id ?? ev.data?.chargeback_id ?? ev.contractId;
  if (dedupe) return once(`lava:${type}:${dedupe}`, () => applyLava(ev, type, base));
  return applyLava(ev, type, base);
}

async function applyLava(ev: LavaEvent, type: string, base?: string): Promise<string> {
  const r = redis()!;
  const email = normEmail(ev.buyer?.email ?? ev.data?.customer_email);
  const amount = Number(ev.amount ?? ev.data?.amount ?? 0) || 0;
  const currency = ev.currency ?? ev.data?.currency ?? "?";

  switch (type) {
    case "payment.success": {
      const subscription = (ev.status ?? "").startsWith("subscription");
      const { student, created } = await grantPro({
        src: "lava",
        email,
        days: PRO_DAYS + (subscription ? 1 : 0), // one spare day so a renewal a few hours late doesn't cut access
        lavaParent: subscription ? ev.contractId : undefined,
        autoRenew: subscription,
      });
      // The paying browser gets the code only for a brand-new account. If this email already had Pro,
      // whoever typed it might not own it: the link goes to that mailbox instead.
      const nonce = ev.contractId ? await r.get<string>(`lava:contract:${ev.contractId}`) : null;
      await setClaim(nonce, created ? student.code : EXTENDED);
      await logPay({ src: "lava", kind: "new", amount, currency, who: email, studentId: student.id });
      await notifyTeacher(`💸 Новый Pro (карта): ${email} — ${amount} ${currency}${created ? "" : " (продление)"}`);
      await sendAccessEmail(student, base);
      return "granted";
    }
    case "subscription.recurring.payment.success": {
      const { student } = await grantPro({ src: "lava", email, lavaParent: ev.parentContractId ?? undefined, days: PRO_DAYS + 1, autoRenew: true });
      await logPay({ src: "lava", kind: "renew", amount, currency, who: email, studentId: student.id });
      await notifyTeacher(`🔁 Продление Pro (карта): ${email} — ${amount} ${currency}`);
      return "extended";
    }
    case "subscription.cancelled": {
      const id = (ev.contractId && (await r.get<string>(`pro:lava:${ev.contractId}`))) || (email && (await r.get<string>(`pro:email:${email}`)));
      if (id) {
        // Keep whichever end is later: lava's paid-until date, or time added on top (manual days, another payment).
        const s = await getStudent(id);
        const lava = ev.willExpireAt && Date.parse(ev.willExpireAt) ? Date.parse(ev.willExpireAt) : 0;
        const ours = s?.until ? Date.parse(s.until) : 0;
        await patchStudent(id, { autoRenew: false, until: new Date(Math.max(lava, ours)).toISOString() });
      }
      await logPay({ src: "lava", kind: "cancel", amount: 0, currency: "", who: email, studentId: id || undefined });
      await notifyTeacher(`🚪 Отменили подписку: ${email || "?"}. Доступ до ${fmtDate(ev.willExpireAt)}.`);
      return id ? "cancelled" : "cancel-unknown";
    }
    case "payment.failed":
    case "subscription.recurring.payment.failed": {
      await logPay({ src: "lava", kind: "fail", amount, currency, who: email, note: type });
      return "noted";
    }
    case "refund.success":
    case "chargeback.initiated": {
      const id = email ? await r.get<string>(`pro:email:${email}`) : null;
      const s = id ? await refundMonth(id) : null;
      await logPay({ src: "lava", kind: "refund", amount, currency, who: email, studentId: id || undefined, note: type });
      await notifyTeacher(
        `↩️ ${type === "refund.success" ? "Возврат" : "Чарджбэк"}: ${email} — ${amount} ${currency}. Минус месяц доступа${s?.until ? `, теперь до ${fmtDate(s.until)}` : ""}, автопродление выключено.`
      );
      return "revoked";
    }
  }
  return "ignored";
}
