# Neuro-Fluent Shadowing

A shadowing companion for American English. Paste a phrase and get:

- 🎤 **Karaoke audio**: each word lights up as it's spoken. Stressed words are big, small words are small.
- 🐢 / 🔥 **Speed ladder**: 0.75 · 1.0 · 1.15
- 🔁 **Echo ×3**: plays, then gives you a timed gap to repeat
- 🧱 **Build-up (backchaining)**: last chunk → last two → … → full sentence
- 🎤 **Record me → 🆚 Compare**: the model, then you, back to back
- 🔥 **Fast-speech breakdown**: Clear · Fast · Rhythm beats · Blobs + rules (tap any blob to hear it)
- 📖 **Every word**: Russian translation, nuance, etymology, collocations

---

## Step 1 — Get your 3 keys (about 15 min)

| # | What | Where |
|---|---|---|
| 1 | **Anthropic API key** (Claude writes the breakdowns) | https://console.anthropic.com/settings/keys (add a few dollars of credit under **Billing**) |
| 2 | **ElevenLabs API key** (the voice) | https://elevenlabs.io/app/settings/api-keys |
| 3 | **ElevenLabs Voice ID** (your cloned voice) | Clone it: https://elevenlabs.io/app/voice-lab → **Add voice → Instant Voice Clone** (upload 1–2 min of clean audio of you talking). Then open the voice and copy its **ID**. |

> No clone yet? Pick any American voice from https://elevenlabs.io/app/voice-library and use its ID to test.

When you create the ElevenLabs key, give it permission for **Text to Speech**.

---

## Step 2 — Put it online (Vercel, free)

1. Make a free GitHub account: https://github.com/signup
2. Make a new **private** repository: https://github.com/new
3. Click **"uploading an existing file"** and drag in everything from this folder (not `node_modules`, not `.next`). Commit.
4. Make a free Vercel account (sign in with GitHub): https://vercel.com/signup
5. Go to https://vercel.com/new → **Import** your repository.
6. Before you click **Deploy**, open **Environment Variables** and add:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your Anthropic key |
| `ELEVENLABS_API_KEY` | your ElevenLabs key |
| `ELEVENLABS_VOICE_ID` | your voice ID |
| `APP_PASSCODE` | any word you choose; give it to your students |

7. Click **Deploy**. In about 1 minute you get a link like `neuro-fluent-shadow.vercel.app`.
8. Open it → **🔑 Passcode** → type your passcode → paste a phrase → **Break it down**.

Optional settings: `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`) and `ELEVENLABS_MODEL` (default `eleven_multilingual_v2`).

---

## Run it on your own computer (optional)

```bash
npm install
cp .env.example .env.local   # then paste your keys into .env.local
npm run dev                  # open http://localhost:3000
```

---

## Where to change things

| Want to change… | File |
|---|---|
| The connected-speech rules | `lib/rulebook.ts` |
| What the AI writes (breakdown + word notes) | `lib/prompts.ts` |
| Speeds, echo repeats | top of `app/SentenceCard.tsx` |
| Colors and fonts | `app/globals.css` |
| Voice settings (stability, style) | `app/api/speak/route.ts` |

## Costs (rough)

- **Voice**: ElevenLabs charges per character. One sentence at one speed is cheap. Each speed is a separate clip, and the app reuses clips while the page is open.
- **Breakdown**: one Claude call per phrase. **Every word** is a second call, made only when someone opens it.
- The passcode stops strangers from spending your credits.

## Known limits (v1)

- The AI voice says the sentence its own way, so it can differ a little from the respelling. Test your clone on tricky phrases.
- Etymology marked **⚠ проверить** is the AI being unsure. Check it before you teach it.
- No pronunciation scoring yet. That's v2.
