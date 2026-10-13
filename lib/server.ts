import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const MAX_INPUT_CHARS = 2500;

export function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: "server", message }, { status });
}

type Prompt = string | { system: string; user: string };

/**
 * Ask Claude and parse its reply as JSON (tolerates code fences or a sentence around it).
 * Pass {system, user} to have the long fixed instructions cached by Claude: repeat calls then cost less.
 */
export async function askClaudeJSON<T>(prompt: Prompt, maxTokens: number): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("На сервере не задан ключ Anthropic.");
  const client = new Anthropic({ apiKey });
  const parts = typeof prompt === "string" ? null : prompt;
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    max_tokens: maxTokens,
    ...(parts ? { system: [{ type: "text" as const, text: parts.system, cache_control: { type: "ephemeral" as const } }] } : {}),
    messages: [{ role: "user", content: parts ? parts.user : (prompt as string) }],
  });
  const text = msg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  return parseLooseJSON<T>(text);
}

export function parseLooseJSON<T>(text: string): T {
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
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1)) as T;
    } catch {}
  }
  throw new Error("Не получилось разобрать ответ. Попробуй ещё раз.");
}
