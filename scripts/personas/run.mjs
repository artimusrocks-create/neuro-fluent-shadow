#!/usr/bin/env node
// Synthetic user testing. AI personas (scripts/personas/people.mjs) use the live app in a phone browser,
// think out loud as that person, and stop at the paywall: they never pay. You get a ranked list of what
// got in their way, with screenshots of the moments it happened.
//
//   ANTHROPIC_API_KEY=... node scripts/personas/run.mjs
//   --url https://neuro-fluent-shadow-faj3.vercel.app   site to test (default: the live site)
//   --only olya,dima                                     just these people
//   --steps 22                                           most taps per person
//   --parallel 3                                         people at the same time
//   --out persona-report                                 folder for report.html and report.json
//   --from persona-report/<run>  --note "..."            re-summarize a finished run (no new visits),
//                                                        e.g. to tell the summary about a known test glitch
//
// Safe to run against the live site: each person is a fresh free visitor (normal free allowance),
// their analytics events are dropped, they can't leave the site, and payment and microphone buttons
// don't work for them. Cost: roughly $1–3 of Claude credits for six people.

import { chromium, devices } from "@playwright/test";
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PEOPLE } from "./people.mjs";

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const BASE = opt("url", "https://neuro-fluent-shadow-faj3.vercel.app").replace(/\/$/, "");
const MAX_STEPS = Number(opt("steps", 22));
const PARALLEL = Number(opt("parallel", 3));
const ONLY = opt("only", "") ? opt("only", "").split(",") : null;
const MODEL = process.env.PERSONA_MODEL || "claude-sonnet-5-5";
const FROM = opt("from", "");
const NOTE = opt("note", "");
const OUT = FROM || join(opt("out", "persona-report"), new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19));

const client = new Anthropic();
const people = PEOPLE.filter((p) => !ONLY || ONLY.includes(p.id));
const origin = new URL(BASE).origin;

// Buttons the test switches off: paying for real, and the microphone (a bot can't speak).
const PAY = /оплат|картой|⭐|₽|перейти к оплате|stars/i;
const MIC = /записать себя|сказать голосом/i;

// ---------- talking to Claude ----------
// Answers come back through a tool call when the model makes one (always valid JSON); otherwise the JSON
// in the text is used, and a broken answer is asked for again.
const str = { type: "string" };
const list = { type: "array", items: str };
const SCHEMAS = {
  step: {
    type: "object",
    properties: {
      thought: str,
      feeling: { type: "string", enum: ["curious", "confused", "bored", "annoyed", "impressed", "motivated", "skeptical", "lost", "happy"] },
      friction: str,
      action: {
        type: "object",
        properties: { type: { type: "string", enum: ["tap", "type", "scroll", "wait", "leave"] }, id: { type: "integer" }, text: str, submit: { type: "boolean" }, dir: { type: "string", enum: ["up", "down"] }, seconds: { type: "number" } },
        required: ["type"],
      },
      why: str,
    },
    required: ["thought", "feeling", "friction", "action", "why"],
  },
  verdict: {
    type: "object",
    properties: { summary: str, understood_fast: { type: "boolean" }, got_what_came_for: { type: "string", enum: ["yes", "partly", "no"] }, would_pay: { type: "string", enum: ["yes", "maybe", "no"] }, pay_reason: str, confusing: list, annoying: list, liked: list, top_fixes: list, quote: str },
    required: ["summary", "got_what_came_for", "would_pay", "pay_reason", "confusing", "annoying", "liked", "top_fixes", "quote"],
  },
  summary: {
    type: "object",
    properties: {
      headline: str,
      issues: {
        type: "array",
        items: { type: "object", properties: { title: str, who: list, severity: { type: "string", enum: ["high", "medium", "low"] }, what_happened: str, quote: str, fix: str }, required: ["title", "who", "severity", "what_happened", "fix"] },
      },
      worked_well: list,
      pay_signal: str,
    },
    required: ["headline", "issues", "worked_well", "pay_signal"],
  },
};
const parseLoose = (text) => JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
async function ask({ system, content, maxTokens = 700, schema = "step" }) {
  const tool = { name: "answer", description: "Give your answer.", input_schema: SCHEMAS[schema] };
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        system: `${system}\n\nAlways reply by calling the "answer" tool with that JSON object.`,
        tools: [tool],
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content: attempt ? [...content, { type: "text", text: "Your last reply wasn't valid JSON. Call the answer tool with the JSON object." }] : content }],
      });
      const call = msg.content.find((b) => b.type === "tool_use");
      if (call && call.input && typeof call.input === "object" && SCHEMAS[schema].required.every((k) => k in call.input)) return { data: call.input, usage: msg.usage };
      return { data: parseLoose(msg.content.map((b) => (b.type === "text" ? b.text : "")).join("")), usage: msg.usage };
    } catch (e) {
      lastError = e;
      if (e?.status === 400) throw e; // a request the API rejects won't get better by asking again
      await new Promise((ok) => setTimeout(ok, 1500 * (attempt + 1)));
    }
  }
  throw lastError;
}

const personaSystem = (p) => `You are role-playing a real person who is trying an app for the first time. Stay in character: react the way this person would, with their goal, mood, patience and English level. You are not a tester hunting for bugs. You came for something; try to get it. Be honest: when something is unclear, slow, boring or pointless to you, say so and act on it, including leaving.

THE PERSON
Name: ${p.name}
Who: ${p.who}
How they got here: ${p.came}
What they want: ${p.wants}
Patience: ${p.patience}
About paying: ${p.money}

WHAT YOU SEE
A phone screenshot of the app, plus a numbered list of everything you can tap right now.

LIMITS OF THIS TEST (not the app's fault; never complain about them)
- You can't hear sound. When the voice plays, the spoken word is highlighted and the ▶ button turns into ■. Assume the voice sounds natural.
- The microphone is off, so recording yourself does nothing and you will never see a score in this test. If you'd record yourself, say so in your thought, imagine you repeated the phrase out loud, and carry on. Never count a missing recording or score as a problem.
- Payment is switched off. When the Pro offer appears, decide honestly whether you'd pay now, later or never and why, then leave.

EACH TURN reply with ONLY this JSON:
{"thought":"...","feeling":"...","friction":"...","action":{...},"why":"..."}
- thought: 1–3 short sentences in Russian, first person, what goes through your head right now (natural, informal).
- feeling: one of curious, confused, bored, annoyed, impressed, motivated, skeptical, lost, happy.
- friction: if something here is unclear, slow, annoying or missing for you, one short line in Russian; otherwise "".
- action: one of
  {"type":"tap","id":N}
  {"type":"type","id":N,"text":"...","submit":true}   (type into box N; submit presses Enter)
  {"type":"scroll","dir":"down"} or {"type":"scroll","dir":"up"}
  {"type":"wait","seconds":S}   (up to 15, e.g. while something loads)
  {"type":"leave"}              (close the tab: you're done, happy or not)
- why: a few words.
Behave like a real person: skim, don't read everything, don't explore every corner, don't stay longer than this person would.`;

// ---------- the page ----------
async function visibleTargets(page) {
  return page.evaluate(() => {
    document.querySelectorAll("[data-pt-id]").forEach((el) => el.removeAttribute("data-pt-id"));
    const out = [];
    const sel = 'button, a[href], input, textarea, select, [role="button"], summary';
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
      const st = getComputedStyle(el);
      if (st.visibility === "hidden" || st.display === "none" || Number(st.opacity) === 0) continue;
      const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
      const y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
      const top = document.elementFromPoint(x, y);
      if (top && !(top === el || el.contains(top) || top.contains(el))) continue; // under a sheet or overlay
      const name = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder") || el.value || "").replace(/\s+/g, " ").trim().slice(0, 90);
      const id = out.length;
      el.setAttribute("data-pt-id", String(id));
      out.push({ id, kind: el.tagName === "TEXTAREA" || el.tagName === "INPUT" ? "text box" : el.tagName === "A" ? "link" : "button", name, disabled: el.disabled === true });
    }
    return out;
  });
}

async function screenHints(page) {
  return page.evaluate(() => {
    const txt = document.body.innerText;
    const hints = [];
    if (document.querySelector('[role="dialog"][aria-label="Тренировка"]')) hints.push("a phrase practice screen is open");
    if (document.querySelector('[aria-label="Стоп"]')) hints.push("the voice is playing right now");
    if (/Разбираю|Загружаю|Готовлю/.test(txt)) hints.push("something is still loading");
    if (/690 ₽|⭐ в месяц/.test(txt)) hints.push("the Pro offer (paywall) is on screen");
    return hints;
  });
}

async function act(page, action, targets) {
  const find = (id) => targets.find((t) => t.id === id);
  if (action.type === "tap") {
    const t = find(action.id);
    if (!t) return `There is no item ${action.id} on this screen.`;
    if (PAY.test(t.name)) return "Payment is switched off in this test. Decide whether you would pay and why, then leave.";
    if (MIC.test(t.name)) return "The microphone is off in this test: nothing was recorded and no score will appear. That's the test, not the app. Imagine you said it out loud and carry on.";
    if (t.disabled) return `«${t.name}» is greyed out and doesn't react.`;
    await page.locator(`[data-pt-id="${action.id}"]`).first().click({ timeout: 5000 }).catch(() => {});
    return "";
  }
  if (action.type === "type") {
    const t = find(action.id);
    if (!t || t.kind !== "text box") return "That's not a text box.";
    const box = page.locator(`[data-pt-id="${action.id}"]`).first();
    await box.fill(String(action.text ?? "").slice(0, 1500), { timeout: 5000 }).catch(() => {});
    if (action.submit) await box.press("Enter").catch(() => {});
    return "";
  }
  if (action.type === "scroll") {
    await page.mouse.wheel(0, action.dir === "up" ? -600 : 600);
    return "";
  }
  if (action.type === "wait") {
    await page.waitForTimeout(Math.min(15, Math.max(1, Number(action.seconds) || 3)) * 1000);
    return "";
  }
  return "";
}

// ---------- one person ----------
async function runPerson(p, browser) {
  const ctx = await browser.newContext({ ...devices["Pixel 7"], deviceScaleFactor: 1, locale: "ru-RU", timezoneId: "Asia/Tbilisi" });
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.origin !== origin) return route.abort(); // never leave the site (payment pages, Telegram, trackers)
    if (u.pathname === "/api/event") return route.fulfill({ status: 204, body: "" }); // keep the real funnel numbers clean
    if (req.method() !== "GET") return route.continue();
    // The test machine's own network drops a request now and then: retry page files, so a hiccup here
    // isn't reported as the site being broken.
    for (let i = 0; i < 3; i++) {
      try {
        const res = await route.fetch();
        if (![502, 503, 504].includes(res.status()) || i === 2) return route.fulfill({ response: res });
      } catch {}
      await new Promise((ok) => setTimeout(ok, 400 * (i + 1)));
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  const started = Date.now();
  const steps = [];
  const usage = { input: 0, output: 0 };
  let note = "";
  let since = Date.now();
  try {
    await page.goto(BASE + p.start, { waitUntil: "domcontentloaded", timeout: 30000 });
    for (let n = 1; n <= MAX_STEPS; n++) {
      await page.waitForTimeout(900);
      const targets = await visibleTargets(page);
      const hints = await screenHints(page);
      const shot = await page.screenshot({ type: "jpeg", quality: 60 });
      const history = steps.slice(-12).map((s) => `${s.n}. (${s.feeling}) «${s.thought}» → ${describe(s.action, s.targetName)}${s.note ? ` [${s.note}]` : ""}`).join("\n");
      const text = [
        `Step ${n} of at most ${MAX_STEPS}. About ${Math.round((Date.now() - started) / 1000)} s on the site so far; ${Math.round((Date.now() - since) / 1000)} s since your last action.`,
        note ? `What happened after your last action: ${note}` : "",
        hints.length ? `On screen: ${hints.join("; ")}.` : "",
        "You can tap:",
        targets.map((t) => `[${t.id}] ${t.kind} «${t.name || "(no label)"}»${t.disabled ? " (greyed out)" : ""}`).join("\n") || "(nothing)",
        history ? `\nYour steps so far:\n${history}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const { data, usage: u } = await ask({
        system: personaSystem(p),
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: shot.toString("base64") } },
          { type: "text", text },
        ],
      });
      usage.input += u.input_tokens;
      usage.output += u.output_tokens;
      const action = data.action ?? { type: "leave" };
      const targetName = targets.find((t) => t.id === action.id)?.name ?? "";
      steps.push({ n, at: Math.round((Date.now() - started) / 1000), thought: data.thought ?? "", feeling: data.feeling ?? "", friction: data.friction ?? "", action, targetName, why: data.why ?? "", hints, shot: shot.toString("base64") });
      process.stdout.write(`  ${p.name} ${n}: ${data.feeling} · ${describe(action, targetName)}${data.friction ? `  ⚠ ${data.friction}` : ""}\n`);
      if (action.type === "leave") break;
      since = Date.now();
      note = await act(page, action, targets);
      steps[steps.length - 1].note = note;
    }
  } catch (e) {
    steps.push({ n: steps.length + 1, at: Math.round((Date.now() - started) / 1000), thought: "", feeling: "", friction: `(test error: ${String(e).slice(0, 200)})`, action: { type: "leave" }, targetName: "", why: "", hints: [], shot: "" });
  }
  await ctx.close();

  const story = steps.map((s) => `${s.n}. [${s.at}s] (${s.feeling}) «${s.thought}» → ${describe(s.action, s.targetName)}${s.friction ? ` · помеха: ${s.friction}` : ""}${s.note ? ` [${s.note}]` : ""}`).join("\n");
  const { data: verdict, usage: u2 } = await ask({
    system: personaSystem(p),
    maxTokens: 1200,
    schema: "verdict",
    content: [
      {
        type: "text",
        text: `You've finished with the app. Here is everything you did:\n${story}\n\nLook back as ${p.name} and answer honestly, in Russian. Reply with ONLY this JSON:\n{"summary":"2-3 sentences, first person","understood_fast":true,"got_what_came_for":"yes|partly|no","would_pay":"yes|maybe|no","pay_reason":"one sentence","confusing":["..."],"annoying":["..."],"liked":["..."],"top_fixes":["...","...","..."],"quote":"one sentence you'd tell a friend about this app"}`,
      },
    ],
  });
  usage.input += u2.input_tokens;
  usage.output += u2.output_tokens;
  return { person: p, steps, verdict, usage, seconds: Math.round((Date.now() - started) / 1000) };
}

function describe(a, name) {
  if (!a) return "—";
  if (a.type === "tap") return `нажал «${name || a.id}»`;
  if (a.type === "type") return `ввёл «${String(a.text ?? "").slice(0, 80)}»${a.submit ? " и отправил" : ""}`;
  if (a.type === "scroll") return a.dir === "up" ? "листнул вверх" : "листнул вниз";
  if (a.type === "wait") return `ждал ${a.seconds} с`;
  if (a.type === "leave") return "ушёл";
  return a.type;
}

// ---------- everyone together ----------
async function summarize(results, note = "") {
  const reports = results
    .map((r) => {
      const v = r.verdict;
      const frictions = r.steps.filter((s) => s.friction).map((s) => `шаг ${s.n}: ${s.friction}`);
      return `### ${r.person.name} (${r.person.id}) — ${r.person.who}\nCame for: ${r.person.wants}\nSummary: ${v.summary}\nGot what came for: ${v.got_what_came_for}; would pay: ${v.would_pay} (${v.pay_reason})\nConfusing: ${(v.confusing ?? []).join("; ")}\nAnnoying: ${(v.annoying ?? []).join("; ")}\nLiked: ${(v.liked ?? []).join("; ")}\nTheir fixes: ${(v.top_fixes ?? []).join("; ")}\nFriction during the visit: ${frictions.join("; ") || "none"}`;
    })
    .join("\n\n");
  const { data } = await ask({
    system: "You are a UX researcher summarising a round of synthetic user tests (AI role-play of real learners) for a busy founder with ADHD. Plain, short English. Russian quotes stay in Russian. The test switched off the microphone, sound and payment on purpose: ignore any complaint about recording, scores, hearing audio or paying being unavailable.",
    maxTokens: 2500,
    schema: "summary",
    content: [
      {
        type: "text",
        text: `${note ? `Known facts about this test run (trust these over the reports): ${note}\n\n` : ""}${results.length} people tried an app for Russian speakers who want to sound like Americans (shadowing: listen to a phrase, repeat it, get a score). Their reports:\n\n${reports}\n\nGroup what got in their way into distinct issues, most important first (how many people hit it, how badly it hurt). Reply with ONLY this JSON:\n{"headline":"one sentence","issues":[{"title":"short","who":["person ids"],"severity":"high|medium|low","what_happened":"1-2 sentences","quote":"a short Russian quote from one of them","fix":"one concrete suggestion"}],"worked_well":["short"],"pay_signal":"one sentence about willingness to pay"}`,
      },
    ],
  });
  return data;
}

// ---------- the report page ----------
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const FEEL = { curious: "любопытно", confused: "непонятно", bored: "скучно", annoyed: "раздражает", impressed: "впечатлён", motivated: "мотивирован", skeptical: "скептически", lost: "потерялся", happy: "доволен" };
const BAD = new Set(["confused", "bored", "annoyed", "lost", "skeptical"]);
const PAYS = { yes: "заплатил бы", maybe: "может быть", no: "не заплатил бы" };

function reportHtml(results, sum, meta) {
  const nameOf = Object.fromEntries(results.map((r) => [r.person.id, r.person.name]));
  const issues = (sum.issues ?? [])
    .map(
      (i) => `<li class="issue sev-${esc(i.severity)}">
  <div class="issue-head"><span class="sev">${esc({ high: "серьёзно", medium: "заметно", low: "мелочь" }[i.severity] ?? i.severity)}</span><h3>${esc(i.title)}</h3><span class="who">${(i.who ?? []).map((w) => esc(nameOf[w] ?? w)).join(", ")}</span></div>
  <p>${esc(i.what_happened)}</p>
  ${i.quote ? `<blockquote>«${esc(String(i.quote).replace(/^«|»$/g, ""))}»</blockquote>` : ""}
  <p class="fix"><b>Fix:</b> ${esc(i.fix)}</p>
</li>`
    )
    .join("\n");
  const people = results
    .map((r) => {
      const v = r.verdict ?? {};
      const keep = new Set(r.steps.filter((s) => s.friction || BAD.has(s.feeling)).slice(0, 5).map((s) => s.n));
      if (r.steps.length) keep.add(r.steps[0].n);
      const shots = r.steps
        .filter((s) => keep.has(s.n) && s.shot)
        .map((s) => `<figure><img src="data:image/jpeg;base64,${s.shot}" alt="${esc(r.person.name)}, шаг ${s.n}" loading="lazy"><figcaption><b>шаг ${s.n}</b> ${esc(s.friction || s.thought)}</figcaption></figure>`)
        .join("");
      const timeline = r.steps
        .map(
          (s) => `<li class="${s.friction ? "rough" : ""}"><span class="t">${s.at}s</span><span class="feel ${BAD.has(s.feeling) ? "bad" : ""}">${esc(FEEL[s.feeling] ?? s.feeling)}</span><span class="what">«${esc(s.thought)}» <i>→ ${esc(describe(s.action, s.targetName))}</i>${s.friction ? `<em>помеха: ${esc(s.friction)}</em>` : ""}</span></li>`
        )
        .join("");
      return `<details class="person" id="${esc(r.person.id)}">
  <summary>
    <span class="pname">${esc(r.person.name)}</span>
    <span class="pmeta">${esc(r.person.who)}</span>
    <span class="chips"><span class="chip ${v.would_pay === "yes" ? "good" : v.would_pay === "no" ? "bad" : "mid"}">${esc(PAYS[v.would_pay] ?? v.would_pay)}</span><span class="chip">${r.steps.length} шагов · ${r.seconds} с</span></span>
  </summary>
  <div class="pbody">
    <p class="came"><b>Пришёл(ла):</b> ${esc(r.person.came)} <b>Хочет:</b> ${esc(r.person.wants)}</p>
    <blockquote class="verdict">«${esc(v.quote)}»</blockquote>
    <p>${esc(v.summary)}</p>
    <p class="pay"><b>Оплата:</b> ${esc(v.pay_reason)}</p>
    ${shots ? `<div class="shots">${shots}</div>` : ""}
    <ol class="timeline">${timeline}</ol>
  </div>
</details>`;
    })
    .join("\n");
  return `<title>Persona Test Round</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
/* Layout: one reading column; summary and ranked issues first, each person's visit folded below. Colors echo the app (lavender ink, butter, peach, mint). */
:root {
  --bg: #fbfaff; --surface: #ffffff; --ink: #1f1c2e; --muted: #6f6a8a; --line: #e9e6f4; --soft: #f3f1fb;
  --accent: #5a4bb5; --hi: #b0532e; --hi-bg: #ffe6db; --mid: #7a6510; --mid-bg: #fff3b8; --lo: #2f7a5b; --lo-bg: #d9f3e7;
  --display: "Onest", system-ui, -apple-system, "Segoe UI", sans-serif; --body: "Onest", system-ui, -apple-system, "Segoe UI", sans-serif; --mono: "JetBrains Mono", ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #14121d; --surface: #1d1a2a; --ink: #eeeaff; --muted: #a29dbb; --line: #2e2a42; --soft: #231f34;
  --accent: #c9bfff; --hi: #ffb595; --hi-bg: #45291f; --mid: #ffe58a; --mid-bg: #3d3618; --lo: #8ee0b8; --lo-bg: #173a2d; color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #14121d; --surface: #1d1a2a; --ink: #eeeaff; --muted: #a29dbb; --line: #2e2a42; --soft: #231f34;
  --accent: #c9bfff; --hi: #ffb595; --hi-bg: #45291f; --mid: #ffe58a; --mid-bg: #3d3618; --lo: #8ee0b8; --lo-bg: #173a2d; color-scheme: dark; }
body { background: var(--bg); color: var(--ink); font: 16px/1.55 var(--body); }
.wrap { max-width: 860px; margin: 0 auto; padding-block: 32px 64px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 28px; }
header { display: grid; gap: 10px; }
.eyebrow { font: 600 12px/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }
h1 { margin: 0; font: 700 clamp(26px, 5vw, 38px)/1.15 var(--display); letter-spacing: -.01em; text-wrap: balance; }
h2 { margin: 0; font: 700 20px/1.3 var(--display); }
h3 { margin: 0; font: 600 17px/1.35 var(--display); text-wrap: balance; }
.lead { margin: 0; font-size: 18px; max-width: 62ch; }
.meta { margin: 0; color: var(--muted); font: 13px/1.5 var(--mono); }
.paysig { margin: 0; padding: 12px 14px; border-radius: 12px; background: var(--soft); max-width: 62ch; }
section { display: grid; gap: 14px; }
.issues { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; counter-reset: n; }
.issue { counter-increment: n; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; display: grid; gap: 8px; }
.issue-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; }
.issue-head h3::before { content: counter(n) ". "; color: var(--muted); }
.issue-head h3 { flex: 1 1 260px; min-width: 0; }
.sev { font: 600 11px/1 var(--mono); letter-spacing: .06em; text-transform: uppercase; padding: 5px 8px; border-radius: 999px; }
.sev-high .sev { color: var(--hi); background: var(--hi-bg); }
.sev-medium .sev { color: var(--mid); background: var(--mid-bg); }
.sev-low .sev { color: var(--lo); background: var(--lo-bg); }
.who { color: var(--muted); font-size: 13px; }
.issue p { margin: 0; }
blockquote { margin: 0; padding-left: 12px; border-left: 3px solid var(--line); color: var(--muted); font-style: italic; }
.fix { color: var(--ink); }
.good-list { margin: 0; padding-left: 20px; display: grid; gap: 4px; }
.person { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; }
.person + .person { margin-top: 10px; }
.person summary { cursor: pointer; list-style: none; padding: 14px 16px; display: grid; gap: 4px; }
.person summary::-webkit-details-marker { display: none; }
.person summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 14px; }
.pname { font: 700 17px/1.3 var(--display); }
.pmeta { color: var(--muted); font-size: 14px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.chip { font: 600 12px/1 var(--mono); padding: 6px 9px; border-radius: 999px; background: var(--soft); color: var(--muted); }
.chip.good { background: var(--lo-bg); color: var(--lo); } .chip.mid { background: var(--mid-bg); color: var(--mid); } .chip.bad { background: var(--hi-bg); color: var(--hi); }
.pbody { padding: 0 16px 16px; display: grid; gap: 12px; min-width: 0; }
.pbody p { margin: 0; }
.came { color: var(--muted); font-size: 14px; }
.verdict { font-size: 17px; color: var(--ink); }
.shots { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 6px; }
.shots figure { margin: 0; flex: 0 0 180px; display: grid; gap: 6px; }
.shots img { width: 180px; border-radius: 10px; border: 1px solid var(--line); display: block; }
.shots figcaption { font-size: 12px; color: var(--muted); line-height: 1.4; }
.timeline { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font-size: 14px; }
.timeline li { display: grid; grid-template-columns: 40px 96px minmax(0, 1fr); gap: 8px; align-items: start; padding: 6px 8px; border-radius: 8px; }
.timeline li.rough { background: var(--hi-bg); }
.t { font: 12px/1.6 var(--mono); color: var(--muted); font-variant-numeric: tabular-nums; }
.feel { font: 600 12px/1.6 var(--mono); color: var(--lo); }
.feel.bad { color: var(--hi); }
.what i { color: var(--muted); font-style: normal; }
.what em { display: block; font-style: normal; color: var(--hi); font-size: 13px; }
@media (max-width: 520px) { .timeline li { grid-template-columns: 34px minmax(0, 1fr); } .timeline .feel { grid-column: 2; } .timeline .what { grid-column: 1 / -1; } }
</style>
<div class="wrap">
  <header>
    <span class="eyebrow">Neuro-Fluent Shadow · synthetic users · ${esc(meta.date)}</span>
    <h1>${esc(sum.headline)}</h1>
    <p class="meta">${results.length} people · ${esc(meta.site)} · model ${esc(MODEL)} · ~$${meta.cost.toFixed(2)}</p>
    <p class="paysig"><b>Paying:</b> ${esc(sum.pay_signal)}</p>
  </header>
  <section><h2>What got in their way</h2><ol class="issues">${issues}</ol></section>
  ${(sum.worked_well ?? []).length ? `<section><h2>What worked</h2><ul class="good-list">${sum.worked_well.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></section>` : ""}
  <section><h2>Each person's visit</h2><div>${people}</div></section>
  <p class="meta">These are AI role-plays, not real people: good at spotting confusion and slow spots, weak at real feelings and real willingness to pay.</p>
</div>`;
}

// ---------- run ----------
mkdirSync(OUT, { recursive: true });
const saveRaw = (results) => writeFileSync(join(OUT, "people.json"), JSON.stringify(results));
let results = [];
if (FROM) {
  results = JSON.parse(readFileSync(join(FROM, "people.json"), "utf8"));
  console.log(`Re-summarizing ${results.length} visits from ${FROM}…`);
} else {
  const browser = await chromium.launch();
  console.log(`Testing ${BASE} with ${people.length} people, up to ${MAX_STEPS} steps each, ${PARALLEL} at a time…`);
  const queue = [...people];
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, people.length) }, async () => {
      while (queue.length) {
        const p = queue.shift();
        console.log(`→ ${p.name} starts at ${p.start}`);
        results.push(await runPerson(p, browser));
        saveRaw(results); // nothing is lost if a later step fails
      }
    })
  );
  await browser.close();
  results.sort((a, b) => PEOPLE.findIndex((x) => x.id === a.person.id) - PEOPLE.findIndex((x) => x.id === b.person.id));
}
let summary;
try {
  summary = await summarize(results, NOTE);
} catch (e) {
  summary = { headline: "Summary failed; each person's visit is below.", issues: [], worked_well: [], pay_signal: String(e).slice(0, 200) };
}
const tokens = results.reduce((t, r) => ({ input: t.input + r.usage.input, output: t.output + r.usage.output }), { input: 0, output: 0 });
const cost = (tokens.input * 3 + tokens.output * 15) / 1e6 + 0.05; // Sonnet prices; +summary
writeFileSync(join(OUT, "report.json"), JSON.stringify({ site: BASE, model: MODEL, summary, results: results.map((r) => ({ ...r, steps: r.steps.map(({ shot, ...s }) => s) })) }, null, 1));
writeFileSync(join(OUT, "report.html"), reportHtml(results, summary, { date: new Date().toISOString().slice(0, 10), site: BASE.replace(/^https?:\/\//, ""), cost }));
console.log(`\n${summary.headline}\nReport: ${join(OUT, "report.html")}  (~$${cost.toFixed(2)})`);
