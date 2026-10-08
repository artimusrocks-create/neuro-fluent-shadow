import { NextResponse } from "next/server";
import { breakdownPrompt } from "@/lib/prompts";
import { askClaudeJSON, checkPasscode, jsonError, MAX_INPUT_CHARS } from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const denied = checkPasscode(req);
  if (denied) return denied;

  let body: { text?: string; cyrillic?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError("Send JSON with a 'text' field.", 400);
  }
  const text = String(body.text ?? "").trim();
  if (!text) return jsonError("Type a phrase first.", 400);
  if (text.length > MAX_INPUT_CHARS) return jsonError(`That's too long. Keep it under ${MAX_INPUT_CHARS} characters.`, 400);

  try {
    const data = await askClaudeJSON<{ sentences: unknown[] }>(breakdownPrompt(text, !!body.cyrillic), 6000);
    if (!data || !Array.isArray(data.sentences) || !data.sentences.length) {
      return jsonError("The breakdown came back empty. Try again.", 502);
    }
    return NextResponse.json(data);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Breakdown failed.", 502);
  }
}
