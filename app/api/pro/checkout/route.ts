import { NextResponse } from "next/server";
import { clientIp } from "@/lib/auth";
import { jsonError } from "@/lib/server";
import { redis } from "@/lib/store";
import { allow } from "@/lib/ratelimit";
import { count } from "@/lib/analytics";
import { Currency, lavaInvoice, normEmail, offer, validEmail, validNonce } from "@/lib/pro";

export const runtime = "nodejs";
export const maxDuration = 30;

const CURRENCIES: Currency[] = ["RUB", "USD", "EUR"];
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

/** Card payment via lava.top: creates the payment and returns the page to send the buyer to. */
export async function POST(req: Request) {
  const o = await offer();
  if (!o.card) return jsonError("Оплата картой пока не подключена.", 503);
  let body: { nonce?: string; email?: string; currency?: string; utm?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return jsonError("Пустой запрос.", 400);
  }
  const nonce = String(body.nonce ?? "");
  const email = normEmail(String(body.email ?? ""));
  const currency = String(body.currency ?? "RUB").toUpperCase() as Currency;
  if (!validNonce(nonce)) return jsonError("Плохой запрос.", 400);
  if (!validEmail(email)) return jsonError("Проверь почту — туда придёт чек и ссылка.", 400);
  if (!CURRENCIES.includes(currency)) return jsonError("Такой валюты нет.", 400);
  if (!(await allow(`checkout:${clientIp(req)}`, 15))) return jsonError("Слишком много попыток оплаты. Попробуй завтра или напиши мне.", 429);

  const utm = Object.fromEntries(
    Object.entries(body.utm ?? {})
      .filter(([k, v]) => UTM_KEYS.includes(k) && typeof v === "string" && v)
      .map(([k, v]) => [k, String(v).slice(0, 100)])
  );
  const origin = new URL(req.url).origin;
  try {
    const inv = await lavaInvoice({ email, currency, okUrl: `${origin}/?paid=1`, failUrl: `${origin}/?paid=0`, utm });
    const r = redis()!;
    await r.set(`lava:contract:${inv.id}`, nonce, { ex: 7 * 86400 });
    await r.set(`checkout:${nonce}`, { src: "lava", email, contract: inv.id, at: new Date().toISOString() }, { ex: 7 * 86400 });
    await count("checkout_card_created");
    return NextResponse.json({ url: inv.url });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Не получилось начать оплату.", 502);
  }
}
