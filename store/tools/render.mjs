import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
const here = new URL(".", import.meta.url).pathname;
const F = here + "node_modules/@fontsource/";
const font = (fam, w, file) => `@font-face{font-family:'${fam}';font-weight:${w};src:url('file://${F}${file}') format('woff2');}`;
const fonts = [
  font("Unbounded", 800, "unbounded/files/unbounded-cyrillic-800-normal.woff2"), font("Unbounded", 800, "unbounded/files/unbounded-latin-800-normal.woff2"),
  font("Unbounded", 700, "unbounded/files/unbounded-cyrillic-700-normal.woff2"), font("Unbounded", 700, "unbounded/files/unbounded-latin-700-normal.woff2"),
  font("Onest", 600, "onest/files/onest-cyrillic-600-normal.woff2"), font("Onest", 600, "onest/files/onest-latin-600-normal.woff2"),
  font("Onest", 500, "onest/files/onest-cyrillic-500-normal.woff2"), font("Onest", 500, "onest/files/onest-latin-500-normal.woff2"),
].join("");

// caption lines from the listing file
const cap = readFileSync(here + "../listing-ru.txt", "utf8").split("=== CAPTIONS ===")[1].trim().split("\n")
  .map((l) => l.split("|").map((x) => x.trim()));
const nb = (t) => t.replace(/(?<=^|[\s(«])(в|во|а|и|не|на|по|из|к|с|со|о|у|за|до|от|что)\s+/giu, (m, w) => `${w} `);
const ORDER = ["3-practice", "4-breakdown", "1-home", "2-packs", "5-words"]; // store order: strongest first
const TINTS = [["#dcd5fa", "#ffe0d2"], ["#d3f1e4", "#d6eafb"], ["#fff1a8", "#ffe0d2"], ["#d6eafb", "#dcd5fa"], ["#fbd9e5", "#fff1a8"]];

const shotHtml = (i) => {
  const [, t0, s0] = cap[i]; const title = nb(t0), sub = nb(s0);
  const [a, b] = TINTS[i];
  const img = `file://${here}raw/${ORDER[i]}.png`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fonts}
  html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#f4f2fb;}
  .bg{position:absolute;inset:0;background:radial-gradient(700px 600px at 10% 5%, ${a} 0%, transparent 70%),radial-gradient(800px 700px at 100% 60%, ${b} 0%, transparent 70%),#f7f5fd;}
  .cap{position:absolute;left:80px;right:80px;top:96px;text-align:center}
  h1{font-family:Unbounded;font-weight:800;font-size:62px;line-height:1.12;color:#2e2a45;margin:0;letter-spacing:-.01em;text-wrap:balance}
  p{font-family:Onest;font-weight:600;font-size:36px;color:#5a4bb5;margin:26px 0 0}
  .phone{position:absolute;left:50%;transform:translateX(-50%);top:420px;width:740px;border-radius:56px;overflow:hidden;
    box-shadow:0 40px 90px -30px rgba(46,42,69,.45),0 0 0 10px #2e2a45, 0 0 0 12px rgba(255,255,255,.6)}
  .phone img{display:block;width:100%}
  </style></head><body><div class="bg"></div><div class="cap"><h1>${title}</h1><p>${sub}</p></div>
  <div class="phone"><img src="${img}"></div></body></html>`;
};

const featureHtml = `<!doctype html><html><head><meta charset="utf-8"><style>${fonts}
  html,body{margin:0;width:1024px;height:500px;overflow:hidden}
  .bg{position:absolute;inset:0;background:radial-gradient(520px 420px at 0% 0%, #dcd5fa 0%, transparent 70%),radial-gradient(520px 460px at 100% 100%, #fff1a8 0%, transparent 70%),radial-gradient(420px 360px at 85% 0%, #d3f1e4 0%, transparent 70%),#fbfaff;}
  .brand{position:absolute;left:64px;top:56px;display:flex;align-items:center;gap:16px;font-family:Onest;font-weight:600;font-size:26px;color:#2e2a45}
  .orb{width:44px;height:44px;border-radius:50%;background:radial-gradient(circle at 35% 35%, #fff1a8, #b9a8f5 60%, #8f7df0)}
  h1{position:absolute;left:64px;top:128px;width:520px;margin:0;font-family:Unbounded;font-weight:800;font-size:44px;line-height:1.14;color:#2e2a45;letter-spacing:-.01em}
  .demo{position:absolute;right:56px;top:150px;width:360px;display:grid;gap:18px}
  .pill{border-radius:999px;padding:18px 26px;font-family:Onest;font-weight:600;font-size:26px;text-align:center}
  .w{background:#fff;color:#2e2a45;box-shadow:0 14px 30px -18px rgba(90,75,181,.5);border:2px solid #eeecf5}
  .d{background:#2e2a45;color:#fff1a8;font-family:ui-monospace,'DejaVu Sans Mono',monospace;font-size:26px}
  .lbl{font-family:Onest;font-weight:600;font-size:18px;color:#77738f;text-align:center;margin-bottom:-8px}
  .arrow{text-align:center;font-size:30px;color:#5a4bb5;margin:-6px 0}
  .tag{position:absolute;left:64px;bottom:56px;font-family:Onest;font-weight:600;font-size:22px;color:#5a4bb5}
  </style></head><body><div class="bg"></div>
  <div class="brand"><div class="orb"></div>Neuro-Fluent Shadow</div>
  <h1>${nb("Как это звучит в жизни, а не в учебнике")}</h1>
  <div class="demo"><div class="lbl">В учебнике</div><div class="pill w">Sorry, you're on mute.</div><div class="arrow">↓</div><div class="lbl">В жизни</div><div class="pill d">Sorry, yeron mute.</div></div>
  <div class="tag">Тренажёр американского произношения</div>
  </body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
for (let i = 0; i < 5; i++) {
  writeFileSync(`${here}tmp.html`, shotHtml(i));
  await page.goto(`file://${here}tmp.html`); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(300);
  await page.screenshot({ path: `${here}../screenshots/screenshot-${i + 1}.png` });
}
await page.setViewportSize({ width: 1024, height: 500 });
writeFileSync(`${here}tmp.html`, featureHtml);
await page.goto(`file://${here}tmp.html`); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(300);
await page.screenshot({ path: `${here}../feature-graphic.png` });
await browser.close(); console.log("rendered");
