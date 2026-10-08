import { createHash } from "crypto";
import { redis } from "./store";
import { phraseOfTheDay } from "./packs";

export const tgConfigured = () => !!process.env.TELEGRAM_BOT_TOKEN;
export const tgSecret = () => createHash("sha256").update(process.env.TELEGRAM_BOT_TOKEN ?? "").digest("hex").slice(0, 32);

export async function tg(method: string, payload: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не задан в Vercel.");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: unknown };
  if (!data.ok) throw new Error(`Telegram: ${data.description ?? res.status}`);
  return data.result;
}

/** Point the bot at this app: webhook, menu button, commands. */
export async function setupTelegram(origin: string) {
  const r = redis();
  if (r) await r.set("cfg:appUrl", origin);
  await tg("setWebhook", { url: `${origin}/api/telegram`, secret_token: tgSecret(), allowed_updates: ["message"] });
  await tg("setChatMenuButton", { menu_button: { type: "web_app", text: "🎧 Тренажёр", web_app: { url: origin } } });
  await tg("setMyCommands", {
    commands: [
      { command: "start", description: "Открыть тренажёр" },
      { command: "phrase", description: "Фраза дня" },
      { command: "stop", description: "Не присылать фразу дня" },
    ],
  });
  await tg("setMyDescription", {
    description: "Тренажёр американского произношения. Слушаешь живую речь, повторяешь, получаешь оценку акцента. Без «London is the capital».",
  }).catch(() => {});
  const me = (await tg("getMe", {})) as { username?: string };
  if (r && me.username) await r.set("cfg:bot", me.username);
  return { bot: me.username ?? null };
}

export async function appUrlFor(chatId: number | string) {
  const r = redis();
  const base = (r && (await r.get<string>("cfg:appUrl"))) || process.env.APP_URL || "";
  const code = r ? await r.get<string>(`tg:code:${chatId}`) : null;
  return code ? `${base}/?code=${encodeURIComponent(code)}` : base;
}

export async function sendWithApp(chatId: number | string, text: string, button = "🎧 Открыть тренажёр") {
  const url = await appUrlFor(chatId);
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: url ? { inline_keyboard: [[{ text: button, web_app: { url } }]] } : undefined,
  });
}

export function dailyText() {
  const p = phraseOfTheDay();
  return `📅 Фраза дня · ${p.pack.title}\n\n«${p.text}»\n\nПослушай, как её говорит американец, и повтори три раза вслух. Можно шёпотом в метро, никто не осудит.`;
}
