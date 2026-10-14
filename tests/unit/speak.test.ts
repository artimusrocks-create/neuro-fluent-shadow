import { beforeEach, describe, expect, it } from "vitest";
import { POST as speakPOST } from "@/app/api/speak/route";
import { POST as breakdownPOST } from "@/app/api/breakdown/route";
import { FREE_PHRASES } from "@/lib/auth";
import { DEFAULT_VOICE, VOICES } from "@/lib/voices";
import { mock, req } from "./helpers";

type TtsCall = { kind: string; text: string; voice: string; model: string; language?: string; settings: Record<string, unknown>; format: string };
const ttsCalls = async () => ((await mock().calls("elevenlabs")) as unknown as TtsCall[]).filter((c) => c.kind === "tts");

// The teacher's cloned voice, removed in October 2026. It may still sit in someone's saved settings
// or in Vercel's ELEVENLABS_VOICE_ID: neither may bring it back.
const OLD_CLONE = "Os4ZX8JiIw21ZTNqYl53";

describe("voice engine", () => {
  beforeEach(async () => {
    await mock().reset();
  });

  it("speaks in the General American default voice, Flash v2.5, settings tuned against accent drift", async () => {
    const res = await speakPOST(req("/api/speak", { json: { text: "Can I get a coffee to go?", speed: 1 } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.audio).toBeTruthy();
    expect(body.words.map((w: { word: string }) => w.word)).toEqual(["Can", "I", "get", "a", "coffee", "to", "go?"]);
    const calls = await ttsCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      voice: DEFAULT_VOICE,
      model: "eleven_flash_v2_5",
      language: "en",
      settings: { stability: 0.5, similarity_boost: 0.8, style: 0, use_speaker_boost: true, speed: 1 },
      format: "mp3_44100_128",
    });
  });

  it("the old cloned voice can't come back: a saved choice or a leftover server setting gets the default voice", async () => {
    expect(VOICES.map((v) => v.id)).not.toContain(OLD_CLONE);
    expect(process.env.ELEVENLABS_VOICE_ID).toBe(OLD_CLONE); // set in tests/unit/setup.ts, as it may still be in Vercel
    await speakPOST(req("/api/speak", { json: { text: "Can I get a coffee to go?", voice: OLD_CLONE } }));
    await speakPOST(req("/api/speak", { json: { text: "Do you take cards?", voice: "made-up-voice" } }));
    expect((await ttsCalls()).map((c) => c.voice)).toEqual([DEFAULT_VOICE, DEFAULT_VOICE]);
  });

  it("a student can pick another voice from the list, at any speed", async () => {
    const other = VOICES[1].id;
    await speakPOST(req("/api/speak", { json: { text: "Do you take cards?", voice: other, speed: 0.75 } }));
    const [call] = await ttsCalls();
    expect(call.voice).toBe(other);
    expect(call.settings).toMatchObject({ stability: 0.5, similarity_boost: 0.8, style: 0, speed: 0.75 });
  });

  it("every voice on offer is distinct and named", () => {
    expect(new Set(VOICES.map((v) => v.id)).size).toBe(VOICES.length);
    for (const v of VOICES) expect(v.name.trim() && v.note.trim()).toBeTruthy();
  });
});

describe("voice first: a free visitor hears a new phrase before its breakdown is ready", () => {
  beforeEach(async () => {
    await mock().reset();
  });
  const visitor = { "x-device": "feedfacefeedface0001", "x-forwarded-for": "10.9.9.9" };
  const speak = (text: string) => speakPOST(req("/api/speak", { json: { text }, headers: visitor }));
  const breakdown = (text: string) => breakdownPOST(req("/api/breakdown", { json: { text }, headers: visitor }));

  it("the voice opens the phrase; its breakdown then doesn't use a second free phrase", async () => {
    const phrase = "My cat keeps knocking stuff off the table.";
    expect((await speak(phrase)).status).toBe(200);
    expect((await breakdown(phrase)).status).toBe(200);
    // Four more new phrases still fit into today's five.
    for (let i = 1; i < FREE_PHRASES; i++) expect((await breakdown(`Brand new phrase number ${i} for today.`)).status).toBe(200);
    expect((await breakdown("One phrase too many today.")).status).toBe(429);
  });

  it("voice and breakdown asked at the same moment count as one phrase", async () => {
    const phrase = "Honestly, I could use a long weekend right now.";
    const [a, b] = await Promise.all([speak(phrase), breakdown(phrase)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    for (let i = 1; i < FREE_PHRASES; i++) expect((await speak(`Another fresh phrase ${i} to hear.`)).status).toBe(200);
    // The sixth new text is refused, by the voice as well: it's not a free text-to-speech service.
    const sixth = await speak("Read this whole essay aloud for free please.");
    expect(sixth.status).toBe(429);
    expect((await sixth.json()).error).toBe("limit");
  });

  it("at the limit, a new phrase asked for voice and breakdown together gets no from both", async () => {
    for (let i = 0; i < FREE_PHRASES; i++) expect((await breakdown(`Phrase ${i} that uses up the day.`)).status).toBe(200);
    const [a, b] = await Promise.all([speak("One phrase too many."), breakdown("One phrase too many.")]);
    expect([a.status, b.status]).toEqual([429, 429]);
  });
});
