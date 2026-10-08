import { NextResponse } from "next/server";
import { redis } from "@/lib/store";
import { dailyText, sendWithApp, tgSecret } from "@/lib/telegram";

export const runtime = "nodejs";

type Update = { message?: { chat: { id: number }; text?: string; from?: { first_name?: string } } };

const WELCOME = (name: string) =>
  `Привет, ${name}! Это тренажёр Neuro-Fluent 🎧

Вставляешь английскую фразу — слышишь, как её на самом деле говорит американец. Повторяешь, записываешь себя, получаешь оценку акцента.

Каждое утро буду присылать «Фразу дня». Отписаться — /stop.`;

/** Telegram calls this for every message to the bot. */
export async function POST(req: Request) {
  if (req.headers.get("x-telegram-bot-api-secret-token") !== tgSecret()) return new NextResponse("forbidden", { status: 403 });
  const update = (await req.json().catch(() => ({}))) as Update;
  const msg = update.message;
  if (!msg?.chat?.id) return NextResponse.json({ ok: true });
  const chatId = msg.chat.id;
  const text = (msg.text ?? "").trim();
  const r = redis();

  try {
    if (text.startsWith("/start")) {
      // Deep link from the teacher: t.me/<bot>?start=<student-code>
      const code = text.split(/\s+/)[1];
      if (r) {
        await r.sadd("tg:subs", String(chatId));
        if (code) {
          const id = await r.get<string>(`code:${code.toLowerCase()}`);
          if (id) await r.set(`tg:code:${chatId}`, code.toLowerCase());
        }
      }
      await sendWithApp(chatId, WELCOME(msg.from?.first_name || "друг"));
    } else if (text.startsWith("/phrase")) {
      await sendWithApp(chatId, dailyText(), "🎧 Разобрать и повторить");
    } else if (text.startsWith("/stop")) {
      if (r) await r.srem("tg:subs", String(chatId));
      await sendWithApp(chatId, "Ок, больше не пишу по утрам. Тренажёр никуда не делся — кнопка ниже. Вернуть рассылку: /start");
    } else {
      await sendWithApp(chatId, "Я пока не болтаю, я тренирую. Жми кнопку ниже и вставляй фразу туда 👇");
    }
  } catch {
    // Never make Telegram retry forever.
  }
  return NextResponse.json({ ok: true });
}
