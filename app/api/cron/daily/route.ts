import { NextResponse } from "next/server";
import { dayKey, redis } from "@/lib/store";
import { dailyText, healWebhook, sendWithApp, tgConfigured } from "@/lib/telegram";
import { notifyTeacher } from "@/lib/pro";
import { digestText } from "@/lib/digest";
import { postPhraseToChannel } from "@/lib/channel";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Runs every morning (see vercel.json): «Фраза дня» to bot subscribers + the teacher's digest.
 * Runs at most once a day, so a fake "cron" request can't spam anyone.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const fromVercelCron = (req.headers.get("user-agent") ?? "").includes("vercel-cron");
  if (secret ? auth !== `Bearer ${secret}` : !fromVercelCron) return new NextResponse("forbidden", { status: 403 });

  const r = redis();
  if (!r || !tgConfigured()) return NextResponse.json({ ok: true, sent: 0, note: "bot or database not configured" });

  const first = await r.set(`cron:daily:${dayKey()}`, 1, { nx: true, ex: 3 * 86400 });
  if (!first) return NextResponse.json({ ok: true, skipped: "already ran today" });

  await healWebhook();
  // The teacher's report goes first, so a long broadcast can never swallow it.
  await notifyTeacher(await digestText());

  // «Фраза дня» in the teacher's channel, if one is connected. A failure is reported, never fatal.
  let channel: { ok: boolean; note: string } = { ok: false, note: "not run" };
  try {
    channel = await postPhraseToChannel();
  } catch (e) {
    channel = { ok: false, note: e instanceof Error ? e.message : String(e) };
    await notifyTeacher(`Не получилось опубликовать фразу дня в канал: ${channel.note}`);
  }

  // «Фраза дня»: 25 messages a second (Telegram allows ~30), until time runs out.
  const subs = await r.smembers("tg:subs");
  const text = dailyText();
  const started = Date.now();
  let sent = 0;
  for (let i = 0; i < subs.length && Date.now() - started < 100_000; i += 25) {
    const batch = subs.slice(i, i + 25);
    const results = await Promise.allSettled(batch.map((chatId) => sendWithApp(chatId, text, "🎧 Разобрать и повторить")));
    for (let j = 0; j < results.length; j++) {
      const res = results[j];
      if (res.status === "fulfilled") sent++;
      // User blocked the bot → stop sending to them.
      else if (/blocked|deactivated|chat not found/.test(String(res.reason))) await r.srem("tg:subs", batch[j]);
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  return NextResponse.json({ ok: true, sent, of: subs.length, channel });
}
