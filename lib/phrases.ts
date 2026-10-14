// Public phrase pages (/phrases, /phrase/[slug]): built at deploy time from the pre-generated pack content.
// Server-only: reads files from /public/baked.
import fs from "node:fs";
import path from "node:path";
import { PACKS } from "./packs";
import BAKED from "./baked-index.json";
import { clipKey, textKey } from "./bakekey";
import { DEFAULT_VOICE } from "./voices";
import type { Sentence, WordInfo } from "./client";

export { RU } from "./ru";
import { RU } from "./ru";

export const slugify = (t: string) =>
  t
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export type PhraseEntry = { slug: string; text: string; ru: string; packId: string; packTitle: string };

export const PHRASES: PhraseEntry[] = PACKS.flatMap((p) => p.phrases.map((text) => ({ slug: slugify(text), text, ru: RU[text] ?? "", packId: p.id, packTitle: p.title })));

export const phraseBySlug = (slug: string) => PHRASES.find((p) => p.slug === slug) ?? null;

const BAKED_DIR = path.join(process.cwd(), "public", "baked");
const audioSet = new Set<string>(BAKED.a);

function readJSON<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** All sentences of a pack phrase (a phrase like "Not bad, can't complain. How about you?" is two). */
export function loadSentences(text: string): Sentence[] {
  return readJSON<{ sentences: Sentence[] }>(path.join(BAKED_DIR, "bd", `${textKey(text)}.json`))?.sentences ?? [];
}

export function loadSentence(text: string): Sentence | null {
  return loadSentences(text)[0] ?? null;
}

export function loadWords(text: string): WordInfo[] {
  return readJSON<{ words: WordInfo[] }>(path.join(BAKED_DIR, "wd", `${textKey(text)}.json`))?.words ?? [];
}

/** URL of the pre-generated clip in the default voice, or null if it wasn't baked. */
export function audioFor(text: string, speed: number): string | null {
  const k = clipKey(text, speed, DEFAULT_VOICE);
  return audioSet.has(k) ? `/baked/a/${k}.mp3` : null;
}
