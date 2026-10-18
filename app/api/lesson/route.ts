import { NextResponse } from "next/server";
import { askClaudeJSON, jsonError } from "@/lib/server";
import { allow } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * AI helpers for the static lesson pages in /public (e.g. /misha, /misha/homework).
 * The pages never send a prompt: they send a `kind` and the student's own text,
 * and the prompt templates live here, so the endpoint can't be used as a general chatbot.
 */
const MAX = 1500;

type Kind = "misha-coach" | "misha-translate" | "misha-drill";

const TOPICS = ["Fortnite", "Brawl Stars", "Iron Man and Marvel", "Harry Potter", "The Lord of the Rings", "cars and motorcycles", "my birthday"];
const FOCUS = ["past simple (played, found, went)", "am / is / are and have / has", "going to for plans", "prepositions in, on, at, with"];

function prompt(kind: Kind, text: string, topic: string, focus: string): string {
  switch (kind) {
    case "misha-coach":
      return `You are a friendly, hype English coach for Misha, a 13-year-old Russian boy (level A2) who loves Fortnite. He wrote this:
"""${text}"""
Check his English. Keep his ideas and his style; make it correct, natural, simple English a 13-year-old gamer would say.
Reply with only JSON in this shape:
{"tier":"common|rare|epic|legendary","xp":50,"fixed":"his full text, corrected","fixes":[{"wrong":"his words","right":"corrected words","ru":"очень короткое объяснение по-русски, на ты, без сложных терминов"}],"bonus":{"en":"one short natural gamer phrase he could add","ru":"перевод"},"hype":"one short encouraging sentence in simple English"}
Rules: xp is a number from 10 to 100. At most 4 fixes, the most important first (grammar before style). tier: legendary = no mistakes, epic = 1 small mistake, rare = 2-3 mistakes, common = 4 or more. If the text is not in English or is not a real attempt, set tier "common", xp 10 and use "hype" to kindly ask him to write in English.`;
    case "misha-translate":
      return `Misha (13, A2 English, Russian speaker) wants to say this in English while playing online games with foreigners:
"""${text}"""
Reply with only JSON: {"en":"how a real teen gamer would say it in English, short and friendly, no swearing","simple":"a simpler version he can remember","words":[{"en":"key word or phrase","ru":"перевод"}]} with at most 3 words.`;
    case "misha-drill":
      return `Make 5 fill-in-the-gap English sentences for Misha, a 13-year-old Russian boy at A2 level. Topic: ${topic}. Grammar to practise: ${focus}. Each sentence has exactly one gap written as ___ and the answer is 1-2 words. Fun, simple sentences a teen would like. If the base form of a verb helps, put it in brackets after the gap, like "Yesterday I ___ (find) a gold weapon."
Reply with only a JSON array: [{"s":"Yesterday I ___ (find) a gold weapon.","a":"found","ru":"Вчера я нашёл золотое оружие."}]`;
  }
}

export async function POST(req: Request) {
  let body: { kind?: string; text?: string; topic?: string; focus?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Пустой запрос.", 400);
  }
  const kind = String(body.kind ?? "") as Kind;
  if (!["misha-coach", "misha-translate", "misha-drill"].includes(kind)) return jsonError("Неизвестное задание.", 400);
  const text = String(body.text ?? "").trim();
  if (kind !== "misha-drill" && text.length < 2) return jsonError("Сначала напиши текст.", 400);
  if (text.length > MAX) return jsonError(`Слишком длинно. Максимум ${MAX} символов.`, 400);
  const topic = TOPICS.includes(String(body.topic)) ? String(body.topic) : TOPICS[0];
  const focus = FOCUS.includes(String(body.focus)) ? String(body.focus) : FOCUS[0];

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!(await allow(`lesson:ip:${ip}`, 80)) || !(await allow("lesson:all", 1500))) {
    return jsonError("Слишком много запросов сегодня. Попробуй завтра.", 429);
  }

  try {
    const data = await askClaudeJSON<unknown>(prompt(kind, text, topic, focus), 1500);
    return NextResponse.json({ data });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "AI не ответил. Попробуй ещё раз.", 502);
  }
}
