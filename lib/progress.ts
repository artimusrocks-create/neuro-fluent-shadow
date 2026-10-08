"use client";

import { useSyncExternalStore } from "react";
import type { Sentence } from "./client";

// Everything here lives in the browser (localStorage) for now.
// Phase 2 moves it to a database so it follows the student across devices.

export type LibItem = { id: string; s: Sentence; box: number; due: string; added: string };
export type Counts = {
  plays: number;
  echoes: number;
  builds: number;
  records: number;
  scores: number;
  saves: number;
  reviews: number;
  reels: number;
  breakdowns: number;
};
export type State = {
  days: string[];
  counts: Counts;
  best: number;
  today: { date: string; reps: number; records: number; scores: number };
  badges: string[];
  library: LibItem[];
  settings: { gap: number; hide: boolean };
};
export type EventName = keyof Counts | "score";

const KEY = "nf-progress-v1";
const INTERVALS = [0, 1, 3, 7, 14, 30]; // days, by box

export const todayKey = (d = new Date()) => {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
const addDays = (key: string, n: number) => {
  const [y, m, d] = key.split("-").map(Number);
  return todayKey(new Date(y, m - 1, d + n));
};

const EMPTY: State = {
  days: [],
  counts: { plays: 0, echoes: 0, builds: 0, records: 0, scores: 0, saves: 0, reviews: 0, reels: 0, breakdowns: 0 },
  best: 0,
  today: { date: "", reps: 0, records: 0, scores: 0 },
  badges: [],
  library: [],
  settings: { gap: 1.2, hide: false },
};

// ---------- Badges ----------
export const BADGES: { id: string; icon: string; title: string; desc: string; test: (s: State) => boolean }[] = [
  { id: "first_play", icon: "👂", title: "Первый звук", desc: "Послушал фразу. Уже лучше, чем учебник.", test: (s) => s.counts.plays >= 1 },
  { id: "first_echo", icon: "🦜", title: "Попугай", desc: "Первое Эхо. Попугаи, кстати, без акцента.", test: (s) => s.counts.echoes >= 1 },
  { id: "first_rec", icon: "🎤", title: "Сказал gonna и не умер", desc: "Записал себя в первый раз.", test: (s) => s.counts.records >= 1 },
  { id: "first_score", icon: "🧪", title: "Смелость", desc: "Дал ИИ оценить свой акцент.", test: (s) => s.counts.scores >= 1 },
  { id: "score80", icon: "🗽", title: "Почти американец", desc: "Набрал 80+ за фразу.", test: (s) => s.best >= 80 },
  { id: "score95", icon: "🦅", title: "Где моя грин-карта?", desc: "Набрал 95+. Подозрительно хорошо.", test: (s) => s.best >= 95 },
  { id: "builds10", icon: "🧱", title: "Прораб", desc: "10 раз «По кусочкам».", test: (s) => s.counts.builds >= 10 },
  { id: "streak3", icon: "🔥", title: "Три дня подряд", desc: "Это уже привычка, а не порыв.", test: (s) => streak(s) >= 3 },
  { id: "streak7", icon: "📆", title: "Неделя без «sorry?»", desc: "7 дней подряд.", test: (s) => streak(s) >= 7 },
  { id: "lib10", icon: "⭐", title: "Коллекционер", desc: "10 фраз в «Моих фразах».", test: (s) => s.counts.saves >= 10 },
  { id: "review10", icon: "🔁", title: "Повторение — мать учения", desc: "10 повторений по расписанию.", test: (s) => s.counts.reviews >= 10 },
  { id: "reels1", icon: "🎬", title: "Блогер", desc: "Сделал первое видео для Reels.", test: (s) => s.counts.reels >= 1 },
];

export function streak(s: State): number {
  const set = new Set(s.days);
  let n = 0;
  let k = todayKey();
  if (!set.has(k)) k = addDays(k, -1); // today not done yet → count up to yesterday
  while (set.has(k)) {
    n++;
    k = addDays(k, -1);
  }
  return n;
}

export const MISSION = { reps: 3, records: 1, scores: 1 };
export function missionProgress(s: State) {
  const t = s.today.date === todayKey() ? s.today : { reps: 0, records: 0, scores: 0 };
  const parts = [
    { label: "Повторить 3 раза (Эхо или По кусочкам)", done: Math.min(t.reps, MISSION.reps), of: MISSION.reps },
    { label: "Записать себя", done: Math.min(t.records, MISSION.records), of: MISSION.records },
    { label: "Получить оценку", done: Math.min(t.scores, MISSION.scores), of: MISSION.scores },
  ];
  return { parts, complete: parts.every((p) => p.done >= p.of) };
}

// ---------- Store ----------
let state: State = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();
const badgeListeners = new Set<(ids: string[]) => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      state = { ...EMPTY, ...p, counts: { ...EMPTY.counts, ...p.counts }, settings: { ...EMPTY.settings, ...p.settings } };
    }
  } catch {}
}

function commit(next: State) {
  const before = new Set(state.badges);
  const unlocked = BADGES.filter((b) => !before.has(b.id) && b.test(next)).map((b) => b.id);
  if (unlocked.length) next = { ...next, badges: [...next.badges, ...unlocked] };
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
  listeners.forEach((f) => f());
  if (unlocked.length) badgeListeners.forEach((f) => f(unlocked));
}

export function getState(): State {
  load();
  return state;
}

export function useProgress(): State {
  return useSyncExternalStore(
    (f) => {
      load();
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => getState(),
    () => EMPTY
  );
}

export function onBadges(f: (ids: string[]) => void) {
  badgeListeners.add(f);
  return () => {
    badgeListeners.delete(f);
  };
}

const PRACTICE: EventName[] = ["echoes", "builds", "records", "scores", "reviews"];

export function track(event: EventName, value?: number) {
  const s = getState();
  const k = todayKey();
  const today = s.today.date === k ? { ...s.today } : { date: k, reps: 0, records: 0, scores: 0 };
  const counts = { ...s.counts };
  let best = s.best;
  if (event === "score") {
    counts.scores++;
    today.scores++;
    best = Math.max(best, value ?? 0);
  } else {
    counts[event]++;
  }
  if (event === "echoes" || event === "builds") today.reps++;
  if (event === "records") today.records++;
  const days = PRACTICE.includes(event) && !s.days.includes(k) ? [...s.days, k].slice(-400) : s.days;
  commit({ ...s, counts, best, today, days });
}

export function setSettings(patch: Partial<State["settings"]>) {
  const s = getState();
  commit({ ...s, settings: { ...s.settings, ...patch } });
}

// ---------- Library (spaced repetition) ----------
export const libId = (text: string) => text.trim().toLowerCase();

export function isSaved(text: string) {
  return getState().library.some((x) => x.id === libId(text));
}

export function toggleSave(s: Sentence) {
  const st = getState();
  const id = libId(s.text);
  if (st.library.some((x) => x.id === id)) {
    commit({ ...st, library: st.library.filter((x) => x.id !== id) });
    return false;
  }
  const k = todayKey();
  const item: LibItem = { id, s, box: 0, due: addDays(k, 1), added: k };
  commit({ ...st, library: [item, ...st.library], counts: { ...st.counts, saves: st.counts.saves + 1 } });
  return true;
}

export function review(text: string, good: boolean) {
  const st = getState();
  const id = libId(text);
  const k = todayKey();
  const library = st.library.map((x) => {
    if (x.id !== id) return x;
    const box = good ? Math.min(x.box + 1, INTERVALS.length - 1) : 0;
    return { ...x, box, due: addDays(k, good ? INTERVALS[box] || 1 : 0) };
  });
  commit({ ...st, library });
  track("reviews");
}

export const isDue = (x: LibItem) => x.due <= todayKey();
