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
    return jsonError("Send JSON with a 'sentence' field.", 400);
  }
  const sentence = String(body.sentence ?? "").trim();
  if (!sentence) return jsonError("No sentence given.", 400);
  if (sentence.length > 400) return jsonError("Word breakdown works on one sentence at a time (under 400 characters).", 400);

  try {
    const data = await askClaudeJSON<{ words: unknown[] }>(wordsPrompt(sentence), 8000);
    if (!data || !Array.isArray(data.words) || !data.words.length) {
      return jsonError("The word breakdown came back empty. Try again.", 502);
    }
    return NextResponse.json(data);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Word breakdown failed.", 502);
  }
}
