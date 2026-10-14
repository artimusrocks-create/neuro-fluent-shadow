import { describe, expect, it } from "vitest";
import { splitSentences } from "@/lib/sentences";

describe("a pasted text becomes one practice step per sentence", () => {
  it("splits sentences and lines, keeps the text as written", () => {
    expect(splitSentences("I'm running late. Traffic is crazy today! Can we start without me?")).toEqual([
      "I'm running late.",
      "Traffic is crazy today!",
      "Can we start without me?",
    ]);
    // Subtitles and lyrics: a line break ends a line even without a full stop.
    expect(splitSentences("You gotta be kidding me\nWe need to talk\n\n  Let me get this straight  ")).toEqual([
      "You gotta be kidding me",
      "We need to talk",
      "Let me get this straight",
    ]);
  });

  it("a tiny piece like «Hey!» stays with the next sentence: one step, one breakdown", () => {
    expect(splitSentences("Hey! How's it going? Not bad, can't complain.")).toEqual(["Hey! How's it going?", "Not bad, can't complain."]);
  });

  it("a long run-on line is cut at commas so every piece can be voiced and repeated", () => {
    const line = Array.from({ length: 30 }, (_, i) => `this is part number ${i}`).join(", ");
    const parts = splitSentences(line);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(300);
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(line);
  });

  it("nothing in, nothing out", () => {
    expect(splitSentences("  \n \n ")).toEqual([]);
  });
});
