import { NextResponse } from "next/server";
import { checkPasscode, jsonError } from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Speech-to-text for the student's recording (ElevenLabs Scribe).
 * Returns the words they said with timings; the scoring itself happens in the browser.
 */
export async function POST(req: Request) {
  const denied = checkPasscode(req);
  if (denied) return denied;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return jsonError("На сервере не задан ключ ElevenLabs.", 500);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Не получилось прочитать запись.", 400);
  }
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) return jsonError("Запись пустая. Запиши ещё раз.", 400);
  if (file.size > 5 * 1024 * 1024) return jsonError("Запись слишком длинная. Одна фраза — до минуты.", 400);

  const out = new FormData();
  out.append("model_id", "scribe_v1");
  out.append("language_code", "en");
  out.append("file", file, "take.webm");

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: out,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return jsonError(`Распознавание не удалось (${res.status}). ${detail.slice(0, 160)}`, 502);
  }
  const data = (await res.json()) as { text?: string; words?: { text: string; type?: string; start: number; end: number }[] };
  const words = (data.words ?? [])
    .filter((w) => (w.type ?? "word") === "word" && w.text.trim())
    .map((w) => ({ word: w.text.trim(), start: w.start, end: w.end }));
  return NextResponse.json({ text: data.text ?? "", words });
}
