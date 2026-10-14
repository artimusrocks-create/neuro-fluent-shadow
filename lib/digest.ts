import { isActive } from "./auth";
import { stats } from "./analytics";
import { proAccounts } from "./pro";

const fmtDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

export function fmtMoney(rev: Record<string, number>) {
  const parts = Object.entries(rev)
    .filter(([k, v]) => k !== "payments" && v)
    .map(([k, v]) => (k === "XTR" ? `${Math.round(v)} ⭐` : `${Math.round(v * 100) / 100} ${k}`));
  return parts.length ? parts.join(" + ") : "0";
}

/** The morning report the teacher gets in Telegram: yesterday's funnel and money. */
export async function digestText(): Promise<string> {
  const [, y] = await stats(2); // [today, yesterday]
  const e = y.events;
  const n = (k: string) => e[k] ?? 0;
  const active = (await proAccounts()).filter((s) => isActive(s)).length;
  return [
    `📊 Shadow — итоги за ${fmtDay(y.day)}`,
    "",
    `👀 Зашли: ${y.visitors}`,
    `🗣 Новых фраз: ${n("phrase")} (через ИИ: ${n("ai_breakdown")})`,
    `🧱 Упёрлись в лимит: ${n("limit")}`,
    `💎 Видели Pro: ${n("paywall")}`,
    `🛒 Нажали «оплатить»: ${n("checkout_stars") + n("checkout_card")}`,
    `✅ Оплаты: ${n("pay_new")} новых, ${n("pay_renew")} продлений`,
    `💰 Выручка: ${fmtMoney(y.revenue)}`,
    `⭐ Активных Pro сейчас: ${active}`,
    ...(n("tg_qa") + n("tg_qa_group") ? [`🤖 Вопросов боту: ${n("tg_qa") + n("tg_qa_group")} (из них в группах: ${n("tg_qa_group")})`] : []),
    ...(n("tg_start_qa") + n("tg_start_channel") ? [`➡️ Пришли в бота из групп: ${n("tg_start_qa")}, из канала: ${n("tg_start_channel")}`] : []),
    ...(n("report_ai") ? [`🚩 Жалоб на разборы: ${n("report_ai")} (смотри /teacher → Входящие)`] : []),
    ...(n("delete_request") ? [`🗑 Просят удалить данные: ${n("delete_request")} — срок 30 дней`] : []),
  ].join("\n");
}
