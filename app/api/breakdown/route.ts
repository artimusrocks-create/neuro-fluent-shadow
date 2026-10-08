import { NextResponse } from "next/server";
import { breakdownPrompt } from "@/lib/prompts";
import { askClaudeJSON, jsonError, MAX_INPUT_CHARS } from "@/lib/server";
import { getWho, isResponse, useLimit } from "@/lib/auth";
import { hash, redis } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const who = await getWho(req);
  if (isResponse(who)) return who;

  let body: { text?: string; cyrillic?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError("Пустой запрос.", 400);
  }
  const text = String(body.text ?? "").trim();
  if (!text) return jsonError("Сначала вставь фразу.", 400);
  if (text.length > MAX_INPUT_CHARS) return jsonError(`Слишком длинно. До ${MAX_INPUT_CHARS} символов: это шэдоуинг, а не «Война и мир».`, 400);

  // Same phrase → same answer, free.
  const key = `bd:${body.cyrillic ? 1 : 0}:${hash(text.toLowerCase())}`;
  const r = redis();
  if (r) {
    const hit = await r.get(key).catch(() => null);
    if (hit) return NextResponse.json(hit);
  }

  const limited = await useLimit(who, "breakdown");
  if (limited) return limited;

  try {
    const data = await askClaudeJSON<{ sentences: unknown[] }>(breakdownPrompt(text, !!body.cyrillic), 12000);
    if (!data || !Array.isArray(data.sentences) || !data.sentences.length) {
      return jsonError("Разбор пришёл пустым. Попробуй ещё раз.", 502);
    }
    if (r) await r.set(key, data, { ex: 90 * 86400 }).catch(() => {});
    return NextResponse.json(data);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Разбор не удался.", 502);
  }
}
