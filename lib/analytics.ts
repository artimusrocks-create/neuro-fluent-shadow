import { dayKey, redis } from "./store";

/**
 * First-party, privacy-friendly counters: how many people did X today. No cookies, no third parties.
 * Stored per day in Redis for 120 days. The teacher dashboard and the daily Telegram digest read them.
 */

/** Events the browser may report through /api/event (anything else is ignored). */
export const CLIENT_EVENTS = [
  "visit", // opened the app (once a day per device)
  "landing", // opened the landing page
  "seo", // opened a public phrase page
  "phrase", // asked for a new phrase breakdown
  "pack", // started a phrase pack
  "record", // recorded themselves
  "limit", // hit the free limit
  "paywall", // saw the Pro offer
  "checkout_stars", // tapped "pay with Telegram Stars"
  "checkout_card", // tapped "pay by card"
  "pro_activated", // a payment turned this device into Pro
  "android", // opened inside the Android app
  "telegram", // opened inside Telegram
] as const;
export type ClientEvent = (typeof CLIENT_EVENTS)[number];

const TTL = 120 * 86400;

export async function count(event: string, n = 1, day = dayKey()) {
  const r = redis();
  if (!r) return;
  try {
    await r.hincrby(`ev:${day}`, event, n);
    await r.expire(`ev:${day}`, TTL);
  } catch {}
}

/** Count unique devices for an event (HyperLogLog: tiny, approximate). */
export async function unique(event: string, id: string, day = dayKey()) {
  const r = redis();
  if (!r || !id) return;
  try {
    await r.pfadd(`uv:${day}:${event}`, id);
    await r.expire(`uv:${day}:${event}`, TTL);
  } catch {}
}

export function lastDays(n: number, from = dayKey()): string[] {
  const [y, m, d] = from.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  return Array.from({ length: n }, (_, i) => new Date(base - i * 86400000).toISOString().slice(0, 10));
}

export type DayStats = { day: string; visitors: number; events: Record<string, number>; revenue: Record<string, number> };

/** Events, unique visitors and revenue for the last `n` days, newest first. */
export async function stats(n = 7): Promise<DayStats[]> {
  const r = redis();
  const days = lastDays(n);
  if (!r) return days.map((day) => ({ day, visitors: 0, events: {}, revenue: {} }));
  return Promise.all(
    days.map(async (day) => {
      const [events, visitors, revenue] = await Promise.all([
        r.hgetall<Record<string, number>>(`ev:${day}`).catch(() => null),
        r.pfcount(`uv:${day}:visit`).catch(() => 0),
        r.hgetall<Record<string, number>>(`rev:${day}`).catch(() => null),
      ]);
      const num = (o: Record<string, unknown> | null) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, Number(v) || 0]));
      return { day, visitors: Number(visitors) || 0, events: num(events), revenue: num(revenue) };
    })
  );
}
