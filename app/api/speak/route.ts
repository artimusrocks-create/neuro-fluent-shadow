import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server";
import { getWho, isResponse, useLimit } from "@/lib/auth";
import { blobPut, blobReadText, hasBlob, hash, redis, Stored } from "@/lib/store";
import { isKnownVoice } from "@/lib/voices";

export const runtime = "nodejs";
export const maxDuration = 30;

// ElevenLabs accepts speed roughly 0.7–1.2.
const clampSpeed = (n: number) => Math.min(1.2, Math.max(0.7, Number.isFinite(n) ? n : 1));

type Alignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

export type WordTiming = { word: string; start: number; end: number };

/** Group character timings into word timings (split on whitespace). */
function toWords(a: Alignment | null | undefined): WordTiming[] {
  if (!a || !Array.isArray(a.characters)) return [];
  const out: WordTiming[] = [];
  let cur = "";
  let start = 0;
  let end = 0;
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

export async function POST(req: Request) {
  const who = await getWho(req);
  if (isResponse(who)) return who;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const fallbackVoice = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !fallbackVoice) return jsonError("На сервере не задан ключ или голос ElevenLabs.", 500);

  let body: { text?: string; speed?: number; voice?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Пустой запрос.", 400);
  }
  const text = String(body.text ?? "").trim();
  if (!text) return jsonError("Нечего озвучивать.", 400);
  if (text.length > 600) return jsonError("Озвучка работает с одной фразой за раз.", 400);
  const speed = clampSpeed(Number(body.speed ?? 1));
  const voiceId = body.voice && isKnownVoice(body.voice) ? body.voice : fallbackVoice;
  const model = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";

  // Cache: the same text + speed + voice is generated once, then served from storage for free.
  const r = redis();
  const cacheKey = `tts:${hash(`${voiceId}|${model}|${speed}|${text}`)}`;
  if (r && hasBlob()) {
    const ptr = await r.get<Stored>(cacheKey).catch(() => null);
    if (ptr) {
      const json = await blobReadText(ptr);
      if (json) return new Response(json, { headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=86400" } });
    }
  }

  const limited = await useLimit(who, "speak");
  if (limited) return limited;

  // The "with-timestamps" endpoint returns the audio plus the time each character is spoken,
  // which powers the karaoke highlight.
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true, speed },
      }),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return jsonError(`Ошибка озвучки ${res.status}. ${detail.slice(0, 200)}`, 502);
  }

  const data = (await res.json()) as { audio_base64: string; alignment?: Alignment; normalized_alignment?: Alignment };
  const payload = { audio: data.audio_base64, words: toWords(data.alignment ?? data.normalized_alignment) };
  if (r && hasBlob()) {
    try {
      const stored = await blobPut(`tts/${cacheKey.slice(4)}.json`, JSON.stringify(payload), "application/json");
      await r.set(cacheKey, stored, { ex: 365 * 86400 });
    } catch {}
  }
  return NextResponse.json(payload, { headers: { "Cache-Control": "private, max-age=86400" } });
}
