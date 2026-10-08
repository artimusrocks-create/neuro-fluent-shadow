import { Redis } from "@upstash/redis";
import { get, put } from "@vercel/blob";
import { createHash, randomBytes } from "crypto";

// ---------- Redis (accounts, progress, limits, cache) ----------
let _redis: Redis | null | undefined;
export function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  _redis = url && token ? new Redis({ url, token }) : null;
  return _redis;
}

export const hash = (s: string) => createHash("sha1").update(s).digest("hex");
export const newId = (n = 8) => randomBytes(n).toString("hex");

/** Human-friendly student code, e.g. "lena-7k3q". */
export function newCode(name: string) {
  const translit: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
    р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ы: "y", э: "e", ю: "yu", я: "ya",
  };
  const base =
    name
      .toLowerCase()
      .split("")
      .map((c) => translit[c] ?? c)
      .join("")
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 10) || "student";
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
  const tail = Array.from(randomBytes(4), (b) => alphabet[b % alphabet.length]).join("");
  return `${base}-${tail}`;
}

export const dayKey = () => {
  // Days roll over in Tbilisi time (UTC+4), where the teacher lives.
  const d = new Date(Date.now() + 4 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
};

/** Cache JSON in Redis. Returns cached value or computes, stores and returns it. */
export async function cached<T>(key: string, ttlDays: number, compute: () => Promise<T>): Promise<T> {
  const r = redis();
  if (r) {
    try {
      const hit = await r.get<T>(key);
      if (hit) return hit;
    } catch {}
  }
  const value = await compute();
  if (r) {
    try {
      await r.set(key, value, { ex: ttlDays * 86400 });
    } catch {}
  }
  return value;
}

// ---------- Blob (recordings, voice cache) ----------
export const hasBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
type Access = "public" | "private";
export type Stored = { pathname: string; url: string; access: Access };

/** Upload a file. Works whether the store was created public or private. */
export async function blobPut(pathname: string, body: Blob | Buffer | string, contentType: string): Promise<Stored> {
  for (const access of ["private", "public"] as Access[]) {
    try {
      const r = await put(pathname, body, { access, contentType, addRandomSuffix: false, allowOverwrite: true });
      return { pathname: r.pathname, url: r.url, access };
    } catch (e) {
      if (access === "public") throw e;
    }
  }
  throw new Error("unreachable");
}

export async function blobRead(s: { pathname: string; access: Access }): Promise<{ stream: ReadableStream; type: string } | null> {
  try {
    const r = await get(s.pathname, { access: s.access });
    if (!r) return null;
    return { stream: r.stream as ReadableStream, type: r.blob.contentType || "application/octet-stream" };
  } catch {
    return null;
  }
}

export async function blobReadText(s: { pathname: string; access: Access }): Promise<string | null> {
  const r = await blobRead(s);
  if (!r) return null;
  return await new Response(r.stream).text();
}
