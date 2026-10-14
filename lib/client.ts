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

// ---------- Baked (pre-generated) pack content ----------
import BAKED from "./baked-index.json";
import { clipKey, textKey } from "./bakekey";
import { DEFAULT_VOICE } from "./voices";

const bakedSet = { bd: new Set(BAKED.bd), wd: new Set(BAKED.wd), a: new Set(BAKED.a) };
/** True when this phrase ships pre-generated with the app (no AI call, no free-limit cost). */
export const isBaked = (text: string) => bakedSet.bd.has(textKey(text));
async function getStatic<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

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

/** Anonymous id for this browser, so free visitors each get their own 5 phrases. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem("nf-device");
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("nf-device", id);
    }
    return id;
  } catch {
    return "";
  }
}
const authHeaders = () => ({ "x-passcode": getPasscode(), "x-device": deviceId() });
const errKind = (e: unknown): "passcode" | "limit" | "server" => (e === "passcode" ? "passcode" : e === "limit" ? "limit" : "server");

export class ApiError extends Error {
  constructor(public kind: "passcode" | "limit" | "server", message: string) {
    super(message);
  }
}

/** Inside the Google Play app, limit messages must not mention buying anything. */
function apiError(data: { error?: string; message?: string }, status: number) {
  const kind = errKind(data?.error);
  const message = kind === "limit" && isStoreApp() ? "На сегодня бесплатный лимит закончился. Завтра будет ещё." : data?.message || `Запрос не прошёл (${status}).`;
  return new ApiError(kind, message);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw apiError(data, res.status);
  return data as T;
}

// ---------- API calls ----------
export type MyRec = { id: string; text: string; score: number | null; at: string; feedback: string | null; feedbackAt: string | null; audio: string; name: string; studentId: string; seen: boolean };
export type Offer = { telegram: boolean; bot: string | null; stars: number; card: boolean; priceRub: string; priceUsd: string; days: number };
export type Me = {
  role: "teacher" | "student" | "demo";
  plan: "teacher" | "class" | "pro" | "free";
  name: string;
  db: boolean;
  assigned: string[];
  recs: MyRec[];
  progress: unknown;
  limits?: Record<string, number>;
  usage?: Record<string, number>;
  free?: { used: number; limit: number; contact: string };
  pro?: { until: string | null; autoRenew: boolean; src: string | null };
  lapsed?: { until: string | null };
  offer: Offer;
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), ...authHeaders() } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw apiError(data, res.status);
  return data as T;
}

export const fetchMe = () => call<Me>("/api/me");
export const saveProgressRemote = (progress: unknown) =>
  call<{ ok: boolean }>("/api/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ progress }) });
export function sendToTeacher(take: Blob, text: string, score: number | null) {
  const fd = new FormData();
  fd.append("file", take, "take.webm");
  fd.append("text", text);
  if (score !== null) fd.append("score", String(score));
  return call<{ ok: boolean }>("/api/send", { method: "POST", body: fd });
}
export const teacherGet = <T,>() => call<T>("/api/teacher");
export const teacherDo = <T,>(body: Record<string, unknown>) =>
  call<T>("/api/teacher", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
/** Audio URL for a recording, with the code so the <audio> tag is allowed to load it. */
export const recAudioUrl = (r: { audio: string }) => `${r.audio}&code=${encodeURIComponent(getPasscode())}`;
export async function fetchBreakdown(text: string, cyrillic: boolean): Promise<{ sentences: Sentence[] }> {
  const k = textKey(text);
  if (bakedSet.bd.has(k)) {
    const hit = await getStatic<{ sentences: Sentence[] }>(`/baked/bd/${k}.json`);
    if (hit) return hit;
  }
  return post<{ sentences: Sentence[] }>("/api/breakdown", { text, cyrillic });
}

export async function fetchWords(sentence: string): Promise<{ words: WordInfo[] }> {
  const k = textKey(sentence);
  if (bakedSet.wd.has(k)) {
    const hit = await getStatic<{ words: WordInfo[] }>(`/baked/wd/${k}.json`);
    if (hit) return hit;
  }
  return post<{ words: WordInfo[] }>("/api/words", { sentence });
}

export async function fetchScoreWords(take: Blob): Promise<{ text: string; words: WordTiming[] }> {
  const fd = new FormData();
  fd.append("file", take, "take.webm");
  const res = await fetch("/api/score", { method: "POST", headers: authHeaders(), body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw apiError(data, res.status);
  return data;
}

const clipCache = new Map<string, Promise<Clip>>();
export function fetchClip(text: string, speed: number, voice = ""): Promise<Clip> {
  const key = `${voice}|${speed}|${text}`;
  const hit = clipCache.get(key);
  if (hit) return hit;
  const live = () =>
    post<{ audio: string; words: WordTiming[] }>("/api/speak", { text, speed, voice }).then(({ audio, words }) => {
      const bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
      return { url, words: words ?? [] };
    });
  const bk = clipKey(text, speed, voice || DEFAULT_VOICE);
  const p: Promise<Clip> = bakedSet.a.has(bk)
    ? getStatic<WordTiming[]>(`/baked/a/${bk}.json`).then((words) => (words ? { url: `/baked/a/${bk}.mp3`, words } : live()))
    : live();
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
export function playUrl(token: number, url: string, onTime?: (t: number) => void, rate = 1): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!alive(token)) return reject(new Cancelled());
    const a = el();
    a.defaultPlaybackRate = rate;
    a.src = url;
    a.currentTime = 0;
    a.playbackRate = rate;
    (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
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
      resolve((a.duration || 0) / rate);
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
        a.playbackRate = rate;
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

// ---------- Analytics (anonymous counters) ----------
export function trackEvent(e: string) {
  try {
    const body = JSON.stringify({ e, d: deviceId() });
    if (navigator.sendBeacon?.("/api/event", body)) return;
    fetch("/api/event", { method: "POST", body, keepalive: true }).catch(() => {});
  } catch {}
}
/** Count an event at most once per day on this device. */
export function trackOnce(e: string) {
  try {
    const k = `nf-ev-${e}`;
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(k) === today) return;
    localStorage.setItem(k, today);
  } catch {}
  trackEvent(e);
}

// ---------- Where the app runs ----------
const APP_KEY = "nf-app";
/**
 * Inside the Android app from Google Play: no prices or payment links (Play's rules).
 * Remembered per tab (sessionStorage): the app shares Chrome's storage, and normal Chrome should still show prices.
 */
export function isStoreApp(): boolean {
  try {
    if (sessionStorage.getItem(APP_KEY) === "android") return true;
    if (document.referrer.startsWith("android-app://com.neurofluent.shadow")) {
      sessionStorage.setItem(APP_KEY, "android");
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
export function markStoreApp() {
  try {
    sessionStorage.setItem(APP_KEY, "android");
  } catch {}
}
type TgWebApp = {
  initData?: string;
  ready: () => void;
  expand: () => void;
  openInvoice?: (url: string, cb?: (status: "paid" | "cancelled" | "failed" | "pending") => void) => void;
  openTelegramLink?: (url: string) => void;
};
export function telegramApp(): TgWebApp | null {
  const w = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
  return w && w.initData ? w : null;
}

// ---------- UTM (where a visitor came from) ----------
const UTM_KEY = "nf-utm";
export function rememberUtm(url: URL) {
  try {
    const utm = Object.fromEntries(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].map((k) => [k, url.searchParams.get(k) ?? ""]).filter(([, v]) => v));
    if (Object.keys(utm).length) localStorage.setItem(UTM_KEY, JSON.stringify(utm));
  } catch {}
}
export function savedUtm(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(UTM_KEY) ?? "{}");
  } catch {
    return {};
  }
}

// ---------- Pro: pay, then claim the personal code ----------
const CLAIM_KEY = "nf-claim";
export function newNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
}
export function pendingClaim(): string | null {
  try {
    const c = JSON.parse(localStorage.getItem(CLAIM_KEY) ?? "null") as { nonce: string; at: number } | null;
    return c && Date.now() - c.at < 3 * 86400000 ? c.nonce : null;
  } catch {
    return null;
  }
}
export function setPendingClaim(nonce: string | null) {
  try {
    if (nonce) localStorage.setItem(CLAIM_KEY, JSON.stringify({ nonce, at: Date.now() }));
    else localStorage.removeItem(CLAIM_KEY);
  } catch {}
}
export const startStars = (nonce: string) => post<{ link: string; bot: string | null }>("/api/pro/stars", { nonce });
export const startCard = (nonce: string, email: string, currency: "RUB" | "USD" | "EUR") =>
  post<{ url: string }>("/api/pro/checkout", { nonce, email, currency, utm: savedUtm() });
export const restoreAccess = (email: string) => post<{ sent?: boolean; manual?: boolean; contact?: string }>("/api/pro/restore", { email });
/** A message to the teacher without leaving the app: a flagged AI answer, or a request to delete one's data. */
export const sendReport = (r: { kind: "ai" | "delete"; text?: string; where?: string; note?: string; contact?: string }) => post<{ ok: boolean }>("/api/report", r);
/** Has the payment for this checkout arrived? `code` for a new account; `extended` if it extended an account that already had this email. */
export async function checkClaim(nonce: string): Promise<{ code?: string; extended?: boolean } | null> {
  try {
    const res = await fetch(`/api/pro/claim?nonce=${encodeURIComponent(nonce)}`, { cache: "no-store" });
    const data = (await res.json()) as { code?: string; extended?: boolean };
    return data.code || data.extended ? data : null;
  } catch {
    return null;
  }
}
