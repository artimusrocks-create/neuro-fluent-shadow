"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  Cancelled,
  Sentence,
  WordInfo,
  alive,
  fetchClip,
  fetchScoreWords,
  fetchWords,
  sendToTeacher,
  findOffset,
  newRun,
  playUrl,
  splitWords,
  stopAll,
  wait,
  wordAt,
} from "@/lib/client";
import { scoreTake, ScoreResult } from "@/lib/score";
import { review, toggleSave, track, useProgress, libId } from "@/lib/progress";
import { renderReel } from "@/lib/reels";
import Waveform from "./Waveform";

// tts = speed asked from the voice; rate = extra browser slow-down (voice can't go below 0.7)
const SPEEDS = [
  { id: "0.5", tts: 0.7, rate: 0.715, label: "🐌 0.5" },
  { id: "0.75", tts: 0.75, rate: 1, label: "🐢 0.75" },
  { id: "1", tts: 1, rate: 1, label: "1.0" },
  { id: "1.15", tts: 1.15, rate: 1, label: "🔥 1.15" },
];
type Speed = (typeof SPEEDS)[number];
const ECHO_REPEATS = 3;

type Props = {
  s: Sentence;
  index: number;
  total: number;
  showCyrillic: boolean;
  showTip: boolean;
  fromLibrary?: boolean;
  canSend?: boolean;
  onPasscodeNeeded: () => void;
};

/** Loud if it has 2+ capital letters in a row ("BOTH", "aBOUT"). */
const isLoud = (w: string) => /[A-Z]{2,}/.test(w.replace(/[^A-Za-z]/g, ""));

function stressFlags(text: string, clear: string): boolean[] {
  const c = splitWords(clear);
  return splitWords(text).map((_, i) => isLoud(c[i] ?? ""));
}

export default function SentenceCard({ s, index, total, showCyrillic, showTip, fromLibrary, canSend, onPasscodeNeeded }: Props) {
  const progress = useProgress();
  const { gap, hide } = progress.settings;
  const saved = progress.library.some((x) => x.id === libId(s.text));

  const words = useMemo(() => splitWords(s.text), [s.text]);
  const stressed = useMemo(() => stressFlags(s.text, s.clear), [s.text, s.clear]);
  const chunks = useMemo(() => (Array.isArray(s.chunks) && s.chunks.length ? s.chunks : [s.text]), [s.chunks, s.text]);

  const [speed, setSpeed] = useState<Speed>(SPEEDS[2]);
  const [active, setActive] = useState(-1);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [turn, setTurn] = useState(0);
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState<null | boolean>(null);

  const [recording, setRecording] = useState(false);
  const [myTake, setMyTake] = useState<{ url: string; blob: Blob } | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);

  const [scoring, setScoring] = useState(false);
  const [score, setScore] = useState<ScoreResult | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);

  const [sendState, setSendState] = useState<"idle" | "sending" | "sent">("idle");
  const [reel, setReel] = useState<{ p: number; url?: string; ext?: string } | null>(null);

  const [wordsOpen, setWordsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [details, setDetails] = useState(false);
  const [scoreMore, setScoreMore] = useState(false);
  const [wordData, setWordData] = useState<WordInfo[] | null>(null);
  const [wordsLoading, setWordsLoading] = useState(false);
  const [openWord, setOpenWord] = useState<number | null>(null);

  useEffect(() => () => stopAll(), []);
  const veiled = hide && !revealed;

  function handleError(e: unknown) {
    if (e instanceof Cancelled) return;
    if (e instanceof ApiError && e.kind === "passcode") {
      onPasscodeNeeded();
      setError("Введи пароль сверху и попробуй ещё раз.");
      return;
    }
    setError(e instanceof Error ? e.message : "Что-то сломалось. Попробуй ещё раз.");
  }

  function reset() {
    setBusy(null);
    setActive(-1);
    setRange(null);
    setStatus("");
    setTurn(0);
  }

  async function speak(token: number, text: string, offset: number, sp: Speed = speed) {
    setStatus("Загружаем голос…");
    const clip = await fetchClip(text, sp.tts);
    if (!alive(token)) throw new Cancelled();
    const n = splitWords(text).length;
    setRange(offset >= 0 ? [offset, offset + n - 1] : null);
    setStatus("");
    const dur = await playUrl(
      token,
      clip.url,
      (t) => {
        if (offset < 0) return;
        const i = wordAt(clip.words, t);
        setActive(i < 0 ? -1 : offset + Math.min(i, n - 1));
      },
      sp.rate
    );
    setActive(offset >= 0 ? offset + n : -1);
    return dur;
  }

  async function yourTurn(token: number, seconds: number, label: string) {
    setStatus(label);
    await wait(token, Math.max(1200, seconds * gap * 1000 + 600), setTurn);
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

  const play = () =>
    run("play", async (t) => {
      track("plays");
      await speak(t, s.text, 0);
    });

  const echo = () =>
    run("echo", async (t) => {
      track("echoes");
      for (let r = 1; r <= ECHO_REPEATS; r++) {
        const dur = await speak(t, s.text, 0);
        await yourTurn(t, dur, `🎤 Твоя очередь — ${r}/${ECHO_REPEATS}`);
      }
    });

  const buildUp = () =>
    run("build", async (t) => {
      track("builds");
      for (let i = chunks.length - 1; i >= 0; i--) {
        const piece = chunks.slice(i).join(" ");
        const offset = splitWords(chunks.slice(0, i).join(" ")).length;
        const dur = await speak(t, piece, offset);
        await yourTurn(t, dur, `🎤 Повтори — шаг ${chunks.length - i}/${chunks.length}`);
      }
    });

  const playPiece = (piece: string, key: string, sp: Speed = speed) =>
    run(key, async (t) => void (await speak(t, piece, findOffset(s.text, piece), sp)));

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
        if (myTake) URL.revokeObjectURL(myTake.url);
        const blob = new Blob(parts, { type: rec.mimeType || "audio/webm" });
        setMyTake({ url: URL.createObjectURL(blob), blob });
        setScore(null);
        setSendState("idle");
        setRecording(false);
        track("records");
      };
      recRef.current = rec;
      stopAll();
      reset();
      rec.start();
      setRecording(true);
    } catch {
      setError("Микрофон заблокирован. Разреши доступ в браузере. Мы не подслушиваем, честно.");
    }
  }

  const compare = () =>
    run("compare", async (t) => {
      if (!myTake) return;
      await speak(t, s.text, 0);
      await wait(t, 500);
      setActive(-1);
      setRange(null);
      setStatus("🎧 А теперь ты. Мужайся.");
      await playUrl(t, myTake.url);
    });

  async function rate() {
    if (!myTake || scoring) return;
    setScoring(true);
    setError("");
    try {
      const [heard, model] = await Promise.all([fetchScoreWords(myTake.blob), fetchClip(s.text, 1)]);
      setModelUrl(model.url);
      if (!heard.words.length) {
        setError("Ничего не расслышали. Говори ближе к микрофону и погромче.");
        return;
      }
      const r = scoreTake({ target: s.text, stressed, model: model.words, user: heard.words, heard: heard.text });
      setScore(r);
      track("score", r.total);
    } catch (e) {
      handleError(e);
    } finally {
      setScoring(false);
    }
  }

  async function send() {
    if (!myTake || sendState !== "idle") return;
    setSendState("sending");
    setError("");
    try {
      await sendToTeacher(myTake.blob, s.text, score?.total ?? null);
      setSendState("sent");
    } catch (e) {
      setSendState("idle");
      handleError(e);
    }
  }

  async function makeReel() {
    if (reel && !reel.url) return;
    setError("");
    setReel({ p: 0 });
    try {
      const [slow, fast] = await Promise.all([fetchClip(s.text, 0.75), fetchClip(s.text, 1.15)]);
      const out = await renderReel({ s, stressed, slow, fast, onProgress: (p) => setReel({ p }) });
      const url = URL.createObjectURL(out.blob);
      setReel({ p: 1, url, ext: out.ext });
      track("reels");
      const a = document.createElement("a");
      a.href = url;
      a.download = `neuro-fluent-${Date.now()}.${out.ext}`;
      a.click();
    } catch (e) {
      setReel(null);
      handleError(e);
    }
  }

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
  const blobKey = (s.blobs ?? []).map((b) => b.blob).join("|");
  const fastParts = useMemo(() => {
    const list = (s.blobs ?? []).map((b) => b.blob).filter(Boolean).sort((a, b) => b.length - a.length);
    if (!list.length) return [{ text: s.fast, blob: null as null | string }];
    const re = new RegExp("(" + list.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "g");
    return s.fast.split(re).map((p, i) => ({ text: p, blob: i % 2 ? p : null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.fast, blobKey]);

  const rhythmSyllables = useMemo(
    () =>
      splitWords(s.rhythm).map((w) =>
        w
          .split("-")
          .filter(Boolean)
          .map((syl) => {
            const letters = syl.replace(/[^A-Za-z]/g, "");
            return { syl, loud: letters.length > 1 && letters === letters.toUpperCase() };
          })
      ),
    [s.rhythm]
  );

  const cyr = Object.entries(s.cyrillic ?? {});
  const verdictClass = (v: string) => (v === "ok" ? "v-ok" : v === "missed" ? "v-miss" : "v-warn");
  const nextSpeed = () => setSpeed(SPEEDS[(SPEEDS.findIndex((x) => x.id === speed.id) + 1) % SPEEDS.length]);
  const menuItem = (label: string, onClick: () => void, disabled = false) => (
    <button
      type="button"
      className="menu-item"
      disabled={disabled}
      onClick={() => {
        setMenuOpen(false);
        onClick();
      }}
    >
      {label}
    </button>
  );

  return (
    <article className="card">
      <div className="card-top">
        {total > 1 && <span className="num">{index + 1}</span>}
        <p className={`karaoke ${veiled ? "veiled" : ""}`} aria-hidden={veiled}>
          {words.map((w, i) => {
            const state = !range ? "" : i < range[0] || i > range[1] ? "dim" : i === active ? "now" : i < active ? "done" : "";
            return (
              <span key={i} className={`kw ${stressed[i] ? "loud" : "soft"} ${state}`}>
                {w}
              </span>
            );
          })}
        </p>
        <div className="menu-wrap">
          <button type="button" className="dots-btn" aria-label="Ещё" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            ⋯
          </button>
          {menuOpen && (
            <>
              <button type="button" className="menu-scrim" aria-label="Закрыть меню" onClick={() => setMenuOpen(false)} />
              <div className="menu" role="menu">
                {menuItem(details ? "🔎 Скрыть разбор" : "🔎 Полный разбор", () => setDetails(!details))}
                {menuItem(wordsOpen ? "📖 Скрыть слова" : "📖 Каждое слово", toggleWords)}
                {menuItem("🧱 По кусочкам", buildUp)}
                {menuItem(saved ? "★ Убрать из моих фраз" : "☆ Сохранить в мои фразы", () => toggleSave(s))}
                {menuItem(reel && !reel.url ? `🎬 Снимаем… ${Math.round(reel.p * 100)}%` : "🎬 Видео для Reels", makeReel, !!reel && !reel.url)}
                {canSend && myTake && menuItem(sendState === "sent" ? "✓ Отправлено преподу" : "📤 Отправить преподу", send, sendState !== "idle")}
              </div>
            </>
          )}
        </div>
      </div>

      {!veiled && (
        <div className="fast-line">
          {fastParts.map((p, i) => {
            if (!p.blob) return <span key={i}>{p.text}</span>;
            const b = s.blobs.find((x) => x.blob === p.blob);
            return (
              <button key={i} type="button" className="blobmark" title={`Послушать «${b?.written}»`} onClick={() => b && playPiece(b.written, `blob${i}`)}>
                {p.text}
              </button>
            );
          })}
        </div>
      )}

      <div className="controls-row">
        <button type="button" className={`act primary ${busy === "play" ? "running" : ""}`} onClick={play}>
          {busy === "play" ? "■ Стоп" : "▶ Слушать"}
        </button>
        <button type="button" className={`act ${busy === "echo" ? "running" : ""}`} onClick={echo} title="Сказал, пауза, твоя очередь. Три круга.">
          {busy === "echo" ? "■ Стоп" : "🔁 Эхо"}
        </button>
        {busy === "build" && (
          <button type="button" className="act running" onClick={buildUp}>
            ■ Стоп
          </button>
        )}
        <button type="button" className={`act ${recording ? "rec" : ""}`} onClick={toggleRecord}>
          {recording ? "⏺ Стоп" : "🎤"}
        </button>
        {myTake && !recording && (
          <>
            <button type="button" className={`act ${busy === "compare" ? "running" : ""}`} onClick={compare} title="Модель, потом ты">
              {busy === "compare" ? "■" : "🆚"}
            </button>
            <button type="button" className="act score-btn" onClick={rate} disabled={scoring}>
              {scoring ? "…" : "🧪 Оценка"}
            </button>
          </>
        )}
        <button type="button" className="speed-btn" onClick={nextSpeed} title="Скорость">
          {speed.label}
        </button>
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

      {score && (
        <div className="score">
          <div className="score-top">
            <div className="score-num">
              <b>{score.total}</b>
              <span>/100</span>
            </div>
            <div className="score-main">
              <div className="score-verdict">{score.verdict}</div>
              <div className="score-words">
                {score.words.map((w, i) => (
                  <span key={i} className={`sw ${verdictClass(w.verdict)}`}>
                    {w.word}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button type="button" className="linkish" onClick={() => setScoreMore(!scoreMore)}>
            {scoreMore ? "Скрыть подробности" : "Подробнее"}
          </button>
          {scoreMore && (
            <>
              <div className="meter-label">
                Русский акцент: <b>{score.accent}%</b>
              </div>
              <div className="meter">
                <i style={{ width: `${score.accent}%` }} />
              </div>
              <div className="subscores">
                <span>Понятность {score.intelligibility}</span>
                <span>Ритм {score.rhythm}</span>
                <span>Темп {score.pace}</span>
              </div>
              <ul className="advice">
                {score.advice.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
              <div className="heard">
                Американское ухо услышало: <i>«{score.heard || "…"}»</i>
              </div>
              {modelUrl && myTake && <Waveform modelUrl={modelUrl} userUrl={myTake.url} />}
            </>
          )}
        </div>
      )}

      {fromLibrary && (
        <div className="review">
          {reviewed === null ? (
            <>
              <span>Как прошло?</span>
              <button type="button" className="act" onClick={() => (review(s.text, true), setReviewed(true))}>
                ✅ Получилось
              </button>
              <button type="button" className="act" onClick={() => (review(s.text, false), setReviewed(false))}>
                😵 Ещё нет
              </button>
            </>
          ) : (
            <span>{reviewed ? "Отлично. Покажем её снова попозже." : "Ничего. Вернём её завтра."}</span>
          )}
        </div>
      )}

      {veiled && (
        <button type="button" className="linkish reveal" onClick={() => setRevealed(true)}>
          🙈 Сначала послушай. Потом — 👀 показать текст
        </button>
      )}

      {reel?.url && (
        <div className="reel-done">
          Видео скачалось.{" "}
          <a href={reel.url} download={`neuro-fluent.${reel.ext}`}>
            Ещё раз
          </a>
        </div>
      )}

      {details && !veiled && (
        <div className="details">
          {s.shadow_tip && <div className="shadow-tip">🎯 {s.shadow_tip}</div>}
          <div className="row">
            <span className="label l-chunks">Куски</span>
            <div className="chunks">
              {chunks.map((c, i) => (
                <button key={i} type="button" className={`chunk ${busy === `chunk${i}` ? "running" : ""}`} onClick={() => playPiece(c, `chunk${i}`)}>
                  ▶ {c}
                </button>
              ))}
            </div>
          </div>
          <div className="row">
            <span className="label l-clear">Чётко</span>
            <div className="clear-text">
              {splitWords(s.clear).map((w, i) => (
                <span key={i}>{isLoud(w) ? <b>{w}</b> : w} </span>
              ))}
            </div>
          </div>
          <div className="row">
            <span className="label l-rhythm">Ритм</span>
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
              <span className="label l-blobs">Склейки</span>
              <ul className="blobs">
                {s.blobs.map((b, i) => (
                  <li key={i}>
                    <button type="button" className="mini-play" onClick={() => playPiece(b.written, `blobrow${i}`, SPEEDS[1])} aria-label={`Послушать медленно: ${b.written}`}>
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
        </div>
      )}

      {wordsOpen && (
        <div className="words">
          {wordsLoading && <div className="loading">Разбираем каждое слово. Даже «the». Особенно «the».</div>}
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
                    <button type="button" className="mini-play" onClick={() => playPiece(w.word, `word${i}`, SPEEDS[2])} aria-label={`Послушать ${w.word}`}>
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
