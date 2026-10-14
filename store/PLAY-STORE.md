# Google Play launch kit — Neuro-Fluent Shadow

Everything Play Console asks for, already answered. Copy, paste, click.
App package: `com.neurofluent.shadow` · Site: https://neuro-fluent-shadow-faj3.vercel.app

## What's in this folder

| File | Where it goes in Play Console |
|---|---|
| `listing-ru.txt` | Store listing: app name, short description, full description |
| `icon-512.png` | Store listing → App icon |
| `feature-graphic.png` | Store listing → Feature graphic |
| `screenshots/screenshot-1…5.png` | Store listing → Phone screenshots (in this order) |
| the `.aab` file | Testing → Closed testing → Create release. Get it from GitHub → Actions → "Android app" (or v1.0.0 in your Drive key folder / `Downloads\lessons\shadow-app-android`) |

## The timeline (new personal accounts)

1. **Day 0** — create the developer account: play.google.com/console → $25 once → identity check (can take a few days).
2. **Day 1** — create the app, fill sections 1–4 below, upload the `.aab` to **Closed testing**, add your testers.
3. **Days 1–15** — at least **12 testers stay opted in for 14 days in a row**. Recruit 15–16: someone always drops out.
4. **Day 15+** — Dashboard → **Apply for production** (template answers in section 7).
5. Review, then live.

Georgia can't have a Play merchant account, so the Play app is **free**: no prices, no "buy" buttons (the app hides them by itself).
People pay on the website or in Telegram and log in with their code. Google allows this ("consumption-only" apps).

## 1. Create the app

- App name: **Shadow: английский на слух**
- Default language: **Russian – ru-RU**
- App or game: **App** · Free or paid: **Free**
- Tick both declarations.

## 2. Store listing (Grow users → Store presence → Main store listing)

- App name / Short description / Full description: copy from `listing-ru.txt`.
- Icon, feature graphic, 5 phone screenshots: the files above.
- Category: **Education** · Tags: **Language learning**
- Contact email: required and public. Use a support address you're happy to show.
- Website: `https://neuro-fluent-shadow-faj3.vercel.app/start`

## 3. App content (Policy and programs → App content)

| Section | Answer |
|---|---|
| Privacy policy | `https://neuro-fluent-shadow-faj3.vercel.app/privacy` |
| App access | **All or some functionality is restricted**. Instructions: «The free version works without an account. For the full version: menu ⋯ → «Ввести код доступа» → enter the code below.» Code: create a student called "Google Review" in `/teacher` and paste its code. |
| Ads | **No, my app does not contain ads** |
| Content rating | Category **Reference, News, or Educational**. Answer **No** to every question (no violence, sexual content, profanity, drugs, gambling; users can't chat with each other; no purchases inside the app). The dating pack says "grab a drink", which is an everyday phrase, not a depiction of alcohol. Expected rating: Everyone / PEGI 3. |
| Target audience | **18 and over** only. Not designed for children. |
| News app | No |
| Data safety | See section 4 |
| Advertising ID | **No** (the app doesn't use it; the APK has no AD_ID permission) |
| Government apps / Financial features / Health | No / None / No |

## 4. Data safety form

General:
- Collects or shares required user data types: **Yes**
- All data encrypted in transit: **Yes** (HTTPS only)
- Users can request deletion: **Yes** → `https://neuro-fluent-shadow-faj3.vercel.app/delete-data`

Data types (none of it is "shared": Anthropic, ElevenLabs, Vercel and Upstash process it for us as service providers):

| Data type | Collected | Ephemeral? | Required? | Purposes |
|---|---|---|---|---|
| Audio → Voice or sound recordings | Yes | No (kept only when a student sends a take to the teacher) | Optional | App functionality |
| App activity → Other user-generated content (phrases you type) | Yes | No (breakdowns are cached, not linked to you) | Optional | App functionality |
| App activity → App interactions | Yes | No | Required | Analytics |
| Device or other IDs (a random ID the app creates) | Yes | No | Required | App functionality, Analytics, Fraud prevention / security |
| Personal info → Email address (only if you send a deletion request or restore access) | Yes | No | Optional | Account management |

Everything else: **not collected** (no location, contacts, photos, files, health, financial info, messages, crash logs).

## 5. Closed test (Test and release → Testing → Closed testing)

1. Create a track (e.g. "Ученики") → **Create release** → upload the `.aab`.
2. Release notes: `Первая версия: караоке по словам, разбор фраз на русском, 8 готовых наборов, оценка произношения.`
3. Testers → **Create email list** → add your students' Google (Gmail) addresses → save → copy the **opt-in link**.
4. Countries: all.
5. Send students the message below. When they reply with their email, add it to the list and send them the link.
6. Thank-you gift: give each tester a free month in `/teacher` → Деньги → «Выдать Pro вручную» (gifts for **testing** are fine; never offer anything for ratings or reviews).

Message to send (Telegram):

> Привет! Можешь помочь мне с одной штукой? Выкладываю свой тренажёр произношения в Google Play, а Google пускает новые приложения только после того, как 12 человек протестируют их 14 дней подряд.
>
> Что нужно:
> 1. Пришли мне почту, на которую зарегистрирован твой Play Маркет (обычно это Gmail).
> 2. Я пришлю ссылку: жмёшь «Стать тестировщиком» и ставишь приложение.
> 3. Не удаляй его две недели. Если откроешь пару раз и напишешь, что бесит, вообще отлично.
>
> За это дам месяц полной версии бесплатно 🎁 Нужен Android, на айфоне не получится.

## 6. After the first upload (important, 2 minutes)

Play re-signs the app with Google's own key. Without the next step, the Play version shows a browser address bar.

1. Play Console → **Test and release → App integrity** → copy **App signing key certificate → SHA-256**.
2. Vercel → your project → Settings → Environment Variables → `ANDROID_SHA256` = that value → Save → Redeploy.
3. Check: `https://neuro-fluent-shadow-faj3.vercel.app/.well-known/assetlinks.json` now lists two fingerprints.

## 7. Apply for production — answers to adapt

Fill in the real numbers and feedback from your test. Google asks three groups of questions:

**About your closed test**
- Recruiting testers: easy. They're my current English students (I'm a CELTA-certified teacher), many already used the web version.
- Engagement: testers practised the phrase packs, recorded themselves and sent problems through the in-app «Ошибка в разборе? Сообщить» button and Telegram. *(Add: how many testers, how often they used it.)*
- Feedback summary: *(e.g. "asked for slower playback on long phrases", "a stress mark was wrong in one phrase", whatever you actually got)*

**About your app**
- Audience: Russian-speaking adults who know English grammar but struggle to follow fast, natural American speech (IT specialists on international calls, people relocating, series fans).
- Value: hear how a phrase really sounds, see a breakdown in Russian (stress, rhythm, linked sounds), shadow it and get a pronunciation score.
- Expected installs in year one: 1,000–10,000.

**About production readiness**
- Changes after testing: *(list what you fixed)*.
- How you know it's ready: 63 automated unit tests and 20 browser tests run on every change; testers' reports were fixed; the web version has been in daily use by my students.

## 8. Updating the app later

The Android app is a window onto the website, so **website updates reach the app instantly**: no new upload needed.
Upload a new `.aab` only when the app name, icon or address changes (see `android/README.md`: push a tag `android-v1.0.1`, GitHub builds it).

Note: Google's new **developer verification** also covers APKs installed outside Play (enforcement started September 2026 in Brazil, Indonesia, Singapore and Thailand, and goes global during 2027). Creating the app in Play Console registers the package name for you. If Play Console asks you to prove you own the key behind the website APK, it's the same key as in your Drive folder "Neuro-Fluent Shadow - ANDROID KEY".
