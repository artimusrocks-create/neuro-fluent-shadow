import { NextResponse } from "next/server";
import { redis } from "@/lib/store";
import { isActive, Student } from "@/lib/auth";
import { count } from "@/lib/analytics";
import { appBase, dailyText, sendWithApp, tg, tgConfigured, tgSecret } from "@/lib/telegram";
import { InProgress, fmtDate, grantPro, logPay, notifyTeacher, once, patchStudent, personalLink, setClaim, starsInvoiceLink, starsPrice } from "@/lib/pro";

export const runtime = "nodejs";
export const maxDuration = 30;

type TgUser = { id: number; first_name?: string; username?: string };
type SuccessfulPayment = {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  subscription_expiration_date?: number;
  is_recurring?: boolean;
  is_first_recurring?: boolean;
};
type Update = {
  message?: { chat: { id: number }; text?: string; from?: TgUser; successful_payment?: SuccessfulPayment };
  pre_checkout_query?: { id: string; from: TgUser; currency: string; total_amount: number; invoice_payload: string };
  // Bot API: a user cancelled, re-enabled, or failed to pay a Stars subscription
  subscription?: { user: TgUser; invoice_payload: string; state: "canceled" | "active" | "failed" | string };
};

const DAY = 86400000;
const quiet = (p: Promise<unknown>) => p.catch(() => {}); // a message the buyer can't receive must never undo a payment

const WELCOME = (name: string) =>
  `Привет, ${name}! Это Neuro-Fluent Shadow 🎧

Вставляешь английскую фразу, слушаешь, как её реально говорят, повторяешь следом и получаешь оценку произношения.

Каждое утро буду присылать «Фразу дня». Отписаться — /stop.`;

const PITCH = (stars: number) =>
  `Shadow Pro — это 25 своих фраз в день вместо пяти, разбор каждого слова и прогресс на всех устройствах.

${stars} ⭐ в месяц. Продлевается сама, отменить можно в любой момент в настройках Telegram.`;

const SUPPORT = `По оплате пиши мне напрямую: @rawmeatsalad — разберёмся.

Как отменить подписку: Настройки Telegram → Telegram Stars → Подписки → Shadow Pro.
Деньги верну в течение 7 дней после оплаты, если что-то не так.`;

const payloadNonce = (p: string) => (p.startsWith("n:") ? p.slice(2) : null);

async function activePro(tgId?: number): Promise<Student | null> {
  const r = redis();
  if (!r || !tgId) return null;
  const id = await r.get<string>(`pro:tg:${tgId}`);
  const s = id ? await r.hget<Student>("students", id) : null;
  return s && isActive(s) ? s : null;
}

async function sendPitch(chatId: number, nonce?: string, from?: TgUser) {
  // Already subscribed and renewing: don't sell a second subscription.
  const s = await activePro(from?.id);
  if (s && s.autoRenew && s.src === "stars") {
    await sendWithApp(chatId, `У тебя уже есть Pro до ${fmtDate(s.until)}, и он продлится сам. Личная ссылка: /code`, "🎧 Открыть Pro");
    return;
  }
  const link = await starsInvoiceLink(nonce);
  await tg("sendMessage", {
    chat_id: chatId,
    text: PITCH(starsPrice()),
    reply_markup: { inline_keyboard: [[{ text: `⭐ Оформить за ${starsPrice()} ⭐`, url: link }]] },
  });
}

async function onPayment(chatId: number, from: TgUser | undefined, sp: SuccessfulPayment) {
  const r = redis();
  if (!r || !from || sp.currency !== "XTR") return;
  // Telegram can deliver the same update twice: handle each charge once.
  await once(`tgpay:${sp.telegram_payment_charge_id}`, () => applyPayment(chatId, from, sp));
}

async function applyPayment(chatId: number, from: TgUser, sp: SuccessfulPayment) {
  const r = redis()!;
  const renewal = !!sp.is_recurring && !sp.is_first_recurring;
  // One spare day after Telegram's expiry, so a renewal that lands a little late doesn't cut access.
  const until = sp.subscription_expiration_date ? new Date(sp.subscription_expiration_date * 1000 + DAY).toISOString() : undefined;
  const { student } = await grantPro({
    src: "stars",
    tg: from.id,
    tgUser: from.username,
    name: from.first_name,
    until,
    days: 30,
    starsCharge: sp.telegram_payment_charge_id,
    ...(sp.is_first_recurring ? { starsSub: sp.telegram_payment_charge_id } : {}),
    autoRenew: !!sp.is_recurring,
  });
  await setClaim(payloadNonce(sp.invoice_payload), student.code);
  await r.set(`tg:code:${chatId}`, student.code); // every future "open app" button carries their code
  await logPay({ src: "stars", kind: renewal ? "renew" : "new", amount: sp.total_amount, currency: "XTR", who: from.username ? `@${from.username}` : String(from.id), studentId: student.id });

  const link = await personalLink(student);
  if (renewal) {
    await quiet(tg("sendMessage", { chat_id: chatId, text: `Pro продлён до ${fmtDate(student.until)} 👌` }));
  } else {
    await quiet(
      tg("sendMessage", {
        chat_id: chatId,
        text: `Готово, Pro включён 🎉\n\nДоступ до ${fmtDate(student.until)}, дальше продлится сам.\n\nЭто твоя личная ссылка. Открой её и на телефоне, и на компьютере — прогресс будет общий:\n${link}`,
        reply_markup: { inline_keyboard: [[{ text: "🎧 Открыть Pro", web_app: { url: link } }]] },
      })
    );
  }
  await notifyTeacher(`${renewal ? "🔁 Продление" : "💸 Новый Pro"} (звёзды): ${from.username ? "@" + from.username : from.first_name ?? from.id} — ${sp.total_amount} ⭐`);
}

/** Telegram calls this for every message to the bot and for every Stars checkout. */
export async function POST(req: Request) {
  // No bot token → no bot. (Otherwise the "secret" would be derived from an empty token and be guessable.)
  if (!tgConfigured()) return new NextResponse("not found", { status: 404 });
  if (req.headers.get("x-telegram-bot-api-secret-token") !== tgSecret()) return new NextResponse("forbidden", { status: 403 });
  const update = (await req.json().catch(() => ({}))) as Update;
  const r = redis();

  // Step 1 of a Stars payment: Telegram asks "can this go through?". Must answer within 10 seconds.
  if (update.pre_checkout_query) {
    const q = update.pre_checkout_query;
    const ok = q.currency === "XTR" && (q.invoice_payload === "pro" || q.invoice_payload.startsWith("n:"));
    await tg("answerPreCheckoutQuery", ok ? { pre_checkout_query_id: q.id, ok: true } : { pre_checkout_query_id: q.id, ok: false, error_message: "Этот счёт устарел. Напиши /pro, пришлю новый." }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  // A Stars subscription changed: cancelled, re-enabled, or the monthly charge failed.
  if (update.subscription) {
    const sub = update.subscription;
    const id = r ? await r.get<string>(`pro:tg:${sub.user.id}`) : null;
    if (id && (sub.state === "canceled" || sub.state === "active")) await patchStudent(id, { autoRenew: sub.state === "active" });
    if (sub.state === "canceled") await logPay({ src: "stars", kind: "cancel", amount: 0, currency: "XTR", who: sub.user.username ? `@${sub.user.username}` : String(sub.user.id), studentId: id || undefined });
    if (sub.state === "failed") await logPay({ src: "stars", kind: "fail", amount: 0, currency: "XTR", who: sub.user.username ? `@${sub.user.username}` : String(sub.user.id), studentId: id || undefined });
    if (sub.state !== "active") await notifyTeacher(`${sub.state === "canceled" ? "🚪 Отменили подписку" : "⚠️ Не прошло продление"} (звёзды): ${sub.user.username ? "@" + sub.user.username : sub.user.first_name ?? sub.user.id}`);
    return NextResponse.json({ ok: true });
  }

  const msg = update.message;
  if (!msg?.chat?.id) return NextResponse.json({ ok: true });
  const chatId = msg.chat.id;
  const text = (msg.text ?? "").trim();

  try {
    // Step 2: the money arrived.
    if (msg.successful_payment) {
      await onPayment(chatId, msg.from, msg.successful_payment);
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith("/start")) {
      const arg = text.split(/\s+/)[1] ?? "";
      if (r) await r.sadd("tg:subs", String(chatId));
      await count("tg_start");
      if (arg === "pro" || arg.startsWith("pro_")) {
        await sendPitch(chatId, arg.startsWith("pro_") ? arg.slice(4) : undefined, msg.from);
        return NextResponse.json({ ok: true });
      }
      // Deep link from the teacher: t.me/<bot>?start=<student-code>
      if (arg && r) {
        const id = await r.get<string>(`code:${arg.toLowerCase()}`);
        if (id) await r.set(`tg:code:${chatId}`, arg.toLowerCase());
      }
      await sendWithApp(chatId, WELCOME(msg.from?.first_name || "друг"));
    } else if (text.startsWith("/pro")) {
      await sendPitch(chatId, undefined, msg.from);
    } else if (text.startsWith("/code")) {
      const id = r && msg.from ? await r.get<string>(`pro:tg:${msg.from.id}`) : null;
      const s = id && r ? await r.hget<Student>("students", id) : null;
      if (s && isActive(s)) {
        await r!.set(`tg:code:${chatId}`, s.code);
        await sendWithApp(chatId, `Твоя личная ссылка:\n${await personalLink(s)}\n\nPro активен до ${fmtDate(s.until)}.`, "🎧 Открыть Pro");
      } else {
        await tg("sendMessage", { chat_id: chatId, text: "Активной подписки не вижу. Оформить: /pro\nЕсли платил картой — ссылка пришла на почту." });
      }
    } else if (text.startsWith("/paysupport") || text.startsWith("/support")) {
      await tg("sendMessage", { chat_id: chatId, text: SUPPORT });
    } else if (text.startsWith("/terms")) {
      const base = await appBase();
      await tg("sendMessage", { chat_id: chatId, text: `Условия использования и оплаты: ${base}/terms\nКонфиденциальность: ${base}/privacy`, disable_web_page_preview: true });
    } else if (text.startsWith("/admin")) {
      const pass = text.split(/\s+/)[1] ?? "";
      if (pass && pass === process.env.APP_PASSCODE && r) {
        await r.set("cfg:adminChat", String(chatId));
        await tg("sendMessage", { chat_id: chatId, text: "Готово. Сюда будут приходить оплаты и утренний отчёт." });
      } else {
        await tg("sendMessage", { chat_id: chatId, text: "Не тот пароль." });
      }
    } else if (text.startsWith("/phrase")) {
      await sendWithApp(chatId, dailyText(), "🎧 Разобрать и повторить");
    } else if (text.startsWith("/stop")) {
      if (r) await r.srem("tg:subs", String(chatId));
      await sendWithApp(chatId, "Готово, утренних сообщений больше не будет. Вернуть: /start");
    } else {
      await sendWithApp(chatId, "Открой тренажёр кнопкой ниже 👇");
    }
  } catch (e) {
    console.error("telegram update failed", e);
    // Never make Telegram retry forever — except for payments, which must not get lost (Telegram retries on 5xx).
    if (msg.successful_payment || e instanceof InProgress) return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
