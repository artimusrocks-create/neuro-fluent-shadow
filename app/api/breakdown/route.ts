import { NextResponse } from "next/server";
import { breakdownPrompt } from "@/lib/prompts";
import { askClaudeJSON, checkPasscode, jsonError, MAX_INPUT_CHARS } from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const denied = checkPasscode(req);
  if (denied) return denied;

  let body: { text?: string; cyrillic?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError("Пустой запрос.", 400);
  }
  const text = String(body.text ?? "").trim();
  if (!text) return jsonError("Сначала вставь фразу.", 400);
  if (text.length > MAX_INPUT_CHARS) return jsonError(`Слишком длинно. До ${MAX_INPUT_CHARS} символов: это шэдоуинг, а не «Война и мир».`, 400);

  try {
    const data = await askClaudeJSON<{ sentences: unknown[] }>(breakdownPrompt(text, !!body.cyrillic), 12000);
    if (!data || !Array.isArray(data.sentences) || !data.sentences.length) {
      return jsonError("Разбор пришёл пустым. Попробуй ещё раз.", 502);
    }
    return NextResponse.json(data);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Разбор не удался.", 502);
  }
}
