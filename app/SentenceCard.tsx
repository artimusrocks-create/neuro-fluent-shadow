"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  Cancelled,
  Sentence,
  WordInfo,
  alive,
  fetchClip,
  fetchWords,
  findOffset,
  newRun,
  playUrl,
  splitWords,
  stopAll,
  wait,
  wordAt,
} from "@/lib/client";

const SPEEDS = [
  { v: 0.75, label: "🐢 0.75" },
  { v: 1, label: "1.0" },
  { v: 1.15, label: "🔥 1.15" },
];
const ECHO_REPEATS = 3;

type Props = {
  s: Sentence;
  index: number;
  total: number;
  showCyrillic: boolean;
  showTip: boolean;
  onPasscodeNeeded: () => void;
};

/** Loud if it has 2+ capital letters in a row ("BOTH", "aBOUT"). */
const isLoud = (w: string) => /[A-Z]{2,}/.test(w.replace(/[^A-Za-z]/g, ""));

/** A word is "stressed" in the CLEAR line if it is written in CAPS (2+ letters). */
function stressFlags(text: string, clear: string): boolean[] {
  const t = splitWords(text);
  const c = splitWords(clear);
  return t.map((_, i) => {
    return isLoud(c[i] ?? "");
  });
}

export default function SentenceCard({ s, index, total, showCyrillic, showTip, onPasscodeNeeded }: Props) {
  const words = useMemo(() => splitWords(s.text), [s.text]);
  const stressed = useMemo(() => stressFlags(s.text, s.clear), [s.text, s.clear]);
  const chunks = useMemo(() => (Array.isArray(s.chunks) && s.chunks.length ? s.chunks : [s.text]), [s.chunks, s.text]);

  const [speed, setSpeed] = useState(1);
  const [active, setActive] = useState(-1); // word index being spoken
  const [range, setRange] = useState<[number, number] | null>(null); // words included in current playback
  const [busy, setBusy] = useState<string | null>(null); // which mode is running
  const [status, setStatus] = useState<string>("");
  const [turn, setTurn] = useState(0); // 0..1 progress of "your turn" gap
  const [error, setError] = useState("");

  const [recording, setRecording] = useState(false);
  const [myTake, setMyTake] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);

  const [wordsOpen, setWordsOpen] = useState(false);
  const [wordData, setWordData] = useState<WordInfo[] | null>(null);
  const [wordsLoading, setWordsLoading] = useState(false);
  const [openWord, setOpenWord] = useState<number | null>(null);

  useEffect(() => () => stopAll(), []);

  function handleError(e: unknown) {
    if (e instanceof Cancelled) return;
    if (e instanceof ApiError && e.kind === "passcode") {
      onPasscodeNeeded();
      setError("Enter the passcode above, then try again.");
      return;
    }
    setError(e instanceof Error ? e.message : "Something went wrong.");
  }

  function reset() {
    setBusy(null);
    setActive(-1);
    setRange(null);
    setStatus("");
    setTurn(0);
  }

  /** Speak `text` (a piece of the sentence starting at word `offset`) with karaoke highlight. */
  async function speak(token: number, text: string, offset: number, spd = speed) {
    setStatus("Loading voice…");
    const clip = await fetchClip(text, spd);
    if (!alive(token)) throw new Cancelled();
    const n = splitWords(text).length;
    setRange(offset >= 0 ? [offset, offset + n - 1] : null);
    setStatus("");
    const dur = await playUrl(token, clip.url, (t) => {
      if (offset < 0) return;
      const i = wordAt(clip.words, t);
      setActive(i < 0 ? -1 : offset + Math.min(i, n - 1));
    });
    setActive(offset >= 0 ? offset + n : -1); // everything in range "done"
    return dur;
  }

  async function yourTurn(token: number, seconds: number, label: string) {
    setStatus(label);
    await wait(token, Math.max(1200, seconds * 1000 + 700), setTurn);
    setTurn(0);
    setStatus("");
  }

  async function run(mode: string, fn: (token: number) => Promise<void>) {
    if (busy === mode) {
      stopAll();
      reset();
      return;
    }
    const token = newRun();
    setError("");
    setBusy(mode);
    try {
      await fn(token);
    } catch (e) {
      handleError(e);
    } finally {
      if (alive(token)) reset();
    }
  }

  const play = () => run("play", async (t) => void (await speak(t, s.text, 0)));

  const echo = () =>
    run("echo", async (t) => {
      for (let r = 1; r <= ECHO_REPEATS; r++) {
        const dur = await speak(t, s.text, 0);
        await yourTurn(t, dur, `🎤 Your turn — ${r}/${ECHO_REPEATS}`);
      }
    });

  const buildUp = () =>
    run("build", async (t) => {
      for (let i = chunks.length - 1; i >= 0; i--) {
        const piece = chunks.slice(i).join(" ");
        const offset = splitWords(chunks.slice(0, i).join(" ")).length;
        const dur = await speak(t, piece, offset);
        await yourTurn(t, dur, `🎤 Repeat — step ${chunks.length - i}/${chunks.length}`);
      }
    });

  const playPiece = (piece: string, key: string, spd = speed) =>
    run(key, async (t) => void (await speak(t, piece, findOffset(s.text, piece), spd)));

  async function toggleRecord() {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const parts: BlobPart[] = [];
      rec.ondataavailable = (e) => parts.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        if (myTake) URL.revokeObjectURL(myTake);
        setMyTake(URL.createObjectURL(new Blob(parts, { type: rec.mimeType || "audio/webm" })));
        setRecording(false);
      };
      recRef.current = rec;
      stopAll();
      reset();
      rec.start();
      setRecording(true);
    } catch {
      setError("Microphone access was blocked. Allow the mic in your browser, then try again.");
    }
  }

  const compare = () =>
    run("compare", async (t) => {
      if (!myTake) return;
      await speak(t, s.text, 0);
      await wait(t, 500);
      setActive(-1);
      setRange(null);
      setStatus("🎧 Now you");
      await playUrl(t, myTake);
    });

  async function toggleWords() {
    const next = !wordsOpen;
    setWordsOpen(next);
    if (!next || wordData || wordsLoading) return;
    setWordsLoading(true);
    setError("");
    try {
      const d = await fetchWords(s.text);
      setWordData(d.words);
    } catch (e) {
      handleError(e);
      setWordsOpen(false);
    } finally {
      setWordsLoading(false);
    }
  }

  // ----- render helpers -----
  const blobList = (s.blobs ?? []).map((b) => b.blob).filter(Boolean).sort((a, b) => b.length - a.length);
  const fastParts = useMemo(() => {
    if (!blobList.length) return [{ text: s.fast, blob: null as null | string }];
    const re = new RegExp("(" + blobList.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "g");
    return s.fast.split(re).map((p, i) => ({ text: p, blob: i % 2 ? p : null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.fast, blobList.join("|")]);

  const rhythmSyllables = useMemo(
    () =>
      splitWords(s.rhythm).map((w) =>
        w.split("-").filter(Boolean).map((syl) => {
          const letters = syl.replace(/[^A-Za-z]/g, "");
          return { syl, loud: letters.length > 1 && letters === letters.toUpperCase() };
        })
      ),
    [s.rhythm]
  );

  const cyr = Object.entries(s.cyrillic ?? {});

  return (
    <article className="card">
      <div className="card-head">
        {total > 1 && <span className="num">{index + 1}</span>}
        <span className="eyebrow">Shadow this</span>
      </div>

      {/* Karaoke line */}
      <p className="karaoke" aria-live="off">
        {words.map((w, i) => {
          const state = !range
            ? ""
            : i < range[0] || i > range[1]
              ? "dim"
              : i === active
                ? "now"
                : i < active
                  ? "done"
                  : "";
          return (
            <span key={i} className={`kw ${stressed[i] ? "loud" : "soft"} ${state}`}>
              {w}
            </span>
          );
        })}
      </p>

      {/* Player */}
      <div className="player">
        <div className="speeds" role="group" aria-label="Speed">
          {SPEEDS.map((sp) => (
            <button
              key={sp.v}
              type="button"
              className={`seg ${speed === sp.v ? "on" : ""}`}
              onClick={() => setSpeed(sp.v)}
              aria-pressed={speed === sp.v}
            >
              {sp.label}
            </button>
          ))}
        </div>
        <div className="actions">
          <button type="button" className={`act primary ${busy === "play" ? "running" : ""}`} onClick={play}>
            {busy === "play" ? "■ Stop" : "▶ Play"}
          </button>
          <button type="button" className={`act ${busy === "echo" ? "running" : ""}`} onClick={echo} title="Plays, then pauses for you to repeat. 3 rounds.">
            {busy === "echo" ? "■ Stop" : "🔁 Echo ×3"}
          </button>
          <button type="button" className={`act ${busy === "build" ? "running" : ""}`} onClick={buildUp} title="Backchaining: last chunk first, then add one chunk at a time.">
            {busy === "build" ? "■ Stop" : "🧱 Build-up"}
          </button>
          <button type="button" className={`act ${recording ? "rec" : ""}`} onClick={toggleRecord}>
            {recording ? "⏺ Stop recording" : "🎤 Record me"}
          </button>
          {myTake && (
            <button type="button" className={`act ${busy === "compare" ? "running" : ""}`} onClick={compare}>
              {busy === "compare" ? "■ Stop" : "🆚 Compare"}
            </button>
          )}
        </div>
        {(status || turn > 0) && (
          <div className="status-line">
            <span>{status}</span>
            {turn > 0 && (
              <span className="turnbar">
                <i style={{ width: `${turn * 100}%` }} />
              </span>
            )}
          </div>
        )}
        {error && <div className="error">{error}</div>}
      </div>

      {s.shadow_tip && <div className="shadow-tip">🎯 {s.shadow_tip}</div>}

      {/* Chunks */}
      <div className="row">
        <span className="label l-chunks">Chunks</span>
        <div className="chunks">
          {chunks.map((c, i) => (
            <button key={i} type="button" className={`chunk ${busy === `chunk${i}` ? "running" : ""}`} onClick={() => playPiece(c, `chunk${i}`)}>
              ▶ {c}
            </button>
          ))}
        </div>
      </div>

      <div className="row">
        <span className="label l-clear">Clear</span>
        <div className="clear-text">
          {splitWords(s.clear).map((w, i) => {
            const loud = isLoud(w);
            return (
              <span key={i}>
                {loud ? <b>{w}</b> : w}{" "}
              </span>
            );
          })}
        </div>
      </div>

      <div className="row">
        <span className="label l-fast">Fast</span>
        <div className="fast-text">
          {fastParts.map((p, i) => {
            if (!p.blob) return <span key={i}>{p.text}</span>;
            const b = s.blobs.find((x) => x.blob === p.blob);
            return (
              <button key={i} type="button" className="blobmark" title={`Play "${b?.written}"`} onClick={() => b && playPiece(b.written, `blob${i}`)}>
                {p.text}
              </button>
            );
          })}
        </div>
      </div>

      <div className="row">
        <span className="label l-rhythm">Rhythm</span>
        <div className="beats">
          {rhythmSyllables.map((word, wi) => (
            <span key={wi} className="beat-word">
              {word.map((x, si) => (
                <span key={si} className={`beat ${x.loud ? "loud" : ""}`}>
                  <i className="dot" />
                  <span>{x.syl}</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {s.blobs?.length > 0 && (
        <div className="row">
          <span className="label l-blobs">Blobs</span>
          <ul className="blobs">
            {s.blobs.map((b, i) => (
              <li key={i}>
                <button type="button" className="mini-play" onClick={() => playPiece(b.written, `blobrow${i}`, 0.75)} aria-label={`Play ${b.written} slowly`}>
                  ▶
                </button>
                <span className="w">{b.written}</span>
                <span className="arrow">→</span>
                <span className="b">{b.blob}</span>
                <span className="r">{b.rule}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showCyrillic && cyr.length > 0 && (
        <div className="row">
          <span className="label l-cyr">Кириллица</span>
          <div className="cyr">
            {cyr.map(([k, v]) => (
              <span key={k}>
                {k} → <b>{v}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      {showTip && s.ru_tip && <div className="tip">🇷🇺 {s.ru_tip}</div>}

      {s.flags && s.flags.length > 0 && (
        <div className="flags">
          {s.flags.map((f, i) => (
            <div key={i} className="flag">
              {f}
            </div>
          ))}
        </div>
      )}

      {/* Word-by-word */}
      <button type="button" className="words-toggle" onClick={toggleWords} aria-expanded={wordsOpen}>
        {wordsOpen ? "▾" : "▸"} 📖 Every word: translation, nuance, etymology, collocations
      </button>
      {wordsOpen && (
        <div className="words">
          {wordsLoading && <div className="loading">Breaking down every word…</div>}
          {wordData?.map((w, i) =>
            w.type === "function" ? (
              <div key={i} className="w-func">
                <span className="w-word">{w.word}</span>
                <span className="w-sound">{w.sound}</span>
                <span className="w-ru">{w.ru}</span>
                <span className="w-note">{w.note}</span>
              </div>
            ) : (
              <div key={i} className={`w-content ${openWord === i ? "open" : ""}`}>
                <button type="button" className="w-head" onClick={() => setOpenWord(openWord === i ? null : i)} aria-expanded={openWord === i}>
                  <span className="w-word big">{w.word}</span>
                  <span className="w-sound">{w.sound}</span>
                  <span className="w-ru">{w.ru}</span>
                  <span className="w-caret">{openWord === i ? "−" : "+"}</span>
                </button>
                {openWord === i && (
                  <div className="w-body">
                    <button type="button" className="mini-play" onClick={() => playPiece(w.word, `word${i}`, 0.9)} aria-label={`Play ${w.word}`}>
                      ▶
                    </button>
                    {w.nuance && (
                      <p>
                        <b>Нюанс:</b> {w.nuance}
                      </p>
                    )}
                    {w.etymology && (
                      <p>
                        <b>Этимология:</b> {w.etymology} {w.etymology_unsure && <span className="unsure">⚠ проверить</span>}
                      </p>
                    )}
                    {w.collocations && w.collocations.length > 0 && (
                      <ul className="collos">
                        {w.collocations.map((c, j) => (
                          <li key={j}>
                            <span className="en">{c.en}</span> <span className="ru">— {c.ru}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}
    </article>
  );
}
