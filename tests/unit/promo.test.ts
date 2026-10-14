import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/telegram/route";
import { redis } from "@/lib/store";
import { tgSecret } from "@/lib/telegram";
import { PROMO, isPromoWord } from "@/lib/promo";
import { grantPro } from "@/lib/pro";
import type { Student } from "@/lib/auth";
import { mock, req } from "./helpers";

let updateId = 5000;
const hook = (update: Record<string, unknown>) =>
  POST(req("/api/telegram", { json: { update_id: updateId++, ...update }, headers: { "x-telegram-bot-api-secret-token": tgSecret() } }));
const dm = (from: number, text: string, username = `user${from}`) => ({
  message: { message_id: updateId, chat: { id: from, type: "private" }, from: { id: from, first_name: "Лена", username }, text },
});
const lastTo = async (chat: number) =>
  (await mock().calls("telegram")).filter((c) => c.method === "sendMessage" && String(c.body?.chat_id) === String(chat)).at(-1)?.body?.text as string | undefined;
const proOf = async (tgId: number) => {
  const id = await redis()!.get<string>(`pro:tg:${tgId}`);
  return id ? await redis()!.hget<Student>("students", id) : null;
};

describe("«ТЕСТ» giveaway: Pro for a week to the first ten who write to the bot", () => {
  beforeEach(async () => {
    await mock().reset();
    await redis()!.set("cfg:appUrl", "https://shadow.test");
    await redis()!.set("cfg:adminChat", "777");
  });

  it("«тест» in the bot's chat: a week of Pro and a personal link; Artem hears about it", async () => {
    await hook(dm(4001, "Тест!"));
    const s = await proOf(4001);
    expect(s?.plan).toBe("pro");
    const days = (Date.parse(s!.until!) - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(PROMO.days - 0.1);
    expect(days).toBeLessThan(PROMO.days + 0.1);
    expect(s?.autoRenew).toBe(false);
    expect(await lastTo(4001)).toMatch(/первой десятке[\s\S]*https:\/\/shadow\.test\/\?code=/);
    expect(await lastTo(777)).toMatch(/Раздача «тест»: 1 из 10 · @user4001/);
  });

  it("one per person: asking again just resends the link", async () => {
    await hook(dm(4002, "тест"));
    const first = (await proOf(4002))!.until;
    await hook(dm(4002, "test"));
    expect((await proOf(4002))!.until).toBe(first);
    expect(await lastTo(4002)).toMatch(/уже участвуешь/);
  });

  it("only ten places; the eleventh is told kindly and gets the free app", async () => {
    for (let i = 0; i < PROMO.slots; i++) await hook(dm(4100 + i, "тест"));
    await hook(dm(4200, "тест"));
    expect(await proOf(4200)).toBeNull();
    expect(await lastTo(4200)).toMatch(/мест уже разобрали/);
  });

  it("someone who already pays isn't given a free week on top", async () => {
    const { student } = await grantPro({ src: "stars", tg: 4300, name: "Оля", days: 30 });
    await hook(dm(4300, "тест"));
    expect((await proOf(4300))!.until).toBe(student.until);
    expect(await lastTo(4300)).toMatch(/уже есть Pro/);
  });

  it("the Instagram link t.me/<bot>?start=test works the same way", async () => {
    await hook(dm(4400, "/start test"));
    expect((await proOf(4400))?.plan).toBe("pro");
  });

  it("only the word itself counts; a sentence with «тест» in it is a normal question", () => {
    expect(isPromoWord("ТЕСТ")).toBe(true);
    expect(isPromoWord(" test. ")).toBe(true);
    expect(isPromoWord("как сказать тест по-английски")).toBe(false);
  });
});
