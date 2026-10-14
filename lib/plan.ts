// «21 день до естественного звучания»: the plan behind «Начать тренировку».
// A plan day counts when you really practiced (repeated after the voice, recorded yourself…), not by the
// calendar: miss a day and the plan simply waits. One plan day per calendar day.
import { PACKS, type Pack } from "./packs";
import { todayKey, type State } from "./progress";

export type PlanDay = { day: number; week: 1 | 2 | 3; pack?: Pack; own?: boolean; task: string };

const pack = (id: string) => PACKS.find((p) => p.id === id) as Pack;

export const WEEKS: Record<1 | 2 | 3, { title: string; goal: string }> = {
  1: { title: "Ритм", goal: "Громкие слова громко, маленькие быстро и тихо." },
  2: { title: "Склейки", goal: "had a → hada, want to → wanna: слова сливаются в одно." },
  3: { title: "Скорость", goal: "Быстрее, на слух и со своим текстом: как в жизни." },
};

export const PLAN: PlanDay[] = [
  ...["cafe", "smalltalk", "calls", "travel", "shops", "dating", "shows"].map((id, i) => ({
    day: i + 1,
    week: 1 as const,
    pack: pack(id),
    task: "Повтори каждую фразу за голосом три раза",
  })),
  { day: 8, week: 2, pack: pack("slang"), task: "Повтори за голосом и запиши себя хотя бы на одной фразе" },
  ...["cafe", "smalltalk", "calls", "travel", "shops", "dating"].map((id, i) => ({
    day: 9 + i,
    week: 2 as const,
    pack: pack(id),
    task: "Послушай каждую склейку отдельно, потом запиши себя. Цель: 70+",
  })),
  { day: 15, week: 3, pack: pack("shows"), task: "Скорость 1.15× и режим «Сначала на слух» в настройках" },
  { day: 16, week: 3, own: true, task: "Свой текст: вставь письмо или реплику для созвона" },
  ...["slang", "calls", "smalltalk"].map((id, i) => ({
    day: 17 + i,
    week: 3 as const,
    pack: pack(id),
    task: "Скорость 1.15×: успей за голосом. Цель: 80+",
  })),
  { day: 20, week: 3, own: true, task: "Свой текст: отрепетируй вслух, что скажешь на работе" },
  { day: 21, week: 3, own: true, task: "Финал: свой текст целиком и оценка 80+ 🎓" },
];

/** Where you are in the plan: today's step, whether it's done, how many days are behind you. */
export function planState(s: Pick<State, "days">, today = todayKey()) {
  const doneToday = s.days.includes(today);
  const done = Math.min(s.days.length, PLAN.length);
  const n = Math.min(PLAN.length, doneToday ? Math.max(1, done) : done + 1);
  return { n, item: PLAN[n - 1], next: PLAN[n] ?? null, doneToday, done, finished: s.days.length >= PLAN.length };
}

/** What a plan day is about, in a few words: «тема «Small talk»» or «свой текст». */
export const planLabel = (d: PlanDay) => (d.pack ? `тема «${d.pack.title}»` : "свой текст");
