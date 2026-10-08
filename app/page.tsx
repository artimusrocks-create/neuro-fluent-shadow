"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import SentenceCard from "./SentenceCard";
import { ApiError, Sentence, fetchBreakdown, getPasscode, setPasscode } from "@/lib/client";

const EXAMPLE: Sentence[] = [
  {
    text: "I did start at the beginning with both of my foreign languages.",
    clear: "I DID START at the BEGINNING with BOTH of my FOREIGN LANGUAGES.",
    fast: "I DID stardathuh beginning wibothuhmy foreign languages.",
    rhythm: "I DID STAR-duh-thuh bi-GIN-ing wi-BOTH-uh-my FOR-in LANG-gwij-iz.",
    blobs: [
      { written: "start at the", blob: "stardathuh", rule: "Flap (E) + Elision (C): T drops before th" },
      { written: "with both of my", blob: "wibothuhmy", rule: "Elision (C): th drops + Linking (D) + of → uh (A)" },
    ],
    chunks: ["I did start", "at the beginning", "with both of my foreign languages."],
    shadow_tip: "Hit DID hardest, then let “at the” slide into “start” with no gap.",
    ru_tip: "The th in “with” basically disappears (wi'both). Lean into it.",
    flags: ["“DID” stays full and loud: it's emphatic, crushing it kills the meaning.", "“beginning” kept clear. Casual option: beginnin'."],
    cyrillic: { stardathuh: "стардаза", wibothuhmy: "уибоузамай" },
  },
];

export default function Page() {
  const [text, setText] = useState("");
  const [cyrillic, setCyrillic] = useState(false);
  const [ruTip, setRuTip] = useState(true);
  const [sentences, setSentences] = useState<Sentence[]>(EXAMPLE);
  const [isExample, setIsExample] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [needPass, setNeedPass] = useState(false);
  const [pass, setPass] = useState("");
  const passRef = useRef<HTMLInputElement>(null);

  useEffect(() => setPass(getPasscode()), []);

  function askPasscode() {
    setNeedPass(true);
    setTimeout(() => passRef.current?.focus(), 50);
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!t) {
      setError("Type or paste a phrase first.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const d = await fetchBreakdown(t, cyrillic);
      setSentences(d.sentences);
      setIsExample(false);
    } catch (err) {
      if (err instanceof ApiError && err.kind === "passcode") {
        askPasscode();
        setError("Enter the passcode, then press Break it down again.");
      } else setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="wrap">
      <header>
        <div className="topline">
          <span className="brand">Neuro-Fluent · Shadowing</span>
          <button type="button" className="linkish" onClick={askPasscode}>
            🔑 Passcode
          </button>
        </div>
        <h1>
          Hear it. <span className="hl">Copy it.</span> Own it.
        </h1>
        <p className="sub">Paste the phrase you&apos;re shadowing. Listen with karaoke highlight, repeat in the gaps, record yourself, and see exactly why it sounds that way.</p>
      </header>

      {needPass && (
        <form
          className="passbox"
          onSubmit={(e) => {
            e.preventDefault();
            setPasscode(pass.trim());
            setNeedPass(false);
            setError("");
          }}
        >
          <label htmlFor="pass">Passcode</label>
          <input id="pass" ref={passRef} value={pass} onChange={(e) => setPass(e.target.value)} placeholder="From your teacher" autoComplete="off" />
          <button type="submit" className="go small">
            Save
          </button>
        </form>
      )}

      <form className="box" onSubmit={submit}>
        <textarea
          id="input"
          aria-label="Phrase to shadow"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          placeholder="e.g. What are you going to do about it?"
        />
        <div className="controls">
          <div className="toggles">
            <label className="chip-toggle">
              <input type="checkbox" checked={cyrillic} onChange={(e) => setCyrillic(e.target.checked)} /> Кириллица
            </label>
            <label className="chip-toggle">
              <input type="checkbox" checked={ruTip} onChange={(e) => setRuTip(e.target.checked)} /> RU tip
            </label>
          </div>
          <button type="submit" className="go" disabled={loading}>
            {loading ? "Working…" : "Break it down"} <kbd>⌘↵</kbd>
          </button>
        </div>
      </form>

      {loading && (
        <div className="status">
          <span className="dots">
            <i />
            <i />
            <i />
          </span>{" "}
          Crushing the small words…
        </div>
      )}
      {error && <div className="status error">{error}</div>}

      <section className="results">
        {isExample && <div className="example-tag">Example — audio plays once your keys are set up</div>}
        {sentences.map((s, i) => (
          <SentenceCard
            key={`${s.text}-${i}`}
            s={s}
            index={i}
            total={sentences.length}
            showCyrillic={cyrillic}
            showTip={ruTip}
            onPasscodeNeeded={askPasscode}
          />
        ))}
      </section>

      <footer>American English · Mainstream connected speech · No IPA</footer>
    </main>
  );
}
