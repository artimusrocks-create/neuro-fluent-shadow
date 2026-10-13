import { NextResponse } from "next/server";
import { clientIp } from "@/lib/auth";
import { jsonError } from "@/lib/server";
import { redis } from "@/lib/store";
import { allow } from "@/lib/ratelimit";
import { offer, starsInvoiceLink, validNonce } from "@/lib/pro";

export const runtime = "nodejs";
export const maxDuration = 20;

/** Make a Telegram Stars subscription invoice. The app opens it inside Telegram, or via the bot elsewhere. */
export async function POST(req: Request) {
  const o = await offer();
  if (!o.telegram) return jsonError("Оплата звёздами пока не подключена.", 503);
  let body: { nonce?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Пустой запрос.", 400);
  }
  const nonce = String(body.nonce ?? "");
  if (!validNonce(nonce)) return jsonError("Плохой запрос.", 400);
  if (!(await allow(`stars:${clientIp(req)}`, 30))) return jsonError("Слишком много попыток. Попробуй завтра.", 429);
  try {
    const link = await starsInvoiceLink(nonce);
    await redis()?.set(`checkout:${nonce}`, { src: "stars", at: new Date().toISOString() }, { ex: 7 * 86400 });
    return NextResponse.json({ link, bot: o.bot });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Не получилось создать счёт.", 502);
  }
}
