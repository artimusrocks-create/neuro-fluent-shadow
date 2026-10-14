import { createHash } from "crypto";
import { redis } from "./store";
import { phraseOfTheDay } from "./packs";
import { SITE_URL } from "./site";

export const tgConfigured = () => !!process.env.TELEGRAM_BOT_TOKEN;
export const tgSecret = () => createHash("sha256").update(process.env.TELEGRAM_BOT_TOKEN ?? "").digest("hex").slice(0, 32);
const tgBase = () => process.env.TELEGRAM_API_BASE || "https://api.telegram.org";

export async function tg(method: string, payload: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не задан в Vercel.");
  const res = await fetch(`${tgBase()}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: unknown };
  if (!data.ok) throw new Error(`Telegram: ${data.description ?? res.status}`);
  return data.result;
}

/** Updates the bot needs: messages, the pre-checkout step of Stars payments, and subscription changes (cancel / failed renewal). */
export const BOT_UPDATES = ["message", "pre_checkout_query", "subscription"];

/** Point the bot at this app: webhook, menu button, commands. Safe to run again any time. */
export async function setupTelegram(origin: string) {
  const r = redis();
  if (r) await r.set("cfg:appUrl", origin);
  await tg("setWebhook", { url: `${origin}/api/telegram`, secret_token: tgSecret(), allowed_updates: BOT_UPDATES });
  await tg("setChatMenuButton", { menu_button: { type: "web_app", text: "🎧 Тренажёр", web_app: { url: origin } } });
  await tg("setMyCommands", {
    commands: [
      { command: "start", description: "Открыть тренажёр" },
      { command: "phrase", description: "Фраза дня" },
      { command: "pro", description: "Shadow Pro: больше фраз каждый день" },
      { command: "code", description: "Моя личная ссылка (для Pro)" },
      { command: "paysupport", description: "Вопросы по оплате" },
      { command: "terms", description: "Условия и конфиденциальность" },
      { command: "stop", description: "Не присылать фразу дня" },
    ],
  });
  await tg("setMyDescription", {
    description: "Neuro-Fluent Shadow: тренажёр американского произношения. Слушаешь, повторяешь, получаешь оценку.",
  }).catch(() => {});
  const me = (await tg("getMe", {})) as { username?: string };
  if (r && me.username) await r.set("cfg:bot", me.username);
  return { bot: me.username ?? null };
}

/** Re-register the webhook if it's missing an update type we need (e.g. after an upgrade). Never throws. */
export async function healWebhook() {
  try {
    if (!tgConfigured()) return false;
    const r = redis();
    // Falls back to the site address, so the daily job connects the bot by itself once TELEGRAM_BOT_TOKEN is set.
    const origin = (r && (await r.get<string>("cfg:appUrl"))) || process.env.APP_URL || SITE_URL;
    if (!origin) return false;
    const info = (await tg("getWebhookInfo", {})) as { url?: string; allowed_updates?: string[] };
    const ok = info.url === `${origin}/api/telegram` && BOT_UPDATES.every((u) => info.allowed_updates?.includes(u));
    if (!ok) await setupTelegram(origin);
    return !ok;
  } catch {
    return false;
  }
}

export async function appBase(): Promise<string> {
  const r = redis();
  return ((r && (await r.get<string>("cfg:appUrl"))) || process.env.APP_URL || SITE_URL).replace(/\/$/, "");
}

export async function appUrlFor(chatId: number | string) {
  const r = redis();
  const base = await appBase();
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
  return `📅 Фраза дня · ${p.pack.title}\n\n«${p.text}»\n\nПослушай и повтори три раза вслух.`;
}
