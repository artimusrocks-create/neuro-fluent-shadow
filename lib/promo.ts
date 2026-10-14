// The «ТЕСТ» giveaway: the first people who write «тест» to the bot (or open t.me/<bot>?start=test)
// get Pro for a week, free. One per Telegram account; Artem hears about every one.
import { isActive, type Student } from "./auth";
import { grantPro, logPay, notifyTeacher, personalLink } from "./pro";
import { redis } from "./store";

export const PROMO = {
  id: "test1", // a new giveaway = a new id (counters start from zero)
  words: ["тест", "test"],
  slots: Number(process.env.PROMO_SLOTS || 10),
  days: 7,
};

/** «тест», «Тест!», «TEST» all count; a longer message is a normal question for the bot. */
export const isPromoWord = (text: string) => PROMO.words.includes(text.trim().toLowerCase().replace(/[^\p{L}]/gu, ""));

export type PromoResult =
  | { kind: "granted"; student: Student; link: string; left: number }
  | { kind: "again" | "has_pro"; student: Student; link: string }
  | { kind: "gone" };

type From = { id: number; first_name?: string; username?: string };

export async function claimPromo(from: From): Promise<PromoResult> {
  const r = redis()!;
  const claimed = `promo:${PROMO.id}:tg`;
  const id = await r.get<string>(`pro:tg:${from.id}`);
  const existing = id ? await r.hget<Student>("students", id) : null;

  if (await r.sismember(claimed, String(from.id))) {
    return existing ? { kind: "again", student: existing, link: await personalLink(existing) } : { kind: "gone" };
  }
  if (existing && isActive(existing)) return { kind: "has_pro", student: existing, link: await personalLink(existing) };

  // One per account (the set), and only `slots` in total (the counter hands out numbers, so two people
  // writing at the same moment can't both take the last place).
  if (!(await r.sadd(claimed, String(from.id)))) return { kind: "gone" };
  const n = await r.incr(`promo:${PROMO.id}:used`);
  if (n > PROMO.slots) {
    await r.srem(claimed, String(from.id));
    return { kind: "gone" };
  }
  const who = from.username ? `@${from.username}` : from.first_name || String(from.id);
  const { student } = await grantPro({ src: "manual", tg: from.id, tgUser: from.username, name: from.first_name, days: PROMO.days, autoRenew: false });
  await logPay({ src: "manual", kind: "manual", amount: 0, currency: "", who, studentId: student.id, note: `раздача «тест», ${PROMO.days} дн.` });
  await notifyTeacher(`🎁 Раздача «тест»: ${n} из ${PROMO.slots} · ${who}`);
  return { kind: "granted", student, link: await personalLink(student), left: PROMO.slots - n };
}

export function promoText(res: PromoResult, contact = "@rawmeatsalad") {
  switch (res.kind) {
    case "granted":
      return `🎁 Ты в первой десятке! Pro на ${PROMO.days} дней твой.\n\nТвоя личная ссылка (сохрани её):\n${res.link}\n\nЗанимайся по 5 минут в день. А через неделю напиши Артёму ${contact}, что понравилось и что бесит: он правда читает.`;
    case "again":
      return `Ты уже участвуешь 🙂 Вот твоя личная ссылка ещё раз:\n${res.link}`;
    case "has_pro":
      return `У тебя уже есть Pro 🙂 Твоя личная ссылка:\n${res.link}`;
    case "gone":
      return `Все ${PROMO.slots} мест уже разобрали 😅\n\nНо тренажёр работает и бесплатно: 5 фраз в день. Открывай кнопкой ниже, а за новыми раздачами следи в Instagram @artem.englishcoach.`;
  }
}
