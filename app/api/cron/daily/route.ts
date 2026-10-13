import { NextResponse } from "next/server";
import { dayKey, redis } from "@/lib/store";
import { dailyText, healWebhook, sendWithApp, tgConfigured } from "@/lib/telegram";
import { notifyTeacher } from "@/lib/pro";
import { digestText } from "@/lib/digest";

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

  const subs = await r.smembers("tg:subs");
  const text = dailyText();
  let sent = 0;
  for (const chatId of subs) {
    try {
      await sendWithApp(chatId, text, "🎧 Разобрать и повторить");
      sent++;
    } catch (e) {
      // User blocked the bot → stop sending to them.
      if (String(e).includes("blocked") || String(e).includes("deactivated")) await r.srem("tg:subs", chatId);
    }
    await new Promise((res) => setTimeout(res, 50)); // stay under Telegram's rate limit
  }

  await notifyTeacher((await digestText()) + `\n📨 Фразу дня получили: ${sent}`);
  return NextResponse.json({ ok: true, sent });
}
