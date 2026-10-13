import { describe, expect, it } from "vitest";
import { PHRASES, RU, audioFor, loadSentences, loadWords, slugify } from "@/lib/phrases";
import { PACKS } from "@/lib/packs";
import { clipKey, textKey } from "@/lib/bakekey";
import { scoreTake } from "@/lib/score";
import { parseLooseJSON } from "@/lib/server";

describe("phrase pages content", () => {
  it("every pack phrase has a unique address", () => {
    const slugs = PHRASES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugify("I'll have what she's having.")).toBe("ill-have-what-shes-having");
  });
  it("every pack phrase has a Russian translation", () => {
    const missing = PACKS.flatMap((p) => p.phrases).filter((t) => !RU[t]);
    expect(missing).toEqual([]);
  });
  it("every pack phrase ships with its breakdown, word notes and audio", () => {
    for (const p of PHRASES) {
      const sentences = loadSentences(p.text);
      expect(sentences.length, p.text).toBeGreaterThan(0);
      for (const s of sentences) {
        expect(loadWords(s.text).length, s.text).toBeGreaterThan(0);
        expect(audioFor(s.text, 1), s.text).not.toBeNull();
        expect(audioFor(s.text, 0.75), s.text).not.toBeNull();
      }
    }
  });
});

describe("keys for pre-generated files", () => {
  it("are stable and ignore case/spacing for text", () => {
    expect(textKey("Can I  get a coffee?")).toBe(textKey("can i get a coffee?"));
    expect(clipKey("Hi", 1, "v")).not.toBe(clipKey("Hi", 0.75, "v"));
  });
});

describe("scoring", () => {
  const target = "Can I get a coffee to go?";
  const words = target.split(" ").map((w, i) => ({ word: w, start: i * 0.3, end: i * 0.3 + 0.25 }));
  const stressed = [false, false, true, false, true, false, true];
  it("a take that matches the model scores high", () => {
    const r = scoreTake({ target, stressed, model: words, user: words, heard: target });
    expect(r.total).toBeGreaterThanOrEqual(80);
    expect(r.words.every((w) => w.verdict === "ok")).toBe(true);
  });
  it("missing words cost points", () => {
    const user = words.filter((_, i) => i < 3);
    const r = scoreTake({ target, stressed, model: words, user, heard: "Can I get" });
    expect(r.total).toBeLessThan(80);
    expect(r.words.some((w) => w.verdict === "missed")).toBe(true);
  });
});

describe("reading Claude's JSON", () => {
  it("survives code fences and chatter", () => {
    expect(parseLooseJSON<{ a: number }>('Sure! ```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseLooseJSON<{ a: number }>('Here: {"a":2} hope it helps')).toEqual({ a: 2 });
    expect(() => parseLooseJSON("no json at all")).toThrow();
  });
});
