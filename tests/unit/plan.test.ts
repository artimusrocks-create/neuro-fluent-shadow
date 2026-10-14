import { describe, expect, it } from "vitest";
import { PLAN, planState } from "@/lib/plan";

const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}`;

describe("21-day plan", () => {
  it("has 21 days, each a topic or your own text, three weeks", () => {
    expect(PLAN.map((d) => d.day)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    for (const d of PLAN) expect(Boolean(d.pack) !== Boolean(d.own)).toBe(true);
    expect(new Set(PLAN.map((d) => d.week))).toEqual(new Set([1, 2, 3]));
  });

  it("a new visitor starts at day 1 with the café topic", () => {
    const p = planState({ days: [] }, day(14));
    expect(p).toMatchObject({ n: 1, done: 0, doneToday: false });
    expect(p.item.pack?.id).toBe("cafe");
  });

  it("counts practice days, not calendar days: a missed day just waits", () => {
    expect(planState({ days: [day(1), day(5), day(9)] }, day(14))).toMatchObject({ n: 4, done: 3, doneToday: false });
    // Practiced today: today's step is done, and tomorrow's is shown as next.
    const today = planState({ days: [day(1), day(5), day(14)] }, day(14));
    expect(today).toMatchObject({ n: 3, done: 3, doneToday: true });
    expect(today.next?.day).toBe(4);
  });

  it("after 21 practice days the plan is finished and stays on the last day", () => {
    const days = Array.from({ length: 25 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`);
    expect(planState({ days }, day(14))).toMatchObject({ n: 21, done: 21, finished: true });
  });
});
