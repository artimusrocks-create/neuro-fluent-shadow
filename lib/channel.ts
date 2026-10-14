// The teacher's Telegram channel: the bot posts «Фраза дня» there every morning, with Bella's audio
// and a button into the app. The channel is connected when the teacher makes the bot its admin.
import BAKED from "./baked-index.json";
import { clipKey, textKey } from "./bakekey";
import { count } from "./analytics";
import { channelPhraseOfTheDay } from "./packs";
import { RU, loadSentences } from "./phrases";
import { notifyTeacher } from "./pro";
import { redis } from "./store";
import { appBase, botUsername, teacherChat, tg } from "./telegram";
import { DEFAULT_VOICE } from "./voices";
import type { Sentence } from "./client";

export type Channel = { id: number; title: string; username?: string };
type Pending = Channel & { by: number };

const CAPTION_MAX = 1000; // Telegram allows 1024 visible characters under audio
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const visible = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const AUDIO_KEYS = new Set<string>(BAKED.a);

export async function getChannel(): Promise<Channel | null> {
  const r = redis();
  return r ? await r.get<Channel>("cfg:channel") : null;
}

async function connect(ch: Channel) {
  const r = redis()!;
  await r.set("cfg:channel", { id: ch.id, title: ch.title, ...(ch.username ? { username: ch.username } : {}) });
  await r.del("cfg:channelPending");
  await count("tg_channel_connected");
  await notifyTeacher(`Канал «${ch.title}» подключён ✅\n\nКаждое утро в 9:00 по Батуми туда будет уходить фраза дня с аудио и кнопкой в тренажёр. Опубликовать первую прямо сейчас: /post`);
}

/**
 * The bot was made an admin of a channel (or lost that role). Only the teacher can connect a channel:
 * someone else adding the bot to their own channel must never redirect the posts.
 * If the teacher hasn't sent /admin yet, the channel waits and connects as soon as they do.
 */
export async function onChannelMembership(chat: { id: number; title?: string; username?: string }, by: number, status: string, canPost?: boolean) {
  const r = redis();
  if (!r) return;
  const ch: Channel = { id: chat.id, title: chat.title || "канал", ...(chat.username ? { username: chat.username } : {}) };
  if (status === "administrator" && canPost !== false) {
    const teacher = await teacherChat();
    if (teacher && teacher === String(by)) await connect(ch);
    else await r.set("cfg:channelPending", { ...ch, by }, { ex: 7 * 86400 });
    return;
  }
  const current = await getChannel();
  if (current && current.id === chat.id) {
    await r.del("cfg:channel");
    await notifyTeacher(`Бот больше не админ канала «${current.title}», поэтому фраза дня туда не уходит. Вернуть: снова сделай @${await botUsername()} админом канала.`);
  }
}

/** After /admin: a channel the same person added earlier connects now. */
export async function connectPendingChannel(teacherId: number) {
  const r = redis();
  const pending = r ? await r.get<Pending>("cfg:channelPending") : null;
  if (pending && String(pending.by) === String(teacherId)) await connect(pending);
}

/** The pre-made breakdown: from disk where the files are bundled, otherwise from the site itself. */
async function breakdown(text: string): Promise<Sentence | null> {
  const local = loadSentences(text)[0];
  if (local) return local;
  try {
    const res = await fetch(`${await appBase()}/baked/bd/${textKey(text)}.json`);
    if (!res.ok) return null;
    return ((await res.json()) as { sentences?: Sentence[] }).sentences?.[0] ?? null;
  } catch {
    return null;
  }
}

/** The post under the audio: the phrase, its meaning, how it really sounds, stress, glued sounds and a tip. */
export function channelCaption(text: string, ru: string, s: Sentence | null): string {
  const head = `🎧 <b>Фраза дня</b>\n\n<b>${esc(text)}</b>${ru ? `\n${esc(ru)}` : ""}`;
  const sounds = s?.fast ? `🗣 Как это звучит в жизни:\n<i>${esc(s.fast)}</i>` : "";
  const stress = s?.clear ? `📢 Ударения: ${esc(s.clear)}` : "";
  const rule = (x: string) => x.replace(/\s*\([A-ZА-Я]\)/g, "").trim(); // drop the rulebook's (A), (B) codes
  const glue = (n: number) =>
    s?.blobs?.length
      ? `🔗 Склейки:\n${s.blobs
          .slice(0, n)
          .map((b) => `• ${esc(b.written)} → <b>${esc(b.blob)}</b>: ${esc(rule(b.rule))}`)
          .join("\n")}`
      : "";
  const tip = s?.shadow_tip ? `💡 ${esc(s.shadow_tip)}` : "";
  const tail = "Послушай и повтори следом три раза. Караоке и оценка произношения: кнопка ниже 👇";
  // Longest version that fits: drop the tip first, then the second glued pair.
  const options = [
    [head, sounds, stress, glue(2), tip, tail],
    [head, sounds, stress, glue(2), tail],
    [head, sounds, stress, glue(1), tail],
    [head, sounds, stress, tail],
    [head, tail],
  ];
  for (const parts of options) {
    const html = parts.filter(Boolean).join("\n\n");
    if (visible(html).length <= CAPTION_MAX) return html;
  }
  return head;
}

/** Post today's phrase to the connected channel. */
export async function postPhraseToChannel(date = new Date()): Promise<{ ok: boolean; note: string }> {
  const ch = await getChannel();
  if (!ch) return { ok: false, note: "канал не подключён" };
  const p = channelPhraseOfTheDay(date);
  const s = await breakdown(p.text);
  const base = await appBase();
  const bot = await botUsername();
  const caption = channelCaption(p.text, RU[p.text] ?? "", s);
  const reply_markup = {
    inline_keyboard: [
      [{ text: "🎧 Потренировать в тренажёре", url: `${base}/?p=${encodeURIComponent(p.text)}&utm_source=telegram&utm_medium=channel` }],
      [{ text: "💬 Задать вопрос про английский", url: `https://t.me/${bot}?start=channel` }],
    ],
  };
  const key = clipKey(s?.text ?? p.text, 1, DEFAULT_VOICE);
  if (AUDIO_KEYS.has(key)) {
    await tg("sendAudio", { chat_id: ch.id, audio: `${base}/baked/a/${key}.mp3`, caption, parse_mode: "HTML", title: p.text, performer: "Neuro-Fluent Shadow", reply_markup });
  } else {
    await tg("sendMessage", { chat_id: ch.id, text: caption, parse_mode: "HTML", reply_markup, link_preview_options: { is_disabled: true } });
  }
  await count("tg_channel_post");
  return { ok: true, note: `«${p.text}» → ${ch.title}` };
}
