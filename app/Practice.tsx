"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, motion } from "motion/react";
import confetti from "canvas-confetti";
import {
  BookOpen,
  Bookmark,
  BookmarkCheck,
  Blocks,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Ellipsis,
  Mic,
  Play,
  Repeat,
  Search,
  Send,
  Square,
  Video,
  X,
} from "lucide-react";
import {
  ApiError,
  Cancelled,
  Sentence,
  WordInfo,
  alive,
  fetchClip,
  fetchScoreWords,
  fetchWords,
  findOffset,
  newRun,
  playUrl,
  sendToTeacher,
  splitWords,
  stopAll,
  wait,
  wordAt,
} from "@/lib/client";
import { scoreTake, ScoreResult } from "@/lib/score";
import { libId, review, setSettings, toggleSave, track, useProgress } from "@/lib/progress";
import { renderReel } from "@/lib/reels";
import { DEFAULT_VOICE, VOICES } from "@/lib/voices";
import Sheet from "./ui/Sheet";
import Waveform from "./Waveform";

// tts = speed asked from the voice; rate = extra browser slow-down (voice can't go below 0.7)
const SPEEDS = [
  { id: "0.5", tts: 0.7, rate: 0.715, label: "0.5×" },
  { id: "0.75", tts: 0.75, rate: 1, label: "0.75×" },
  { id: "1", tts: 1, rate: 1, label: "1.0×" },
  { id: "1.15", tts: 1.15, rate: 1, label: "1.15×" },
];
type Speed = (typeof SPEEDS)[number];
const ECHO_REPEATS = 3;
const BARS = 24;

const isLoud = (w: string) => /[A-Z]{2,}/.test(w.replace(/[^A-Za-z]/g, ""));
const stressFlags = (text: string, clear: string) => {
  const c = splitWords(clear);
  return splitWords(text).map((_, i) => isLoud(c[i] ?? ""));
};

function haptic(kind: "light" | "medium" | "success" = "light") {
  try {
    const hf = (window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred: (s: string) => void; notificationOccurred: (s: string) => void } } } })
      .Telegram?.WebApp?.HapticFeedback;
    if (hf) {
      if (kind === "success") hf.notificationOccurred("success");
      else hf.impactOccurred(kind);
      return;
    }
    navigator.vibrate?.(kind === "success" ? [20, 40, 20] : kind === "medium" ? 25 : 12);
  } catch {}
}

type Props = {
  item: Sentence | null;
  loading: boolean;
  loadError: string;
  label: string;
  index: number;
  total: number;
  fromLibrary?: boolean;
  canSend?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onRetry: () => void;
  onPasscodeNeeded: () => void;
};

export default function Practice(props: Props) {
  const { item: s, loading, loadError, label, index, total, fromLibrary, canSend, onPrev, onNext, onClose, onRetry, onPasscodeNeeded } = props;
  const progress = useProgress();
  const { gap, hide, cyrillic, tips } = progress.settings;
  const voice = progress.settings.voice || DEFAULT_VOICE;
  const saved = !!s && progress.library.some((x) => x.id === libId(s.text));

  const words = useMemo(() => (s ? splitWords(s.text) : []), [s]);
  const stressed = useMemo(() => (s ? stressFlags(s.text, s.clear) : []), [s]);
  const chunks = useMemo(() => (s ? (s.chunks?.length ? s.chunks : [s.text]) : []), [s]);

  const [speed, setSpeed] = useState<Speed>(SPEEDS[2]);
  const [active, setActive] = useState(-1);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [turn, setTurn] = useState(0);
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState(false);

  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [bars, setBars] = useState<number[]>(() => new Array(BARS).fill(6));
  const recRef = useRef<{ rec: MediaRecorder; stop: () => void } | null>(null);
  const [myTake, setMyTake] = useState<{ url: string; blob: Blob } | null>(null);

  const [showResult, setShowResult] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [score, setScore] = useState<ScoreResult | null>(null);
  const [shown, setShown] = useState(0);
  const [more, setMore] = useState(false);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent">("idle");
  const [reviewed, setReviewed] = useState<null | boolean>(null);

  const [sheet, setSheet] = useState<null | "actions" | "details" | "words">(null);
  const [wordData, setWordData] = useState<WordInfo[] | null>(null);
  const [wordsLoading, setWordsLoading] = useState(false);
  const [reel, setReel] = useState<{ p: number; done?: boolean } | null>(null);

  useEffect(() => () => stopAll(), []);
  const veiled = hide && !revealed;

  function handleError(e: unknown) {
    if (e instanceof Cancelled) return;
    if (e instanceof ApiError && e.kind === "passcode") {
      onPasscodeNeeded();
      setError("Нужен код доступа.");
      return;
    }
    setError(e instanceof Error ? e.message : "Что-то пошло не так. Попробуй ещё раз.");
  }

  function reset() {
    setBusy(null);
    setActive(-1);
    setRange(null);
    setStatus("");
    setTurn(0);
  }

  async function speak(token: number, text: string, offset: number, sp: Speed = speed) {
    setStatus("Загружаю голос…");
    const clip = await fetchClip(text, sp.tts, voice);
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

  async function yourTurn(token: number, seconds: number, text: string) {
    setStatus(text);
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
    s &&
    run("play", async (t) => {
      haptic();
      track("plays");
      await speak(t, s.text, 0);
    });

  const echo = () =>
    s &&
    run("echo", async (t) => {
      haptic();
      track("echoes");
      for (let r = 1; r <= ECHO_REPEATS; r++) {
        const dur = await speak(t, s.text, 0);
        await yourTurn(t, dur, `Твоя очередь · ${r}/${ECHO_REPEATS}`);
      }
    });

  const buildUp = () =>
    s &&
    run("build", async (t) => {
      track("builds");
      for (let i = chunks.length - 1; i >= 0; i--) {
        const piece = chunks.slice(i).join(" ");
        const offset = splitWords(chunks.slice(0, i).join(" ")).length;
        const dur = await speak(t, piece, offset);
        await yourTurn(t, dur, `Повтори · шаг ${chunks.length - i}/${chunks.length}`);
      }
    });

  const playPiece = (piece: string, key: string, sp: Speed = speed) =>
    s && run(key, async (t) => void (await speak(t, piece, findOffset(s.text, piece), sp)));

  // ---------- Recording with a live wave ----------
  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stopAll();
      reset();
      const rec = new MediaRecorder(stream);
      const parts: BlobPart[] = [];
      rec.ondataavailable = (e) => parts.push(e.data);

      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new Ctx();
      const analyser = ac.createAnalyser();
      analyser.fftSize = 64;
      ac.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let raf = 0;
      const t0 = performance.now();
      const loop = () => {
        analyser.getByteFrequencyData(data);
        const next: number[] = [];
        for (let i = 0; i < BARS; i++) {
          const v = data[Math.min(data.length - 1, Math.floor((i / BARS) * data.length * 0.8) + 1)] / 255;
          next.push(6 + Math.round(v * 104));
        }
        setBars(next);
        setRecSecs(Math.floor((performance.now() - t0) / 1000));
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      rec.onstop = () => {
        cancelAnimationFrame(raf);
        ac.close().catch(() => {});
        stream.getTracks().forEach((tr) => tr.stop());
        setRecording(false);
        const blob = new Blob(parts, { type: rec.mimeType || "audio/webm" });
        if (myTake) URL.revokeObjectURL(myTake.url);
        const take = { url: URL.createObjectURL(blob), blob };
        setMyTake(take);
        track("records");
        rate(take);
      };
      recRef.current = { rec, stop: () => rec.state !== "inactive" && rec.stop() };
      rec.start();
      setRecSecs(0);
      setRecording(true);
      haptic("medium");
    } catch {
      setError("Нет доступа к микрофону. Разреши его в настройках браузера.");
    }
  }

  function stopRecording() {
    haptic("medium");
    recRef.current?.stop();
  }

  async function rate(take: { url: string; blob: Blob }) {
    if (!s) return;
    setShowResult(true);
    setScoring(true);
    setScore(null);
    setShown(0);
    setMore(false);
    setSendState("idle");
    setReviewed(null);
    try {
      const [heard, model] = await Promise.all([fetchScoreWords(take.blob), fetchClip(s.text, 1, voice)]);
      setModelUrl(model.url);
      if (!heard.words.length) {
        setError("Ничего не слышно. Говори ближе к микрофону.");
        setShowResult(false);
        return;
      }
      const r = scoreTake({ target: s.text, stressed, model: model.words, user: heard.words, heard: heard.text });
      setScore(r);
      track("score", r.total);
      animate(0, r.total, { duration: 1.1, ease: "easeOut", onUpdate: (v) => setShown(Math.round(v)) });
      if (r.total >= 90) {
        haptic("success");
        setTimeout(() => confetti({ particleCount: 110, spread: 75, origin: { y: 0.35 }, colors: ["#fff1a8", "#c9bfff", "#d3f1e4", "#ffd6c4"] }), 500);
      }
    } catch (e) {
      setShowResult(false);
      handleError(e);
    } finally {
      setScoring(false);
    }
  }

  const compare = () =>
    myTake &&
    s &&
    run("compare", async (t) => {
      await speak(t, s.text, 0);
      await wait(t, 400);
      setActive(-1);
      setRange(null);
      await playUrl(t, myTake.url);
    });

  async function send() {
    if (!myTake || !s || sendState !== "idle") return;
    setSendState("sending");
    try {
      await sendToTeacher(myTake.blob, s.text, score?.total ?? null);
      setSendState("sent");
      haptic("success");
    } catch (e) {
      setSendState("idle");
      handleError(e);
    }
  }

  async function openWords() {
    setSheet("words");
    if (!s || wordData || wordsLoading) return;
    setWordsLoading(true);
    try {
      setWordData((await fetchWords(s.text)).words);
    } catch (e) {
      handleError(e);
      setSheet(null);
    } finally {
      setWordsLoading(false);
    }
  }

  async function makeReel() {
    if (!s || (reel && !reel.done)) return;
    setSheet(null);
    setReel({ p: 0 });
    try {
      const [slow, fast] = await Promise.all([fetchClip(s.text, 0.75, voice), fetchClip(s.text, 1.15, voice)]);
      const out = await renderReel({ s, stressed, slow, fast, onProgress: (p) => setReel({ p }) });
      const url = URL.createObjectURL(out.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `neuro-fluent-shadow.${out.ext}`;
      a.click();
      track("reels");
      setReel({ p: 1, done: true });
      setTimeout(() => setReel(null), 3000);
    } catch (e) {
      setReel(null);
      handleError(e);
    }
  }

  const nextSpeed = () => setSpeed(SPEEDS[(SPEEDS.findIndex((x) => x.id === speed.id) + 1) % SPEEDS.length]);

  const fastParts = useMemo(() => {
    if (!s) return [];
    const list = (s.blobs ?? []).map((b) => b.blob).filter(Boolean).sort((a, b) => b.length - a.length);
    if (!list.length) return [{ text: s.fast, blob: null as string | null }];
    const re = new RegExp("(" + list.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "g");
    return s.fast.split(re).map((p, i) => ({ text: p, blob: i % 2 ? p : null }));
  }, [s]);

  const ringColor = !score ? "var(--lav-ink)" : score.total >= 75 ? "var(--mint-ink)" : score.total >= 55 ? "var(--lav-ink)" : "var(--peach-ink)";
  const isLast = index >= total - 1;

  return (
    <div className="practice" role="dialog" aria-label="Тренировка">
      <div className="practice-top">
        <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
          <X size={20} />
        </button>
        <div className="counter">
          <button type="button" aria-label="Предыдущая фраза" onClick={onPrev} disabled={index <= 0}>
            <ChevronLeft size={18} />
          </button>
          <span>
            {label} · {index + 1} из {total}
          </span>
          <button type="button" aria-label="Следующая фраза" onClick={onNext} disabled={isLast}>
            <ChevronRight size={18} />
          </button>
        </div>
        <button type="button" className="icon-btn" aria-label="Ещё" onClick={() => setSheet("actions")} disabled={!s}>
          <Ellipsis size={20} />
        </button>
      </div>

      <motion.div
        className="stage"
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.35}
        onDragEnd={(_, info) => {
          if (info.offset.y < -90 && !isLast) onNext();
          else if (info.offset.y > 90 && index > 0) onPrev();
        }}
      >
        {loading || !s ? (
          loadError ? (
            <div style={{ display: "grid", gap: 12, justifyItems: "start" }}>
              <p className="error-line" style={{ textAlign: "left" }}>
                {loadError}
              </p>
              <button type="button" className="wide-btn light" onClick={onRetry}>
                Попробовать ещё раз
              </button>
            </div>
          ) : (
            <div className="skeleton" aria-label="Готовлю фразу">
              <i />
              <i />
              <i />
            </div>
          )
        ) : (
          <>
            <p className={`big-karaoke ${veiled ? "veiled" : ""}`} aria-hidden={veiled}>
              {words.map((w, i) => {
                const st = !range ? "" : i < range[0] || i > range[1] ? "dim" : i === active ? "now" : i < active ? "done" : "";
                return (
                  <motion.span
                    key={i}
                    className={`w ${stressed[i] ? "loud" : "soft"} ${st}`}
                    animate={{ scale: st === "now" ? 1.06 : 1, y: st === "now" ? -2 : 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 28 }}
                  >
                    {w}
                  </motion.span>
                );
              })}
            </p>
            {veiled ? (
              <button type="button" className="chip-btn" style={{ alignSelf: "flex-start" }} onClick={() => setRevealed(true)}>
                Показать текст
              </button>
            ) : (
              <>
                <p className="fast-big">
                  {fastParts.map((p, i) => {
                    if (!p.blob) return <span key={i}>{p.text}</span>;
                    const b = s.blobs.find((x) => x.blob === p.blob);
                    return (
                      <button key={i} type="button" title={`Послушать «${b?.written}»`} onClick={() => b && playPiece(b.written, `blob${i}`)}>
                        {p.text}
                      </button>
                    );
                  })}
                </p>
                {tips && s.shadow_tip && <p className="tip-bubble">{s.shadow_tip}</p>}
              </>
            )}
          </>
        )}
        {error && <p className="error-line">{error}</p>}
        {reel && <p className="loading-line">{reel.done ? "Видео сохранено" : `Делаю видео… ${Math.round(reel.p * 100)}%`}</p>}
      </motion.div>

      <div className="dock">
        <div className="turn" aria-live="polite">
          {status && <span>{status}</span>}
          {turn > 0 && (
            <span className="bar">
              <i style={{ width: `${turn * 100}%` }} />
            </span>
          )}
        </div>
        <div className="dock-row">
          <button type="button" className="speed-pill" onClick={nextSpeed} aria-label={`Скорость ${speed.label}`}>
            {speed.label}
          </button>
          <motion.button
            type="button"
            className="mic-big"
            aria-label="Записать себя"
            onClick={startRecording}
            disabled={!s}
            whileTap={{ scale: 0.92 }}
          >
            <Mic size={34} />
          </motion.button>
          <motion.button
            type="button"
            className={`play-btn ${busy === "play" ? "on" : ""}`}
            aria-label={busy === "play" ? "Стоп" : "Слушать"}
            onClick={play}
            disabled={!s}
            whileTap={{ scale: 0.92 }}
          >
            {busy === "play" ? <Square size={20} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
          </motion.button>
        </div>
        <div className="chip-row">
          <button type="button" className={`chip-btn ${busy === "echo" ? "on" : ""}`} onClick={echo} disabled={!s}>
            <Repeat size={16} /> {busy === "echo" ? "Стоп" : "Эхо ×3"}
          </button>
          {busy === "build" && (
            <button type="button" className="chip-btn on" onClick={buildUp}>
              <Blocks size={16} /> Стоп
            </button>
          )}
        </div>
        {!isLast && (
          <button type="button" className="swipe-hint" onClick={onNext}>
            <ChevronUp size={14} /> Свайп вверх — следующая фраза
          </button>
        )}
      </div>

      {/* Recording */}
      <AnimatePresence>
        {recording && s && (
          <motion.div className="rec-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span className="rec-badge">
              <i /> Запись · 0:{String(recSecs).padStart(2, "0")}
            </span>
            <p className="rec-phrase">{s.text}</p>
            <div className="live-wave" aria-hidden>
              {bars.map((h, i) => (
                <i key={i} style={{ height: h }} />
              ))}
            </div>
            <div style={{ display: "grid", justifyItems: "center", gap: 12 }}>
              <motion.button type="button" className="stop-big" aria-label="Остановить запись" onClick={stopRecording} whileTap={{ scale: 0.92 }}>
                <Square size={28} fill="currentColor" />
              </motion.button>
              <span className="tip-line">Нажми, когда договоришь</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result */}
      <AnimatePresence>
        {showResult && (
          <motion.div className="result-layer" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" className="icon-btn" aria-label="Закрыть результат" onClick={() => setShowResult(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="result-inner">
              <div className="ring">
                <svg width="200" height="200" viewBox="0 0 200 200" fill="none" aria-hidden>
                  <circle cx="100" cy="100" r="86" stroke="var(--line)" strokeWidth="16" />
                  <motion.circle
                    cx="100"
                    cy="100"
                    r="86"
                    stroke={ringColor}
                    strokeWidth="16"
                    strokeLinecap="round"
                    transform="rotate(-90 100 100)"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: score ? score.total / 100 : 0.08 }}
                    transition={{ duration: score ? 1.1 : 0.4, ease: "easeOut" }}
                  />
                </svg>
                <div className="num">
                  {scoring ? (
                    <span>Слушаю…</span>
                  ) : (
                    <>
                      <b>{shown}</b>
                      <span>из 100</span>
                    </>
                  )}
                </div>
              </div>

              {score && (
                <>
                  <p className="result-verdict">{score.verdict}</p>
                  <div className="score-words" style={{ justifyContent: "center" }}>
                    {score.words.map((w, i) => (
                      <span key={i} className={`sw ${w.verdict === "ok" ? "v-ok" : w.verdict === "missed" ? "v-miss" : "v-warn"}`}>
                        {w.word}
                      </span>
                    ))}
                  </div>
                  <div className="stat-grid">
                    <div className="stat">
                      <b>{score.intelligibility}</b>
                      <span>Понятность</span>
                    </div>
                    <div className="stat">
                      <b>{score.rhythm}</b>
                      <span>Ритм</span>
                    </div>
                    <div className="stat">
                      <b>{score.pace}</b>
                      <span>Темп</span>
                    </div>
                  </div>
                  <button type="button" className="text-btn" onClick={() => setMore(!more)}>
                    {more ? "Скрыть подробности" : "Подробнее"}
                  </button>
                  {more && (
                    <>
                      <ul className="advice-list">
                        {score.advice.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                      <p className="tip-line">Распознано: «{score.heard || "…"}»</p>
                      {modelUrl && myTake && (
                        <div style={{ width: "100%" }}>
                          <Waveform modelUrl={modelUrl} userUrl={myTake.url} />
                        </div>
                      )}
                    </>
                  )}
                  <div className="chip-row">
                    <button type="button" className={`chip-btn ${busy === "compare" ? "on" : ""}`} onClick={compare}>
                      <Play size={16} /> {busy === "compare" ? "Стоп" : "Модель, потом я"}
                    </button>
                    {canSend && (
                      <button type="button" className="chip-btn" onClick={send} disabled={sendState !== "idle"}>
                        <Send size={16} /> {sendState === "sent" ? "Отправлено" : sendState === "sending" ? "Отправляю…" : "Преподавателю"}
                      </button>
                    )}
                  </div>
                  {fromLibrary && (
                    <div className="chip-row">
                      {reviewed === null ? (
                        <>
                          <button type="button" className="chip-btn" onClick={() => (review(s!.text, true), setReviewed(true))}>
                            Запомнил
                          </button>
                          <button type="button" className="chip-btn" onClick={() => (review(s!.text, false), setReviewed(false))}>
                            Повторить завтра
                          </button>
                        </>
                      ) : (
                        <span className="tip-line">{reviewed ? "Покажу её снова позже." : "Вернётся завтра."}</span>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="result-actions">
                <button type="button" className="wide-btn light" onClick={() => setShowResult(false)}>
                  Ещё раз
                </button>
                <button type="button" className="wide-btn" onClick={() => (setShowResult(false), isLast ? onClose() : onNext())}>
                  {isLast ? "Готово" : "Дальше →"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions sheet */}
      <Sheet open={sheet === "actions"} onOpenChange={(v) => setSheet(v ? "actions" : null)} title="Эта фраза">
        <div className="sheet-tiles">
          <button type="button" className="sheet-tile" onClick={() => setSheet("details")}>
            <Search size={22} /> Полный разбор
          </button>
          <button type="button" className="sheet-tile" onClick={openWords}>
            <BookOpen size={22} /> Каждое слово
          </button>
          <button type="button" className="sheet-tile" onClick={() => (setSheet(null), buildUp())}>
            <Blocks size={22} /> По кусочкам
          </button>
          <button type="button" className={`sheet-tile ${saved ? "on" : ""}`} onClick={() => s && toggleSave(s)}>
            {saved ? <BookmarkCheck size={22} /> : <Bookmark size={22} />} {saved ? "Сохранено" : "Сохранить"}
          </button>
          <button type="button" className="sheet-tile" onClick={makeReel} disabled={!!reel && !reel.done}>
            <Video size={22} /> Видео для Reels
          </button>
          <button type="button" className="sheet-tile" onClick={() => (setSheet(null), echo())}>
            <Repeat size={22} /> Эхо ×3
          </button>
        </div>
        <p className="sheet-sec">Голос</p>
        <div className="voices">
          {VOICES.map((v) => (
            <button key={v.id} type="button" className={`voice ${voice === v.id ? "on" : ""}`} onClick={() => setSettings({ voice: v.id })} aria-pressed={voice === v.id}>
              <b>{v.name}</b>
              <span>{v.note}</span>
            </button>
          ))}
        </div>
        <p className="sheet-sec">Скорость</p>
        <div className="seg2" role="group" aria-label="Скорость">
          {SPEEDS.map((sp) => (
            <button key={sp.id} type="button" className={speed.id === sp.id ? "on" : ""} onClick={() => setSpeed(sp)}>
              {sp.label}
            </button>
          ))}
        </div>
      </Sheet>

      {/* Details sheet */}
      <Sheet open={sheet === "details"} onOpenChange={(v) => setSheet(v ? "details" : null)} title="Полный разбор">
        {s && (
          <>
            <div className="d-row">
              <span className="d-label">Куски</span>
              <div className="chunks">
                {chunks.map((c, i) => (
                  <button key={i} type="button" className="chunk" onClick={() => playPiece(c, `chunk${i}`)}>
                    ▶ {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="d-row">
              <span className="d-label">Ударения</span>
              <div className="clear-text">
                {splitWords(s.clear).map((w, i) => (
                  <span key={i}>{isLoud(w) ? <b>{w}</b> : w} </span>
                ))}
              </div>
            </div>
            <div className="d-row">
              <span className="d-label">Ритм</span>
              <div className="beats">
                {splitWords(s.rhythm).map((w, wi) => (
                  <span key={wi} className="beat-word">
                    {w
                      .split("-")
                      .filter(Boolean)
                      .map((syl, si) => {
                        const L = syl.replace(/[^A-Za-z]/g, "");
                        const loud = L.length > 1 && L === L.toUpperCase();
                        return (
                          <span key={si} className={`beat ${loud ? "loud" : ""}`}>
                            <i className="dot" />
                            <span>{syl}</span>
                          </span>
                        );
                      })}
                  </span>
                ))}
              </div>
            </div>
            {s.blobs?.length > 0 && (
              <div className="d-row">
                <span className="d-label">Склейки</span>
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
            {cyrillic && Object.keys(s.cyrillic ?? {}).length > 0 && (
              <div className="d-row">
                <span className="d-label">Кириллица</span>
                <div className="cyr">
                  {Object.entries(s.cyrillic ?? {}).map(([k, v]) => (
                    <span key={k}>
                      {k} → <b>{v}</b>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {tips && s.ru_tip && <p className="tip-bubble">{s.ru_tip}</p>}
            {s.flags && s.flags.length > 0 && (
              <div className="flags">
                {s.flags.map((f, i) => (
                  <div key={i} className="flag">
                    {f}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Sheet>

      {/* Words sheet */}
      <Sheet open={sheet === "words"} onOpenChange={(v) => setSheet(v ? "words" : null)} title="Каждое слово">
        {wordsLoading && (
          <div className="skeleton">
            <i />
            <i />
            <i />
          </div>
        )}
        <div className="words">
          {wordData?.map((w, i) =>
            w.type === "function" ? (
              <div key={i} className="w-func">
                <span className="w-word">{w.word}</span>
                <span className="w-sound">{w.sound}</span>
                <span className="w-ru">{w.ru}</span>
                <span className="w-note">{w.note}</span>
              </div>
            ) : (
              <details key={i} className="w-content">
                <summary className="w-head">
                  <span className="w-word big">{w.word}</span>
                  <span className="w-sound">{w.sound}</span>
                  <span className="w-ru">{w.ru}</span>
                </summary>
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
                      <b>Этимология:</b> {w.etymology} {w.etymology_unsure && <span className="unsure">проверить</span>}
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
              </details>
            )
          )}
        </div>
      </Sheet>
    </div>
  );
}
