import { NextResponse } from "next/server";
import { breakdownParts } from "@/lib/prompts";
import { askClaudeJSON, jsonError, MAX_INPUT_CHARS } from "@/lib/server";
import { freePhraseGate, getWho, isResponse, rememberUnlocked, useLimit } from "@/lib/auth";
import { hash, redis } from "@/lib/store";
import { count } from "@/lib/analytics";

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
  if (text.length > MAX_INPUT_CHARS) return jsonError(`Слишком длинно. Максимум ${MAX_INPUT_CHARS} символов.`, 400);

  // Free visitors: 5 different phrases a day.
  const gated = await freePhraseGate(who, text);
  if (gated) return gated;
  // The app plays the voice while the breakdown is still being written: allow it now, not after.
  await rememberUnlocked(who, [text]).catch(() => {});

  // Same phrase → same answer, free.
  const key = `bd:${body.cyrillic ? 1 : 0}:${hash(text.toLowerCase())}`;
  const r = redis();
  const unlock = (d: { sentences?: { text?: string }[] }) => rememberUnlocked(who, (d.sentences ?? []).map((s) => String(s.text ?? "")).concat(text)).catch(() => {});
  if (r) {
    const hit = await r.get<{ sentences: { text?: string }[] }>(key).catch(() => null);
    if (hit) {
      await unlock(hit);
      return NextResponse.json(hit);
    }
  }

  if (who.role !== "demo") {
    const limited = await useLimit(who, "breakdown");
    if (limited) return limited;
  }

  try {
    const data = await askClaudeJSON<{ sentences: unknown[] }>(breakdownParts(text, !!body.cyrillic), 12000);
    if (!data || !Array.isArray(data.sentences) || !data.sentences.length) {
      return jsonError("Разбор пришёл пустым. Попробуй ещё раз.", 502);
    }
    if (r) await r.set(key, data, { ex: 90 * 86400 }).catch(() => {});
    await unlock(data as { sentences: { text?: string }[] });
    await count("ai_breakdown");
    return NextResponse.json(data);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Разбор не удался.", 502);
  }
}
