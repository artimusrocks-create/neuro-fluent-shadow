import { test, expect, Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { DEFAULT_VOICE } from "../../lib/voices";

const MOCK = "http://localhost:4010";
const OLD_CLONE = "Os4ZX8JiIw21ZTNqYl53"; // the teacher's cloned voice, removed in October 2026
const TG_SECRET = createHash("sha256").update("123:TEST").digest("hex").slice(0, 32);

/** Keep tests offline: block anything that isn't our app or the mock services. Collect real errors. */
async function prepare(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|ERR_FAILED|ERR_BLOCKED/.test(m.text())) errors.push(m.text());
  });
  await page.context().route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
  return errors;
}

async function noSideScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, "page scrolls sideways on a phone").toBeLessThanOrEqual(1);
}

async function useFreePhrases(page: Page, n: number) {
  for (let i = 0; i < n; i++) {
    await page.getByLabel("Фраза на английском").fill(`Test phrase number ${i} please`);
    await page.getByRole("button", { name: "Разобрать" }).click();
    await expect(page.getByRole("dialog", { name: "Тренировка" })).toBeVisible();
    await page.getByRole("button", { name: "Закрыть", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Тренировка" })).toBeHidden();
  }
}

test.beforeEach(async ({ request }) => {
  await request.post(`${MOCK}/__reset`);
});

test("home works on a phone and shows the free plan", async ({ page }) => {
  const errors = await prepare(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Повторяй за носителем 5 минут в день" })).toBeVisible();
  await expect(page.getByText(/Бесплатно сегодня: осталось/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Pro", exact: true })).toBeVisible();
  await noSideScroll(page);
  expect(errors).toEqual([]);
});

test("first screen: one big button starts ready phrases, nothing to type", async ({ page }) => {
  const errors = await prepare(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Начать тренировку/ }).click();
  const practice = page.getByRole("dialog", { name: "Тренировка" });
  await expect(practice.getByText(/ · 1 из 8$/)).toBeVisible();
  await expect(practice.getByRole("button", { name: "Слушать" })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("first screen: topics are right there, and an example opens with one tap", async ({ page }) => {
  const errors = await prepare(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Small talk/ })).toBeVisible();
  await page.getByRole("button", { name: "Sorry, you're on mute." }).click();
  const practice = page.getByRole("dialog", { name: "Тренировка" });
  await expect(practice.getByText("Пример · 1 из 1")).toBeVisible();
  await expect(practice.getByRole("button", { name: "Слушать" })).toBeEnabled();
  await noSideScroll(page);
  expect(errors).toEqual([]);
});

test("a pasted text opens at once, one sentence per step, and the voice is ready before the breakdown", async ({ page, request }) => {
  const errors = await prepare(page);
  await page.goto("/");
  await page.getByLabel("Фраза на английском").fill("Hey team, quick update.\nThe release is moving to Friday. I'll send the details by email.");
  await page.getByRole("button", { name: "Разобрать" }).click();
  const practice = page.getByRole("dialog", { name: "Тренировка" });
  await expect(practice.getByText("Твой текст · 1 из 3")).toBeVisible();
  await expect(practice.getByText("Hey", { exact: true })).toBeVisible();
  await expect(practice.getByRole("button", { name: "Слушать" })).toBeEnabled();
  // The first sentence is voiced on its own (no tap): a free visitor may hear it before its breakdown.
  const tts = async () =>
    ((await (await request.get(`${MOCK}/__calls?service=elevenlabs`)).json()) as { kind: string; text?: string }[]).filter((c) => c.kind === "tts").length;
  await expect.poll(tts).toBeGreaterThan(0);
  await practice.getByRole("button", { name: "Следующая фраза", exact: true }).click();
  await expect(practice.getByText("Твой текст · 2 из 3")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the end of a topic: a finish screen with the next topic, not a dead end", async ({ page }) => {
  const errors = await prepare(page);
  await page.goto("/");
  await page.getByRole("button", { name: /В кафе и ресторане/ }).click();
  const practice = page.getByRole("dialog", { name: "Тренировка" });
  await expect(practice.getByText("В кафе и ресторане · 1 из 8")).toBeVisible();
  for (let i = 2; i <= 8; i++) {
    await practice.getByRole("button", { name: "Следующая фраза", exact: true }).click();
    await expect(practice.getByText(`В кафе и ресторане · ${i} из 8`)).toBeVisible();
  }
  await practice.getByRole("button", { name: /Готово, это последняя фраза/ }).click();
  const finish = page.getByRole("dialog", { name: "Готово 🎉" });
  await expect(finish.getByText(/8 фраз пройдено/)).toBeVisible();
  await finish.getByRole("button", { name: /Следующая тема/ }).click();
  await expect(page.getByRole("dialog", { name: "Тренировка" }).getByText("Аэропорт и путешествия · 1 из 8")).toBeVisible();
  expect(errors).toEqual([]);
});

test("your own text: the next sentence is prepared while you practice the current one", async ({ page, request }) => {
  await prepare(page);
  await page.goto("/");
  await page.getByLabel("Фраза на английском").fill("I'll walk you through the plan. Then we can take questions. Thanks for joining today.");
  await page.getByRole("button", { name: "Разобрать" }).click();
  await expect(page.getByRole("dialog", { name: "Тренировка" }).getByText("Твой текст · 1 из 3")).toBeVisible();
  const breakdowns = async () => ((await (await request.get(`${MOCK}/__calls?service=anthropic`)).json()) as unknown[]).length;
  await expect.poll(breakdowns).toBeGreaterThanOrEqual(2); // the first sentence and, ahead of time, the second
});

test("a phrase pack opens full-screen practice", async ({ page }) => {
  const errors = await prepare(page);
  await page.goto("/");
  await page.getByRole("navigation", { name: "Навигация" }).getByRole("button", { name: "Наборы" }).click();
  await page.getByRole("button", { name: /В кафе и ресторане/ }).click();
  const practice = page.getByRole("dialog", { name: "Тренировка" });
  await expect(practice).toBeVisible();
  await expect(practice.getByText("В кафе и ресторане · 1 из 8")).toBeVisible();
  await expect(practice.getByRole("button", { name: "Слушать" })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("an AI breakdown can be flagged without leaving the app (Google Play rule)", async ({ page }) => {
  const errors = await prepare(page);
  await page.goto("/");
  await page.getByRole("navigation", { name: "Навигация" }).getByRole("button", { name: "Наборы" }).click();
  await page.getByRole("button", { name: /В кафе и ресторане/ }).click();
  const practice = page.getByRole("dialog", { name: "Тренировка" });
  await expect(practice.getByRole("button", { name: "Слушать" })).toBeEnabled();
  await practice.getByRole("button", { name: "Ещё" }).click();
  await page.getByRole("button", { name: "Полный разбор" }).click();
  const details = page.getByRole("dialog", { name: "Полный разбор" });
  await details.getByRole("button", { name: /Ошибка в разборе\? Сообщить/ }).click();
  await details.getByLabel(/Что не так/).fill("Странное ударение");
  await details.getByRole("button", { name: "Отправить" }).click();
  await expect(details.getByText("Спасибо! Артём посмотрит и поправит.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the data-deletion page sends a request", async ({ page }) => {
  const errors = await prepare(page);
  await page.goto("/delete-data");
  await expect(page.getByRole("heading", { name: "Удалить мои данные" })).toBeVisible();
  await page.getByLabel("Почта, Telegram или код доступа").fill("lena@example.com");
  await page.getByRole("button", { name: "Удалить мои данные" }).click();
  await expect(page.getByText(/Запрос отправлен/)).toBeVisible();
  await noSideScroll(page);
  expect(errors).toEqual([]);
});

test("a link to one phrase opens it straight away", async ({ page }) => {
  await prepare(page);
  // A pack phrase (Telegram channel post, phrase page) continues with the rest of its topic.
  await page.goto(`/?p=${encodeURIComponent("Can I get a coffee to go?")}`);
  await expect(page.getByRole("dialog", { name: "Тренировка" }).getByText("В кафе и ресторане · 1 из 8")).toBeVisible();
  await expect(page.getByText("Можно кофе с собой?")).toBeVisible(); // what it means, right under the phrase
  // Any other phrase opens on its own.
  await page.goto(`/?p=${encodeURIComponent("Let's circle back on this tomorrow.")}`);
  await expect(page.getByRole("dialog", { name: "Тренировка" }).getByText("Фраза · 1 из 1")).toBeVisible();
});

test("voice: the old teacher voice saved in a browser becomes the new default, and audio loads before «Слушать»", async ({ page, request }) => {
  const errors = await prepare(page);
  // Someone who picked the cloned teacher voice before it was removed.
  await page.addInitScript((old) => {
    if (!localStorage.getItem("nf-progress-v1")) localStorage.setItem("nf-progress-v1", JSON.stringify({ settings: { voice: old } }));
  }, OLD_CLONE);
  await page.goto("/");
  await page.getByRole("button", { name: "Меню и настройки" }).click();
  const settings = page.getByRole("dialog", { name: "Настройки" });
  await expect(settings.getByRole("button", { name: /Белла/ })).toHaveAttribute("aria-pressed", "true");
  await expect(settings.getByRole("button", { name: /Артём/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();

  await page.getByLabel("Фраза на английском").fill("Could you walk me through it?");
  await page.getByRole("button", { name: "Разобрать" }).click();
  await expect(page.getByRole("dialog", { name: "Тренировка" })).toBeVisible();
  // Nobody tapped «Слушать» yet: the clip is already being made, in the default voice.
  const voices = async () =>
    ((await (await request.get(`${MOCK}/__calls?service=elevenlabs`)).json()) as { kind: string; voice: string }[]).filter((c) => c.kind === "tts").map((c) => c.voice);
  await expect.poll(voices).toContain(DEFAULT_VOICE);
  expect(await voices()).not.toContain(OLD_CLONE);
  expect(errors).toEqual([]);
});

test("after 5 free phrases the Pro offer appears with both ways to pay", async ({ page }) => {
  const errors = await prepare(page);
  await page.goto("/");
  await useFreePhrases(page, 5);
  await page.getByLabel("Фраза на английском").fill("One phrase too many");
  await page.getByRole("button", { name: "Разобрать" }).click();
  await expect(page.getByRole("heading", { name: "Бесплатные фразы на сегодня закончились" })).toBeVisible();
  await expect(page.getByRole("button", { name: /В Telegram · 450 ⭐ в месяц/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Картой · 690 ₽ или ≈ \$8/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("card payment: pay on lava.top, come back, Pro is on", async ({ page, request }) => {
  await prepare(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Pro", exact: true }).click();
  await page.getByRole("button", { name: /Картой/ }).click();
  await page.getByLabel(/Почта/).fill("lena@example.com");
  await page.getByRole("button", { name: /Российская/ }).click();
  await page.getByRole("button", { name: "Перейти к оплате" }).click();
  await expect(page).toHaveURL(/\/lava-pay\//);

  const lava = await (await request.get(`${MOCK}/__calls?service=lava`)).json();
  const contractId = lava[0].id;
  const hook = await request.post("/api/pay/lava", {
    headers: { "X-Api-Key": "lava-hook-secret" },
    data: { eventType: "payment.success", contractId, buyer: { email: "lena@example.com" }, amount: 690, currency: "RUB", status: "subscription-active" },
  });
  expect(await hook.json()).toEqual({ ok: true, result: "granted" });

  await page.goto("/?paid=1");
  await expect(page.getByText(/Pro включён/)).toBeVisible();
  await expect(page.getByText(/Pro до \d+/)).toBeVisible();
  await expect(page.getByText(/Бесплатно сегодня/)).toBeHidden();
  await expect(page.getByRole("button", { name: "От препода" })).toBeHidden(); // that's for the teacher's own students
});

test("Telegram Stars from the website: invoice opens, payment arrives, Pro is on", async ({ page, request }) => {
  await prepare(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Pro", exact: true }).click();
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: /В Telegram/ }).click();
  await (await popup).close();
  await expect(page.getByText(/Жду подтверждение оплаты/)).toBeVisible();

  const nonce = await page.evaluate(() => JSON.parse(localStorage.getItem("nf-claim") ?? "{}").nonce as string);
  const res = await request.post("/api/telegram", {
    headers: { "x-telegram-bot-api-secret-token": TG_SECRET },
    data: {
      message: {
        chat: { id: 501 },
        from: { id: 501, first_name: "Max", username: "max" },
        successful_payment: {
          currency: "XTR",
          total_amount: 450,
          invoice_payload: `n:${nonce}`,
          telegram_payment_charge_id: "pw-charge-1",
          subscription_expiration_date: Math.floor(Date.now() / 1000) + 30 * 86400,
          is_recurring: true,
          is_first_recurring: true,
        },
      },
    },
  });
  expect(res.ok()).toBe(true);
  await expect(page.getByText(/Pro включён/)).toBeVisible({ timeout: 15_000 });
});

test("inside the Android app: no prices, no payment buttons", async ({ page }) => {
  await prepare(page);
  await page.goto("/?app=android");
  await expect(page.getByRole("heading", { name: "Повторяй за носителем 5 минут в день" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pro", exact: true })).toBeHidden();
  await useFreePhrases(page, 5);
  await page.getByLabel("Фраза на английском").fill("One phrase too many");
  await page.getByRole("button", { name: "Разобрать" }).click();
  await expect(page.getByRole("heading", { name: "На сегодня всё" })).toBeVisible();
  await expect(page.getByText(/⭐|₽|\$8/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Войти по коду" })).toBeVisible();
});

test("teacher sees Pro customers and payments", async ({ page, request }) => {
  await prepare(page);
  await request.post("/api/pay/lava", {
    headers: { "X-Api-Key": "lava-hook-secret" },
    data: { eventType: "payment.success", contractId: "c-teacher-1", buyer: { email: "oleg@example.com" }, amount: 9, currency: "USD", status: "subscription-active" },
  });
  // A wrong password saved earlier in this browser: the cabinet asks again instead of a dead end.
  await page.goto("/teacher");
  await page.evaluate(() => localStorage.setItem("nf-passcode", "lena-oldcode"));
  await page.reload();
  await expect(page.getByText("Пароль не подошёл", { exact: false })).toBeVisible();
  await page.getByLabel("Пароль препода").fill("teach-pass");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.getByRole("button", { name: /Деньги/ }).click();
  await expect(page.getByText("oleg@example.com", { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/9 USD/).first()).toBeVisible();
});

for (const path of ["/start", "/phrases", "/phrase/can-i-get-a-coffee-to-go", "/phrase/not-bad-cant-complain-how-about-you", "/download", "/privacy", "/terms", "/delete-data", "/nope-404"]) {
  test(`public page ${path} renders cleanly on a phone`, async ({ page }) => {
    const errors = await prepare(page);
    const res = await page.goto(path);
    expect(res?.status()).toBe(path === "/nope-404" ? 404 : 200);
    await expect(page.locator("h1").first()).toBeVisible();
    await noSideScroll(page);
    expect(errors).toEqual([]);
  });
}

test("SEO and app plumbing files", async ({ request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/phrase/can-i-get-a-coffee-to-go");
  expect((sitemap.match(/<url>/g) ?? []).length).toBeGreaterThanOrEqual(70);
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /api/");
  const links = await (await request.get("/.well-known/assetlinks.json")).json();
  expect(links[0].target.package_name).toBe("com.neurofluent.shadow");
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.id).toBe("/");
  expect((await request.get("/offline.html")).status()).toBe(200);
  const sw = await request.get("/sw.js");
  expect(sw.headers()["cache-control"]).toContain("no-cache");
  expect((await request.get("/og.png")).status()).toBe(200);
  const apk = await request.head("/download/neuro-fluent-shadow.apk");
  expect(apk.status()).toBe(200);
});
