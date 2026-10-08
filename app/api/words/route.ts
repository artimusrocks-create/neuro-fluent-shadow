import { NextResponse } from "next/server";
import { wordsPrompt } from "@/lib/prompts";
import { askClaudeJSON, checkPasscode, jsonError } from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const denied = checkPasscode(req);
  if (denied) return denied;

  let body: { sentence?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Пустой запрос.", 400);
  }
  const sentence = String(body.sentence ?? "").trim();
  if (!sentence) return jsonError("Нет фразы.", 400);
  if (sentence.length > 400) return jsonError("Разбор по словам работает с одной фразой (до 400 символов).", 400);

  try {
    const data = await askClaudeJSON<{ words: unknown[] }>(wordsPrompt(sentence), 8000);
    if (!data || !Array.isArray(data.words) || !data.words.length) {
      return jsonError("Разбор по словам пришёл пустым. Попробуй ещё раз.", 502);
    }
    return NextResponse.json(data);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Разбор по словам не удался.", 502);
  }
}
