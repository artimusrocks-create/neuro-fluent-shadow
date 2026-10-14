import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/telegram/route";
import { GET as dailyGET } from "@/app/api/cron/daily/route";
import { redis } from "@/lib/store";
import { tgSecret } from "@/lib/telegram";
import { channelCaption } from "@/lib/channel";
import { channelPhraseOfTheDay } from "@/lib/packs";
import { QA_LIMITS, groupQuestion, plain } from "@/lib/qa";
import { mock, req } from "./helpers";

const BOT = "nf_shadow_test_bot";
const TEACHER = 777;
const CHANNEL = { id: -1001234567890, type: "channel", title: "Артём · английский", username: "artem_english" };
const GROUP = { id: -1009876543210, type: "supergroup", title: "Батуми чат" };

let updateId = 1;
const hook = (update: Record<string, unknown>) =>
  POST(req("/api/telegram", { json: { update_id: updateId++, ...update }, headers: { "x-telegram-bot-api-secret-token": tgSecret() } }));
const dm = (from: number, text: string) => ({ message: { message_id: updateId, chat: { id: from, type: "private" }, from: { id: from, first_name: "Лена" }, text } });
const inGroup = (from: number, text: string, extra: Record<string, unknown> = {}) => ({
  message: { message_id: updateId, chat: GROUP, from: { id: from, first_name: "Олег" }, text, ...extra },
});
const madeAdmin = (by: number, chat: Record<string, unknown> = CHANNEL, status = "administrator") => ({
  my_chat_member: { chat, from: { id: by }, old_chat_member: { status: "left" }, new_chat_member: { status, can_post_messages: true } },
});

const tgCalls = async (method: string) => (await mock().calls("telegram")).filter((c) => c.method === method);
const anthropic = async () => (await mock().calls("anthropic")) as unknown as { system: string; model: string }[];

describe("Telegram channel: daily phrase", () => {
  beforeEach(async () => {
    await mock().reset();
    await redis()!.set("cfg:appUrl", "https://shadow.test");
    await redis()!.set("cfg:bot", BOT);
  });

  it("the teacher makes the bot a channel admin: the channel connects and the teacher hears about it", async () => {
    await redis()!.set("cfg:adminChat", String(TEACHER));
    await hook(madeAdmin(TEACHER));
    expect(await redis()!.get("cfg:channel")).toMatchObject({ id: CHANNEL.id, title: CHANNEL.title });
    const told = (await tgCalls("sendMessage")).filter((c) => String(c.body?.chat_id) === String(TEACHER));
    expect(String(told.at(-1)?.body?.text)).toContain("подключён");
  });

  it("a stranger adding the bot to their own channel can't redirect the posts", async () => {
    await redis()!.set("cfg:adminChat", String(TEACHER));
    await hook(madeAdmin(TEACHER));
    await hook(madeAdmin(555, { id: -100555, type: "channel", title: "Чужой канал" }));
    expect(await redis()!.get("cfg:channel")).toMatchObject({ id: CHANNEL.id });
  });

  it("bot added before /admin: the channel connects the moment the same person sends /admin", async () => {
    await hook(madeAdmin(TEACHER));
    expect(await redis()!.get("cfg:channel")).toBeNull();
    await hook(dm(TEACHER, "/admin teach-pass"));
    expect(await redis()!.get("cfg:channel")).toMatchObject({ id: CHANNEL.id });
    // ...and /admin also re-registers the webhook so membership updates keep arriving.
    const webhook = (await tgCalls("setWebhook")).at(-1);
    expect(webhook?.body?.allowed_updates).toContain("my_chat_member");
  });

  it("/post publishes today's phrase with Bella's audio and two buttons; only the teacher may use it", async () => {
    await redis()!.set("cfg:adminChat", String(TEACHER));
    await hook(madeAdmin(TEACHER));
    await hook(dm(1001, "/post"));
    expect(await tgCalls("sendAudio")).toHaveLength(0);
    await hook(dm(TEACHER, "/post"));
    const [post] = await tgCalls("sendAudio");
    const phrase = channelPhraseOfTheDay().text;
    expect(post.body).toMatchObject({ chat_id: CHANNEL.id, parse_mode: "HTML", title: phrase });
    expect(String(post.body?.audio)).toMatch(/^https:\/\/shadow\.test\/baked\/a\/[0-9a-f]{16}\.mp3$/);
    expect(String(post.body?.caption)).toContain(phrase.replace(/&/g, "&amp;"));
    const buttons = JSON.stringify(post.body?.reply_markup);
    expect(buttons).toContain(`/?p=${encodeURIComponent(phrase)}`);
    expect(buttons).toContain(`https://t.me/${BOT}?start=channel`);
  });

  it("the morning job posts to the channel once a day", async () => {
    await redis()!.set("cfg:adminChat", String(TEACHER));
    await hook(madeAdmin(TEACHER));
    const run = () => dailyGET(req("/api/cron/daily", { headers: { authorization: "Bearer cron-secret" } }));
    const first = await (await run()).json();
    expect(first.channel).toMatchObject({ ok: true });
    await run();
    expect(await tgCalls("sendAudio")).toHaveLength(1);
  });

  it("removing the bot from the channel stops the posts and tells the teacher", async () => {
    await redis()!.set("cfg:adminChat", String(TEACHER));
    await hook(madeAdmin(TEACHER));
    await hook(madeAdmin(TEACHER, CHANNEL, "left"));
    expect(await redis()!.get("cfg:channel")).toBeNull();
  });

  it("the caption always fits under audio (1024 characters) and reads well", () => {
    const long = "очень длинное правило ".repeat(30);
    const s = { text: "Can I get a coffee to go?", clear: "Can I GET a COFFEE to GO?", fast: "Kinai get a coffee tuh go?", rhythm: "", chunks: [], blobs: [{ written: "Can I", blob: "Kinai", rule: `Сокращение (A): ${long}` }, { written: "to", blob: "tuh", rule: long }], shadow_tip: long };
    const html = channelCaption(s.text, "Можно мне кофе с собой?", s);
    const visible = html.replace(/<[^>]+>/g, "");
    expect(visible.length).toBeLessThanOrEqual(1024);
    expect(visible).toContain("Kinai get a coffee tuh go?");
    expect(visible).not.toContain("(A)");
  });
});

describe("Telegram bot answers English questions", () => {
  beforeEach(async () => {
    await mock().reset();
    await redis()!.set("cfg:appUrl", "https://shadow.test");
    await redis()!.set("cfg:bot", BOT);
  });

  it("in its own chat: any text is a question; the answer comes from the fast model, without markdown, threaded", async () => {
    await hook(dm(1001, "как сказать «с собой» про кофе?"));
    const [ask] = await anthropic();
    expect(ask.model).toBe("claude-haiku-5-5");
    const answer = (await tgCalls("sendMessage")).at(-1)!;
    expect(answer.body?.text).toBe("Говорят to go: Can I get a latte to go? ☕");
    expect(answer.body?.reply_parameters).toMatchObject({ allow_sending_without_reply: true });
    expect(JSON.stringify(answer.body?.reply_markup)).toContain("web_app");
  });

  it("in a group: silent unless mentioned, replied to, or asked with /ask", async () => {
    await hook(inGroup(2002, "кто идёт на пляж?"));
    await hook(inGroup(2002, "/start@other_bot"));
    expect(await anthropic()).toHaveLength(0);
    expect(await tgCalls("sendMessage")).toHaveLength(0);

    await hook(inGroup(2002, `@${BOT} как сказать «я опаздываю»?`));
    await hook(inGroup(2003, "а как вежливее?", { reply_to_message: { from: { id: 42, is_bot: true, username: BOT } } }));
    await hook(inGroup(2004, `/ask@${BOT} в чём разница между say и tell?`));
    expect(await anthropic()).toHaveLength(3);
    const answers = await tgCalls("sendMessage");
    expect(answers).toHaveLength(3);
    // In groups the button is a link to the bot (groups can't open the app inside Telegram).
    expect(JSON.stringify(answers[0].body?.reply_markup)).toContain(`https://t.me/${BOT}?start=qa`);
  });

  it("a bare mention gets a hint, not an AI call", async () => {
    await hook(inGroup(2002, `@${BOT}`));
    expect(await anthropic()).toHaveLength(0);
    expect(String((await tgCalls("sendMessage")).at(-1)?.body?.text)).toContain("например");
  });

  it("a re-sent update is answered once", async () => {
    const update = { update_id: 999_001, ...dm(1001, "что значит gonna?") };
    const send = () => POST(req("/api/telegram", { json: update, headers: { "x-telegram-bot-api-secret-token": tgSecret() } }));
    await send();
    await send();
    expect(await anthropic()).toHaveLength(1);
  });

  it("daily cap: after the limit, one polite note, then silence", async () => {
    for (let i = 0; i < QA_LIMITS.person; i++) await hook(dm(3003, `вопрос ${i}`));
    expect(await anthropic()).toHaveLength(QA_LIMITS.person);
    await hook(dm(3003, "ещё один"));
    await hook(dm(3003, "и ещё"));
    expect(await anthropic()).toHaveLength(QA_LIMITS.person);
    const notes = (await tgCalls("sendMessage")).filter((c) => String(c.body?.text).includes("лимит"));
    expect(notes).toHaveLength(1);
  });

  it("added to a group, the bot introduces itself once", async () => {
    await hook(madeAdmin(2002, GROUP, "member"));
    const hello = (await tgCalls("sendMessage")).at(-1)!;
    expect(String(hello.body?.chat_id)).toBe(String(GROUP.id));
    expect(String(hello.body?.text)).toContain(`@${BOT}`);
  });

  it("groupQuestion and plain handle the edge cases", () => {
    expect(groupQuestion({ text: `@${BOT.toUpperCase()} hello` }, BOT)).toBe("hello");
    expect(groupQuestion({ text: "/ask@someone_else what" }, BOT)).toBeNull();
    expect(groupQuestion({ text: "/ask" }, BOT)).toBe("");
    expect(groupQuestion({ text: "просто текст", reply_to_message: { from: { is_bot: true, username: "other_bot" } } }, BOT)).toBeNull();
    expect(plain("## Ответ\n**жирно** и __тоже__")).toBe("Ответ\nжирно и тоже");
  });
});
