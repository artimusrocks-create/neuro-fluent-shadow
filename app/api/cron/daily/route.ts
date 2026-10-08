import { NextResponse } from "next/server";
import { redis } from "@/lib/store";
import { dailyText, sendWithApp, tgConfigured } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Runs every morning (see vercel.json): sends «Фраза дня» to everyone subscribed to the bot. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const fromVercelCron = (req.headers.get("user-agent") ?? "").includes("vercel-cron");
  if (secret ? auth !== `Bearer ${secret}` : !fromVercelCron) return new NextResponse("forbidden", { status: 403 });

  const r = redis();
  if (!r || !tgConfigured()) return NextResponse.json({ ok: true, sent: 0, note: "bot or database not configured" });

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
  return NextResponse.json({ ok: true, sent });
}
