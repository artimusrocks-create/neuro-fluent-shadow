import { NextResponse } from "next/server";
import { checkPasscode, jsonError } from "@/lib/server";

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
  const denied = checkPasscode(req);
  if (denied) return denied;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) return jsonError("На сервере не задан ключ или голос ElevenLabs.", 500);

  let body: { text?: string; speed?: number };
  try {
    body = await req.json();
  } catch {
    return jsonError("Пустой запрос.", 400);
  }
  const text = String(body.text ?? "").trim();
  if (!text) return jsonError("Нечего озвучивать.", 400);
  if (text.length > 600) return jsonError("Озвучка работает с одной фразой за раз.", 400);
  const speed = clampSpeed(Number(body.speed ?? 1));

  // The "with-timestamps" endpoint returns the audio plus the time each character is spoken,
  // which powers the karaoke highlight.
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true, speed },
      }),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return jsonError(`Ошибка озвучки ${res.status}. ${detail.slice(0, 200)}`, 502);
  }

  const data = (await res.json()) as { audio_base64: string; alignment?: Alignment; normalized_alignment?: Alignment };
  return NextResponse.json(
    { audio: data.audio_base64, words: toWords(data.alignment ?? data.normalized_alignment) },
    { headers: { "Cache-Control": "private, max-age=86400" } }
  );
}
