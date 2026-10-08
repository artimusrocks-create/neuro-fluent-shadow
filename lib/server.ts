import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const MAX_INPUT_CHARS = 1500;

/** Returns an error response if the passcode is wrong, otherwise null. */
export function checkPasscode(req: Request): NextResponse | null {
  const expected = process.env.APP_PASSCODE;
  if (!expected) return null; // no passcode set → open app
  const given = req.headers.get("x-passcode") ?? "";
  if (given !== expected) {
    return NextResponse.json({ error: "passcode", message: "Wrong or missing passcode." }, { status: 401 });
  }
  return null;
}

export function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: "server", message }, { status });
}

/** Ask Claude and parse its reply as JSON (tolerates code fences or a sentence around it). */
export async function askClaudeJSON<T>(prompt: string, maxTokens: number): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  const text = msg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  return parseLooseJSON<T>(text);
}

function parseLooseJSON<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try {
      return JSON.parse(fence[1]) as T;
    } catch {}
  }
  const start = text.search(/[{[]/);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1)) as T;
  throw new Error("Claude's reply wasn't valid JSON.");
}
