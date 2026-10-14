import { chromium, devices } from "@playwright/test";
const base = "https://neuro-fluent-shadow-faj3.vercel.app";
const out = new URL("./raw", import.meta.url).pathname; // phone screenshots of the LIVE app (Play mode, no prices)
import { mkdirSync } from "node:fs"; mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["Pixel 7"], locale: "ru-RU", colorScheme: "light" });
// Don't count these visits in Artem's analytics.
await ctx.route(/\/api\/event/, (r) => r.fulfill({ status: 204, body: "" }));
const page = await ctx.newPage();
const shot = async (name) => { await page.waitForTimeout(900); await page.screenshot({ path: `${out}/${name}.png` }); console.log("shot", name); };

await page.goto(base + "/?app=android", { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "Что будем повторять сегодня?" }).waitFor();
await shot("1-home");

await page.getByRole("navigation", { name: "Навигация" }).getByRole("button", { name: "Наборы" }).click();
await shot("2-packs");

await page.getByRole("button", { name: /Работа и созвоны/ }).click();
const practice = page.getByRole("dialog", { name: "Тренировка" });
await practice.getByRole("button", { name: "Слушать" }).waitFor();
await page.waitForTimeout(1500);
await shot("3-practice");

await practice.getByRole("button", { name: "Ещё" }).click();
await page.getByRole("button", { name: "Полный разбор" }).click();
await page.getByRole("dialog", { name: "Полный разбор" }).waitFor();
await shot("4-breakdown");
await page.keyboard.press("Escape");
await page.waitForTimeout(600);

await practice.getByRole("button", { name: "Ещё" }).click();
await page.getByRole("button", { name: "Каждое слово" }).click();
const words = page.getByRole("dialog", { name: "Каждое слово" });
await words.locator(".w-content, .w-func").first().waitFor({ timeout: 20000 });
await words.locator("details.w-content").first().click().catch(() => {});
await shot("5-words");
await browser.close();
