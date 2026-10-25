import { expect, test } from "@playwright/test";

// The level questionnaire: a full pass as a learner who stops at B1, listens to clips and sends the report.
test("level questionnaire: test stops at the learner's level, listening plays Shadow clips, report reaches the teacher", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/level");
  await expect(page.getByRole("heading", { name: "Узнаем ваш уровень английского" })).toBeVisible();
  await page.getByRole("button", { name: "Начать →" }).click();

  // Name and contact are required.
  await page.getByRole("button", { name: "Дальше →" }).click();
  await expect(page.locator("#err")).toContainText("имя");
  await page.getByLabel("Как вас зовут?").fill("Тест Тестов");
  await page.getByRole("button", { name: "Дальше →" }).click();
  await expect(page.locator("#err")).toContainText("Telegram");
  await page.getByLabel("Ваш Telegram или телефон").fill("@tester");
  await page.getByRole("button", { name: "Дальше →" }).click();

  await page.getByRole("button", { name: "Работа и созвоны" }).click();
  await page.getByRole("button", { name: "Дальше →" }).click(); // goals
  await page.getByRole("button", { name: "Кино и сериалы" }).first().click();
  await page.getByRole("button", { name: "Дальше →" }).click(); // interests
  await page.getByRole("button", { name: "Дальше →" }).click(); // experience
  await page.getByRole("button", { name: "Дальше →" }).click(); // difficulties
  await page.getByRole("button", { name: "Дальше →" }).click(); // can-do
  await page.getByRole("button", { name: "Начать →" }).click(); // test intro

  // A1, A2 right; B1 all "Не знаю" → the test stops and jumps to reading.
  const right = [0, 0, 1, 2, 1, 1, 1, 1, 1, 1];
  for (const k of right) {
    await page.locator(`[data-ans="${k}"]`).click();
    await page.waitForTimeout(350);
  }
  for (let i = 0; i < 5; i++) {
    await page.locator('[data-ans="-1"]').click();
    await page.waitForTimeout(350);
  }
  await expect(page.getByRole("heading", { name: "The four-day week that worked" })).toBeVisible();
  await page.locator('[data-r="0"][data-k="0"]').click();
  await page.getByRole("button", { name: "Дальше →" }).click();
  await page.getByRole("button", { name: "Начать →" }).click(); // listening intro

  // Clip 1: the audio file is the real baked Shadow clip.
  const audio = await page.request.get("/baked/a/975e270198dedf22.mp3");
  expect(audio.ok()).toBe(true);
  await page.getByRole("button", { name: "Дальше →" }).click();
  await expect(page.locator("#err")).toContainText("прослушайте");
  await page.getByLabel("Напишите фразу по-английски").fill("can you hear me ok");
  await page.getByRole("button", { name: "Дальше →" }).click();
  for (let i = 1; i < 6; i++) await page.getByRole("button", { name: "Не разобрал(а)" }).click();

  await page.getByLabel(/о себе/).fill("Hi Artyom! My name is Test. I work in IT.");
  await page.getByRole("button", { name: "Дальше →" }).click(); // writing
  await page.getByRole("button", { name: "$50–100" }).click();
  await page.getByRole("button", { name: "Дальше →" }).click(); // format
  await page.getByRole("button", { name: "Дальше →" }).click(); // schedule

  await expect(page.locator("#sendstate")).toContainText("отправлены");
  await expect(page.locator("#report")).toContainText("Примерный уровень (грамматика): A2–B1");
  await expect(page.locator("#report")).toContainText("тест остановлен после вопроса 15");
  await expect(page.locator("#report")).toContainText("[100%, 0×]");
  // Missed clips link into the Shadow app at that phrase.
  await expect(page.locator(`a[href*="?p=${encodeURIComponent("Can we push this to next week?")}"]`)).toBeVisible();

  // Back from reading returns to the question where the test stopped, not a skipped one.
  expect(errors).toEqual([]);
});
