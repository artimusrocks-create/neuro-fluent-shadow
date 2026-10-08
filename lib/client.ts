"use client";

// ---------- Types ----------
export type Blob_ = { written: string; blob: string; rule: string };
export type Sentence = {
  text: string;
  clear: string;
  fast: string;
  rhythm: string;
  blobs: Blob_[];
  chunks: string[];
  shadow_tip?: string;
  ru_tip?: string;
  flags?: string[];
  cyrillic?: Record<string, string>;
};
export type WordTiming = { word: string; start: number; end: number };
export type Clip = { url: string; words: WordTiming[] };
export type WordInfo = {
  word: string;
  type: "content" | "function";
  ru?: string;
  sound?: string;
  note?: string;
  nuance?: string;
  etymology?: string;
  etymology_unsure?: boolean;
  collocations?: { en: string; ru: string }[];
};

// ---------- Passcode ----------
const PASS_KEY = "nf-passcode";
export function getPasscode(): string {
  try {
    return localStorage.getItem(PASS_KEY) ?? "";
  } catch {
    return "";
  }
}
export function setPasscode(v: string) {
  try {
    localStorage.setItem(PASS_KEY, v);
  } catch {}
}

export class ApiError extends Error {
  constructor(public kind: "passcode" | "server", message: string) {
    super(message);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-passcode": getPasscode() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data?.error === "passcode" ? "passcode" : "server", data?.message || `Запрос не прошёл (${res.status}).`);
  }
  return data as T;
}

// ---------- API calls ----------
export const fetchBreakdown = (text: string, cyrillic: boolean) =>
  post<{ sentences: Sentence[] }>("/api/breakdown", { text, cyrillic });

export const fetchWords = (sentence: string) => post<{ words: WordInfo[] }>("/api/words", { sentence });

const clipCache = new Map<string, Promise<Clip>>();
export function fetchClip(text: string, speed: number): Promise<Clip> {
  const key = `${speed}|${text}`;
  const hit = clipCache.get(key);
  if (hit) return hit;
  const p = post<{ audio: string; words: WordTiming[] }>("/api/speak", { text, speed }).then(({ audio, words }) => {
    const bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
    return { url, words: words ?? [] };
  });
  clipCache.set(key, p);
  p.catch(() => clipCache.delete(key));
  return p;
}

// ---------- Audio player (one at a time, cancellable) ----------
export class Cancelled extends Error {}

let audioEl: HTMLAudioElement | null = null;
let runId = 0;
let stopHooks: (() => void)[] = [];

function el(): HTMLAudioElement {
  if (!audioEl) audioEl = new Audio();
  return audioEl;
}

/** Start a new run; stops whatever was playing. Returns a token to check with alive(). */
export function newRun(): number {
  stopAll();
  return runId;
}
export function alive(token: number) {
  return token === runId;
}
export function stopAll() {
  runId++;
  const a = el();
  a.pause();
  stopHooks.forEach((f) => f());
  stopHooks = [];
}

/** Play a URL. onTime gets currentTime on each animation frame. Resolves on end, rejects Cancelled if stopped. */
export function playUrl(token: number, url: string, onTime?: (t: number) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!alive(token)) return reject(new Cancelled());
    const a = el();
    a.src = url;
    a.currentTime = 0;
    let raf = 0;
    const tick = () => {
      onTime?.(a.currentTime);
      raf = requestAnimationFrame(tick);
    };
    const cleanup = () => {
      cancelAnimationFrame(raf);
      a.onended = null;
      a.onerror = null;
    };
    a.onended = () => {
      cleanup();
      resolve(a.duration || 0);
    };
    a.onerror = () => {
      cleanup();
      reject(new Error("Звук не воспроизводится."));
    };
    stopHooks.push(() => {
      cleanup();
      reject(new Cancelled());
    });
    a.play()
      .then(() => {
        raf = requestAnimationFrame(tick);
      })
      .catch((e) => {
        cleanup();
        reject(e);
      });
  });
}

/** Wait ms, cancellable. onProgress gets 0→1. */
export function wait(token: number, ms: number, onProgress?: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!alive(token)) return reject(new Cancelled());
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / ms);
      onProgress?.(p);
      if (p >= 1) return resolve();
      raf = requestAnimationFrame(tick);
    };
    stopHooks.push(() => {
      cancelAnimationFrame(raf);
      reject(new Cancelled());
    });
    raf = requestAnimationFrame(tick);
  });
}

// ---------- Text helpers ----------
export const splitWords = (s: string) => s.trim().split(/\s+/).filter(Boolean);
export const normWord = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, "");

/** Word index (in the sentence) where a fragment starts, or -1. */
export function findOffset(sentence: string, fragment: string): number {
  const s = splitWords(sentence).map(normWord);
  const f = splitWords(fragment).map(normWord);
  if (!f.length) return -1;
  for (let i = 0; i + f.length <= s.length; i++) {
    if (f.every((w, j) => s[i + j] === w)) return i;
  }
  return -1;
}

/** Which timed word is being spoken at time t. */
export function wordAt(words: WordTiming[], t: number): number {
  let idx = -1;
  for (let i = 0; i < words.length; i++) {
    if (words[i].start <= t + 0.03) idx = i;
    else break;
  }
  return idx;
}
