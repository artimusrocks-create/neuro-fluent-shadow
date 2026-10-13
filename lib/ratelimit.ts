import { dayKey, redis } from "./store";

/** Simple daily counter: true while `key` was used fewer than `max` times today. Fails open if there's no database. */
export async function allow(key: string, max: number): Promise<boolean> {
  const r = redis();
  if (!r) return true;
  try {
    const k = `rl:${key}:${dayKey()}`;
    const n = await r.incr(k);
    if (n === 1) await r.expire(k, 2 * 86400);
    return n <= max;
  } catch {
    return true;
  }
}
