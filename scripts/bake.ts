// Pre-generates everything the phrase packs need, so packs never call the AI live.
//   npx tsx scripts/bake.ts            → breakdowns + word notes + audio
//   npx tsx scripts/bake.ts --dry      → only count how many voice characters audio would use
// Safe to re-run: files that already exist are skipped. Needs .env.local keys.
import fs from "node:fs";
import path from "node:path";
import { PACKS } from "../lib/packs";
import { breakdownPrompt, wordsPrompt } from "../lib/prompts";
import { askClaudeJSON } from "../lib/server";
import { VOICES } from "../lib/voices";
import { clipKey, textKey } from "../lib/bakekey";

type Sentence = { text: string; chunks?: string[]; blobs?: { written: string }[] };

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public", "baked");
const DRY = process.argv.includes("--dry");
const NO_AUDIO = process.argv.includes("--no-audio");
for (const d of ["bd", "wd", "a"]) fs.mkdirSync(path.join(OUT, d), { recursive: true });

// Load .env.local
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const SENTENCE_SPEEDS = [0.7, 0.75, 1, 1.15]; // every speed in the player
const exists = (p: string) => fs.existsSync(p);
const readJSON = <T>(p: string): T => JSON.parse(fs.readFileSync(p, "utf8"));

async function pool<T>(items: T[], n: number, fn: (x: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    })
  );
}
async function retry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

// ---------- 1. Breakdowns ----------
const phrases = [...new Set(PACKS.flatMap((p) => p.phrases))];
const sentences: Sentence[] = [];

async function main() {
  console.log(`Packs: ${PACKS.length}, phrases: ${phrases.length}`);
  await pool(phrases, 4, async (text) => {
    const file = path.join(OUT, "bd", `${textKey(text)}.json`);
    if (!exists(file)) {
      if (DRY) return console.log("  (no breakdown yet)", text);
      const data = await retry(async () => {
        const d = await askClaudeJSON<{ sentences: Sentence[] }>(breakdownPrompt(text, true), 12000);
        if (!d?.sentences?.length) throw new Error("empty");
        return d;
      });
      fs.writeFileSync(file, JSON.stringify(data));
      console.log("  breakdown ✓", text);
    }
  });
  for (const text of phrases) {
    const file = path.join(OUT, "bd", `${textKey(text)}.json`);
    if (exists(file)) sentences.push(...readJSON<{ sentences: Sentence[] }>(file).sentences);
  }

  // ---------- 2. Word notes (one per sentence) ----------
  const allWords: string[] = [];
  await pool(sentences, 4, async (s) => {
    const file = path.join(OUT, "wd", `${textKey(s.text)}.json`);
    if (!exists(file)) {
      if (DRY) return;
      const data = await retry(async () => {
        const d = await askClaudeJSON<{ words: unknown[] }>(wordsPrompt(s.text), 8000);
        if (!d?.words?.length) throw new Error("empty");
        return d;
      });
      fs.writeFileSync(file, JSON.stringify(data));
      console.log("  words ✓", s.text);
    }
  });
  for (const s of sentences) {
    const file = path.join(OUT, "wd", `${textKey(s.text)}.json`);
    if (exists(file)) for (const w of readJSON<{ words: { word: string }[] }>(file).words) allWords.push(w.word);
  }

  // ---------- 3. Audio list ----------
  const jobs = new Map<string, { text: string; speed: number; voice: string }>();
  const add = (text: string, speed: number) => {
    const t = text.trim();
    if (!t) return;
    for (const v of VOICES) jobs.set(clipKey(t, speed, v.id), { text: t, speed, voice: v.id });
  };
  for (const s of sentences) {
    for (const sp of SENTENCE_SPEEDS) add(s.text, sp);
    const chunks = s.chunks?.length ? s.chunks : [s.text];
    for (let i = 0; i < chunks.length; i++) {
      add(chunks.slice(i).join(" "), 1); // build-up steps
      add(chunks[i], 1); // tap a chunk
    }
    for (const b of s.blobs ?? []) {
      add(b.written, 1);
      add(b.written, 0.75); // "listen slowly" in the details sheet
    }
  }
  for (const w of allWords) add(w, 1);

  const todo = [...jobs.entries()].filter(([k]) => !exists(path.join(OUT, "a", `${k}.json`)));
  const chars = todo.reduce((n, [, j]) => n + j.text.length, 0);
  console.log(`Audio clips: ${jobs.size} total, ${todo.length} to make, ~${chars} voice characters`);

  if (!DRY && !NO_AUDIO) {
    const key = process.env.ELEVENLABS_API_KEY!;
    const model = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";
    let done = 0;
    await pool(todo, 4, async ([k, j]) => {
      const data = await retry(async () => {
        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${j.voice}/with-timestamps?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: { "xi-api-key": key, "Content-Type": "application/json" },
            body: JSON.stringify({
              text: j.text,
              model_id: model,
              voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true, speed: j.speed },
            }),
          }
        );
        if (!res.ok) throw new Error(`TTS ${res.status} ${(await res.text()).slice(0, 200)}`);
        return (await res.json()) as { audio_base64: string; alignment?: Alignment; normalized_alignment?: Alignment };
      }, 4);
      fs.writeFileSync(path.join(OUT, "a", `${k}.mp3`), Buffer.from(data.audio_base64, "base64"));
      fs.writeFileSync(path.join(OUT, "a", `${k}.json`), JSON.stringify(toWords(data.alignment ?? data.normalized_alignment)));
      if (++done % 25 === 0) console.log(`  audio ${done}/${todo.length}`);
    });
  }

  // ---------- 4. Index the app reads ----------
  const list = (d: string, ext: string) =>
    fs.readdirSync(path.join(OUT, d)).filter((f) => f.endsWith(ext)).map((f) => f.slice(0, -ext.length)).sort();
  const audio = new Set(list("a", ".mp3"));
  const index = { bd: list("bd", ".json"), wd: list("wd", ".json"), a: list("a", ".json").filter((k) => audio.has(k)) };
  fs.writeFileSync(path.join(ROOT, "lib", "baked-index.json"), JSON.stringify(index));
  console.log(`Index: ${index.bd.length} breakdowns, ${index.wd.length} word sets, ${index.a.length} clips`);
}

type Alignment = { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
function toWords(a?: Alignment) {
  const out: { word: string; start: number; end: number }[] = [];
  if (!a?.characters) return out;
  let cur = "", start = 0, end = 0;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) out.push({ word: cur, start, end });
      cur = "";
      return;
    }
    if (!cur) start = a.character_start_times_seconds[i] ?? 0;
    cur += ch;
    end = a.character_end_times_seconds[i] ?? end;
  });
  if (cur) out.push({ word: cur, start, end });
  return out;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
