# Neuro-Fluent Shadow

A shadowing companion for American English, for Russian speakers. Paste a phrase and get:

- 🎤 **Karaoke audio** in native General American voices (ElevenLabs Flash v2.5, language locked to English): each word lights up as it's spoken
- 🐢 / 🔥 **Speeds** 0.5 · 0.75 · 1.0 · 1.15, **Echo ×3**, **build-up** (backchaining)
- 🎤 **Record yourself → score** (intelligibility, rhythm, pace) and **compare** with the model
- 🔥 **Fast-speech breakdown**: stresses, rhythm, glued "blobs" with rules, every word in Russian
- 📚 8 ready-made **phrase packs** (pre-generated, cost nothing to use), phrase of the day, spaced repetition, streaks
- 👩‍🏫 **Teacher dashboard** (`/teacher`): students with personal links, assigned phrases, recordings inbox, **money tab**
- 🤖 **Telegram bot + Mini App**: daily phrase, Stars payments, alerts to the teacher
- 💎 **Shadow Pro** subscription: Telegram Stars or card (lava.top, Russian and foreign cards)
- 📱 **Android app** (`/android`, downloadable APK at `/download`), installable on iPhone and desktop
- 🔎 **Public phrase pages** (`/phrases`, `/phrase/...`) for search engines, landing page `/start`, legal pages
- 🚩 **Google Play requirements**: «Ошибка в разборе? Сообщить» under every AI answer (in-app flagging) and a `/delete-data` page; both land in `/teacher` → Входящие and in your Telegram

---

## How money comes in (all automatic once keys are set)

1. Free visitors get **5 own phrases a day** (packs are unlimited).
2. At the limit, or from the **Pro** tile, they see the Pro offer:
   - **Telegram Stars** (`PRO_STARS`, default 450 ⭐/month): works as soon as `TELEGRAM_BOT_TOKEN` is set.
   - **Card** via lava.top (`PRO_PRICE_RUB` / `PRO_PRICE_USD`): works once the three `LAVA_*` keys are set.
3. After paying, the app switches to Pro by itself, and the buyer gets a personal link (Telegram message, and an email if Resend is set up).
4. Renewals, cancellations and refunds are handled by webhooks. The teacher gets a Telegram alert for each payment and a morning report.
5. Inside the Google Play app, prices and payment buttons are hidden (Play's rules; Georgia has no Play merchant accounts).

## Setup

All settings, with explanations, are in **`.env.example`**. Put them in Vercel → Project → Settings → Environment Variables, then redeploy.

| Feature | What to set |
|---|---|
| The app itself | `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `APP_PASSCODE`, Upstash Redis + Blob (Vercel → Storage) |
| Telegram bot + Stars | `TELEGRAM_BOT_TOKEN`, then `/teacher` → Telegram → **Подключить бота** |
| Alerts to you | send `/admin <APP_PASSCODE>` to your bot |
| Card payments | `LAVA_API_KEY`, `LAVA_OFFER_ID`, `LAVA_WEBHOOK_SECRET` (+ webhook URL `https://<site>/api/pay/lava` in lava.top) |
| Emails with the link | `RESEND_API_KEY`, `EMAIL_FROM` |
| Legal pages | `LEGAL_NAME`, `LEGAL_ID` |
| Own domain | add it in Vercel → Domains, then `NEXT_PUBLIC_SITE_URL` |
| Analytics | built in (teacher → Деньги). Optional Yandex Metrica: `NEXT_PUBLIC_YM_ID` |
| Safety | `CRON_SECRET`; `FREE_BUDGET_SCALE` caps what free visitors can spend per day |

## Run it on your computer

```bash
npm install
cp .env.example .env.local   # then paste your keys into .env.local
npm run dev                  # open http://localhost:3000
```

## Tests

Everything outside the app (Redis, Claude, ElevenLabs, Telegram, lava.top, Resend) is faked by `tests/mock-server.mjs`,
so tests never spend money or message anyone.

```bash
npm test             # unit + API tests (payments, limits, bot, webhooks, content)
npm run build
npm run test:e2e     # browser tests on a phone-sized screen (free limit → paywall → card / Stars → Pro, Android mode, pages)
npm run check        # all of the above
```

GitHub Actions runs the same on every push (`.github/workflows/ci.yml`).

The Android app is built and signed by GitHub too (`.github/workflows/android.yml`): push a tag like `android-v1.0.1`
or press Run workflow. See `android/README.md`.

## Where to change things

| Want to change… | File |
|---|---|
| Prices | Vercel env: `PRO_STARS`, `PRO_PRICE_RUB`, `PRO_PRICE_USD` (and the price in lava.top) |
| Free and Pro daily limits | `lib/auth.ts` |
| Pro offer text | `app/ProSheet.tsx` |
| Landing page | `app/start/page.tsx` |
| Terms / privacy | `app/terms/page.tsx`, `app/privacy/page.tsx` |
| Phrase packs (+ Russian for public pages) | `lib/packs.ts`, `lib/phrases.ts`, then `npx tsx scripts/bake.ts` |
| Voices, voice model and settings | `lib/voices.ts`, then `npx tsx scripts/bake.ts` (re-makes the pack audio in the default voice) |
| The connected-speech rules | `lib/rulebook.ts` |
| What the AI writes | `lib/prompts.ts` |
| Bot messages | `app/api/telegram/route.ts` |
| Colors and fonts | `app/globals.css` |
| Android app (name, icon, version) | `android/twa-manifest.json` — see `android/README.md` |

## Costs (rough)

- **Voice**: ElevenLabs charges per character (Flash v2.5 costs half of Multilingual v2). Pack audio is pre-generated in the default voice (~12,000 characters once), so packs are free to play. Everything else is made on first use and cached for everyone.
- **Breakdown**: one Claude call per new phrase (cached for everyone after that; the long instructions are prompt-cached).
- Free visitors are capped per device, per network and in total per day (`FREE_BUDGET_SCALE`), so a bot can't drain your credits.
