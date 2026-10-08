import { normWord, splitWords, WordTiming } from "./client";

export type WordVerdict = "ok" | "missed" | "short" | "heavy";
export type ScoreResult = {
  total: number; // 0..100
  intelligibility: number; // 0..100
  rhythm: number; // 0..100
  pace: number; // 0..100
  paceRatio: number; // you / model
  heard: string;
  words: { word: string; verdict: WordVerdict }[];
  accent: number; // 0..100, "Russian accent meter"
  verdict: string;
  advice: string[];
};

// Speech recognition often writes reductions as one word. Expand them so they match the written text.
const EXPAND: Record<string, string[]> = {
  gonna: ["going", "to"],
  wanna: ["want", "to"],
  gotta: ["got", "to"],
  hafta: ["have", "to"],
  hasta: ["has", "to"],
  kinda: ["kind", "of"],
  sorta: ["sort", "of"],
  outta: ["out", "of"],
  lotta: ["lot", "of"],
  dunno: ["don't", "know"],
  lemme: ["let", "me"],
  gimme: ["give", "me"],
  whatcha: ["what", "are", "you"],
  "y'all": ["you", "all"],
  "c'mon": ["come", "on"],
};

type Timed = { w: string; start: number; end: number };

function expand(words: WordTiming[]): Timed[] {
  const out: Timed[] = [];
  for (const x of words) {
    const n = normWord(x.word);
    if (!n) continue;
    const parts = EXPAND[n];
    if (!parts) {
      out.push({ w: n, start: x.start, end: x.end });
      continue;
    }
    const step = (x.end - x.start) / parts.length;
    parts.forEach((p, i) => out.push({ w: p, start: x.start + i * step, end: x.start + (i + 1) * step }));
  }
  return out;
}

/** Longest common subsequence alignment → pairs of [targetIndex, userIndex]. */
function align(a: string[], b: string[]): [number, number][] {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

function verdictFor(total: number): string {
  if (total >= 90) return "Звучит как у носителя.";
  if (total >= 75) return "Очень близко. Осталось чуть-чуть.";
  if (total >= 55) return "Понятно, но акцент слышен.";
  if (total >= 35) return "Носитель переспросит. Попробуй ещё раз.";
  return "Давай ещё раз, медленнее.";
}

export function scoreTake(opts: { target: string; stressed: boolean[]; model: WordTiming[]; user: WordTiming[]; heard: string }): ScoreResult {
  const targetWords = splitWords(opts.target);
  const t = targetWords.map(normWord);
  const model = expand(opts.model);
  const user = expand(opts.user);

  const tu = align(t, user.map((x) => x.w)); // target ↔ user
  const tm = align(t, model.map((x) => x.w)); // target ↔ model
  const userAt = new Map(tu);
  const modelAt = new Map(tm);

  const intel = t.length ? tu.length / t.length : 0;

  const span = (xs: Timed[]) => (xs.length ? Math.max(0.2, xs[xs.length - 1].end - xs[0].start) : 0);
  const userTotal = span(user);
  const modelTotal = span(model);

  // Share of total time each word takes, for words both voices said.
  const shares: { i: number; u: number; m: number }[] = [];
  t.forEach((_, i) => {
    const ui = userAt.get(i);
    const mi = modelAt.get(i);
    if (ui === undefined || mi === undefined || !userTotal || !modelTotal) return;
    const u = (user[ui].end - user[ui].start) / userTotal;
    const m = (model[mi].end - model[mi].start) / modelTotal;
    shares.push({ i, u, m });
  });

  let rhythm = 0.6;
  if (shares.length >= 3) rhythm = clamp01((pearson(shares.map((s) => s.u), shares.map((s) => s.m)) + 0.2) / 1.0);

  const paceRatio = modelTotal ? userTotal / modelTotal : 1;
  const pace = paceRatio >= 0.8 && paceRatio <= 1.25 ? 1 : clamp01(1 - Math.abs(Math.log(paceRatio / (paceRatio > 1 ? 1.25 : 0.8))) * 1.6);

  const words = targetWords.map((word, i) => {
    if (!userAt.has(i)) return { word, verdict: "missed" as WordVerdict };
    const s = shares.find((x) => x.i === i);
    if (s && opts.stressed[i] && s.u / s.m < 0.55) return { word, verdict: "short" as WordVerdict };
    if (s && !opts.stressed[i] && s.u / s.m > 2) return { word, verdict: "heavy" as WordVerdict };
    return { word, verdict: "ok" as WordVerdict };
  });

  // Missing words hurt twice: once directly, and they also discount rhythm and pace.
  const total = Math.round(100 * (0.55 * intel * intel + 0.3 * rhythm * intel + 0.15 * pace * intel));

  const advice: string[] = [];
  const missed = words.filter((w) => w.verdict === "missed").map((w) => w.word);
  const short = words.filter((w) => w.verdict === "short").map((w) => w.word);
  const heavy = words.filter((w) => w.verdict === "heavy").map((w) => w.word);
  if (missed.length) advice.push(`Не расслышали: ${missed.join(", ")}.`);
  if (short.length) advice.push(`Ударные слова слишком короткие: ${short.join(", ")}. Сделай их громче и длиннее.`);
  if (heavy.length) advice.push(`Служебные слова слишком чёткие: ${heavy.join(", ")}. Говори их тише и быстрее.`);
  if (paceRatio > 1.35) advice.push(`Ты медленнее модели в ${paceRatio.toFixed(1)} раза.`);
  if (paceRatio < 0.7) advice.push("Ты быстрее модели. Важнее ритм, чем скорость.");
  if (!advice.length) advice.push("Чисто. Попробуй на скорости 1.15.");

  return {
    total,
    intelligibility: Math.round(intel * 100),
    rhythm: Math.round(rhythm * 100),
    pace: Math.round(pace * 100),
    paceRatio,
    heard: opts.heard,
    words,
    accent: 100 - total,
    verdict: verdictFor(total),
    advice,
  };
}
