import { NextResponse } from "next/server";
import { wordsPrompt } from "@/lib/prompts";
import { askClaudeJSON, jsonError } from "@/lib/server";
import { getWho, isResponse, useLimit } from "@/lib/auth";
import { hash, redis } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: Request) {
  const who = await getWho(req);
  if (isResponse(who)) return who;

  let body: { sentence?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Пустой запрос.", 400);
  }
  const sentence = String(body.sentence ?? "").trim();
  if (!sentence) return jsonError("Нет фразы.", 400);
  if (sentence.length > 400) return jsonError("Разбор по словам работает с одной фразой (до 400 символов).", 400);

  const key = `wd:${hash(sentence.toLowerCase())}`;
  const r = redis();
  if (r) {
    const hit = await r.get(key).catch(() => null);
    if (hit) return NextResponse.json(hit);
  }

  const limited = await useLimit(who, "words");
  if (limited) return limited;

  try {
    const data = await askClaudeJSON<{ words: unknown[] }>(wordsPrompt(sentence), 8000);
    if (!data || !Array.isArray(data.words) || !data.words.length) {
      return jsonError("Разбор по словам пришёл пустым. Попробуй ещё раз.", 502);
    }
    if (r) await r.set(key, data, { ex: 180 * 86400 }).catch(() => {});
    return NextResponse.json(data);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Разбор по словам не удался.", 502);
  }
}
