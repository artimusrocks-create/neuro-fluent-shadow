"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUp,
  Bookmark,
  ChartColumn,
  Ellipsis,
  House,
  LayoutGrid,
  Mic,
  Play,
  RotateCcw,
  KeyRound,
  Search,
  Send,
  Sparkles,
  Square,
} from "lucide-react";
import Practice from "./Practice";
import ProSheet, { ProReason } from "./ProSheet";
import Sheet, { Switch } from "./ui/Sheet";
import {
  ApiError,
  Me,
  Sentence,
  checkClaim,
  fetchBreakdown,
  fetchMe,
  isBaked,
  isStoreApp,
  fetchScoreWords,
  getPasscode,
  markStoreApp,
  pendingClaim,
  recAudioUrl,
  rememberUtm,
  saveProgressRemote,
  setPasscode,
  setPendingClaim,
  telegramApp,
  trackEvent,
  trackOnce,
  unlockAudio,
} from "@/lib/client";
import { PACKS, Pack, phraseOfTheDay, todaysSession } from "@/lib/packs";
import { MAX_ITEMS, splitSentences } from "@/lib/sentences";
import { BADGES, getState, isDue, mergeRemote, missionProgress, onBadges, onChange, setSettings, streak, track, useProgress } from "@/lib/progress";
import { VOICES, pickVoice } from "@/lib/voices";

// The only place for jokes: «Совет дня».
const TIPS = [
  "американцы не говорят «going to». Они говорят «гана». Учебник об этом стыдливо молчит.",
  "ты произносишь каждое слово одинаково громко. Поэтому и звучишь как навигатор.",
  "«I am fine, thank you, and you?» так не отвечает никто. Даже автоответчик.",
  "грамматику ты знаешь лучше американца. Беда в том, что он её почти не произносит.",
  "сериал с субтитрами — это не шэдоуинг. Это сериал с субтитрами.",
  "маленькие слова надо глотать. Это не лень, это американский ритм.",
  "пассивный словарь — пять тысяч слов, на слух — пятьдесят. Поэтому мы здесь.",
  "старательное «зе» с языком между зубов — это прекрасно. Только носитель его проглатывает.",
  "пять лет Duolingo, а на созвоне всё равно «sorry, can you repeat». Исправляем.",
];

// Tap-to-try examples under the text box. Pack phrases: their breakdown and audio are ready, so they open instantly.
const EXAMPLES = ["Can I get a coffee to go?", "Sorry, you're on mute.", "You gotta be kidding me."];
const MAX_PASTE = 12000;

/** A topic card: icon, name, and one phrase with how it really sounds. */
function PackCard({ p, onClick }: { p: Pack; onClick: () => void }) {
  return (
    <motion.button type="button" className="pcard" onClick={onClick} whileTap={{ scale: 0.98 }}>
      <span className="pcard-top">
        <span className="pcard-ic" style={{ background: p.colors[0] }} aria-hidden>
          {p.emoji}
        </span>
        <span className="pcard-title">
          <b>{p.title}</b>
          <small>
            {p.phrases.length} фраз · {p.blurb}
          </small>
        </span>
      </span>
      <span className="pcard-ex">
        <span className="pcard-say">{p.sample}</span>
        <span className="pcard-fast">
          <span aria-hidden>🗣 </span>
          {p.fast}
        </span>
      </span>
    </motion.button>
  );
}

/** 1 фраза, 2 фразы, 5 фраз (and the same for дни). */
const plural = (n: number, one: string, few: string, many: string) => {
  const t = n % 10, h = n % 100;
  return t === 1 && h !== 11 ? one : t >= 2 && t <= 4 && (h < 12 || h > 14) ? few : many;
};

/** Compact topic tile for the first screen: all eight topics fit on a phone without scrolling forever. */
function PackTile({ p, onClick }: { p: Pack; onClick: () => void }) {
  return (
    <button type="button" className="ptile" onClick={onClick}>
      <span className="pcard-ic sm" style={{ background: p.colors[0] }} aria-hidden>
        {p.emoji}
      </span>
      <span className="ptile-t">
        <b>{p.title}</b>
        <small>{p.phrases.length} фраз</small>
      </span>
    </button>
  );
}

type View = "home" | "packs" | "library" | "progress" | "assigned";
type Item = { text: string; s?: Sentence; err?: string; pf?: boolean }; // pf: a quiet load-ahead failed, load normally on arrival
type Queue = { items: Item[]; index: number; label: string; fromLibrary?: boolean; own?: boolean } | null;
type Done = { label: string; count: number; texts: string[]; fromLibrary?: boolean };

export default function Page() {
  const progress = useProgress();
  const settings = progress.settings;
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<View>("home");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [tip, setTip] = useState(0);
  const [menu, setMenu] = useState(false);
  const [queue, setQueue] = useState<Queue>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [code, setCode] = useState("");
  const [toasts, setToasts] = useState<string[]>([]);
  const [done, setDone] = useState<Done | null>(null);
  const [search, setSearch] = useState("");
  const [dictating, setDictating] = useState(false);
  const [pro, setPro] = useState<{ reason: ProReason; waiting?: boolean } | null>(null);
  const [store, setStore] = useState(false);
  const [notice, setNotice] = useState("");
  const meRef = useRef<Me | null>(null);
  meRef.current = me;
  const recRef = useRef<MediaRecorder | null>(null);
  const loadingRef = useRef<Set<string>>(new Set());
  const boxRef = useRef<HTMLTextAreaElement | null>(null);

  // ---------- Who am I, progress sync ----------
  const refreshFree = () => {
    if (!me || me.role === "demo") loadMe();
  };
  async function loadMe() {
    try {
      const m = await fetchMe();
      setMe(m);
      if (m.role === "student" && m.progress) mergeRemote(m.progress as never);
    } catch (e) {
      if (e instanceof ApiError && e.kind === "passcode") {
        setMe(null);
        if (getPasscode()) setError("Код не подошёл. Попроси у преподавателя личную ссылку.");
      }
    }
  }

  function openPro(reason: ProReason) {
    if (reason === "limit") {
      trackEvent("limit");
      // Pro and the teacher's students have their own (bigger) limits: no point offering them Pro.
      if (meRef.current && meRef.current.plan !== "free") return;
    }
    setPro({ reason });
  }

  async function activated(c: string) {
    setPasscode(c);
    setCode(c);
    setPro(null);
    setNotice("Pro включён 🎉 Ссылка с кодом пришла в Telegram или на почту — сохрани её.");
    setTimeout(() => setNotice(""), 9000);
    await loadMe();
  }

  /** A payment may have gone through while the app was closed: check once, quietly. */
  async function quietClaim() {
    const nonce = pendingClaim();
    if (!nonce) return;
    const c = await checkClaim(nonce);
    if (c) {
      setPendingClaim(null);
      trackEvent("pro_activated");
      if (c.code) activated(c.code);
      else setNotice("Оплата прошла, Pro продлён. Личная ссылка пришла на почту.");
    }
  }

  useEffect(() => {
    if (me?.role !== "student") return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = onChange(() => {
      clearTimeout(t);
      t = setTimeout(() => saveProgressRemote(getState()).catch(() => {}), 2500);
    });
    return () => {
      off();
      clearTimeout(t);
    };
  }, [me?.role]);

  useEffect(() => {
    setMounted(true);
    const url = new URL(window.location.href);
    rememberUtm(url);
    const c = url.searchParams.get("code");
    if (c) setPasscode(c.trim());
    // Opened from the Android app (Google Play): hide prices and payment links there.
    if (url.searchParams.get("app") === "android") markStoreApp();
    setStore(isStoreApp());
    if (isStoreApp()) trackOnce("android");
    const paid = url.searchParams.get("paid");
    const deep = url.searchParams.get("p");
    const wantPro = url.searchParams.get("pro");
    for (const k of ["code", "app", "paid", "p", "pro", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) url.searchParams.delete(k);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    setCode(getPasscode());
    loadMe();
    setTip(Math.floor(Math.random() * TIPS.length));
    trackOnce("visit");
    const tg = (window as unknown as { Telegram?: { WebApp?: { ready: () => void; expand: () => void } } }).Telegram?.WebApp;
    tg?.ready();
    tg?.expand();
    if (telegramApp()) trackOnce("telegram");
    // Came back from the card payment page, or opened a "?pro=1" link.
    if (paid === "1" && pendingClaim()) setPro({ reason: "menu", waiting: true });
    else if (wantPro && !isStoreApp()) setPro({ reason: "menu" });
    else if (pendingClaim()) quietClaim();
    // A link to one phrase: /?p=Can%20I%20get%20a%20coffee%20to%20go%3F
    // A link to one phrase (Telegram channel, a phrase page) continues with the rest of its topic.
    const d = deep === "today" ? phraseOfTheDay().text : deep?.trim().slice(0, 400);
    const pack = d ? PACKS.find((p) => p.phrases.includes(d)) : undefined;
    if (d && pack) setQueue({ items: pack.phrases.map((t) => ({ text: t })), index: pack.phrases.indexOf(d), label: pack.title });
    else if (d) setQueue({ items: [{ text: d }], index: 0, label: "Фраза" });
    return onBadges((ids) => {
      setToasts((t) => [...t, ...ids]);
      setTimeout(() => setToasts((t) => t.slice(ids.length)), 2500);
    });
  }, []);

  // Theme
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "system") delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
  }, [settings.theme]);

  // ---------- Practice queue ----------
  const ensureLoaded = useCallback(
    // prefetch: loading ahead quietly. If it fails (e.g. today's free phrases are used up), nothing pops up now;
    // the normal load shows it when the person gets to that sentence.
    async (q: NonNullable<Queue>, i: number, prefetch = false) => {
      const it = q.items[i];
      if (!it || it.s || it.err || (prefetch && it.pf) || loadingRef.current.has(it.text)) return;
      loadingRef.current.add(it.text);
      try {
        const d = await fetchBreakdown(it.text, settings.cyrillic);
        track("breakdowns");
        refreshFree();
        setQueue((cur) => {
          if (!cur) return cur;
          const idx = cur.items.findIndex((x) => x.text === it.text && !x.s);
          if (idx < 0) return cur;
          const items = [...cur.items];
          items.splice(idx, 1, ...d.sentences.map((s, k) => ({ text: k === 0 ? it.text : s.text, s })));
          return { ...cur, items };
        });
      } catch (e) {
        if (prefetch) {
          setQueue((cur) => (cur ? { ...cur, items: cur.items.map((x) => (x.text === it.text ? { ...x, pf: true } : x)) } : cur));
          return;
        }
        if (e instanceof ApiError && e.kind === "limit") openPro("limit");
        const msg = e instanceof Error ? e.message : "Не получилось загрузить фразу.";
        setQueue((cur) => (cur ? { ...cur, items: cur.items.map((x) => (x.text === it.text ? { ...x, err: msg } : x)) } : cur));
      } finally {
        loadingRef.current.delete(it.text);
      }
    },
    [settings.cyrillic]
  );

  useEffect(() => {
    if (!queue) return;
    ensureLoaded(queue, queue.index);
    // Prefetch the next phrase: always for baked pack phrases, live ones only for full accounts.
    const next = queue.items[queue.index + 1];
    if (next && (isBaked(next.text) || queue.own || (me && me.role !== "demo"))) ensureLoaded(queue, queue.index + 1, true);
  }, [queue, ensureLoaded, me]);

  function startQueue(items: Item[], label: string, fromLibrary = false, index = 0, own = false) {
    if (!items.length) return;
    unlockAudio(); // inside the tap: lets the first phrase play by itself, even on iPhone
    setMenu(false);
    setDone(null);
    setQueue({ items, index, label, fromLibrary, own });
  }
  // The last phrase is done: close practice and show what's next.
  function finish() {
    if (!queue) return;
    setDone({ label: queue.label, count: queue.items.length, texts: queue.items.map((x) => x.text), fromLibrary: queue.fromLibrary });
    setQueue(null);
  }
  const startTexts = (texts: string[], label: string, index = 0) => startQueue(texts.map((t) => ({ text: t })), label, false, index);
  const startPack = (p: Pack) => (trackEvent("pack"), startTexts(p.phrases, p.title));
  function startToday() {
    const t = todaysSession();
    trackEvent("start_today");
    startTexts(t.texts, t.pack.title);
  }
  function tryExample(x: string) {
    setText(x);
    trackEvent("example");
    startTexts([x], "Пример");
  }

  // Opens at once: one sentence per step, the voice plays right away and each breakdown fills in while you listen.
  function submit(e?: FormEvent) {
    e?.preventDefault();
    const items = splitSentences(text);
    if (!items.length) return;
    setError("");
    trackEvent(items.length > 1 ? "text" : "phrase");
    unlockAudio();
    startQueue(
      items.slice(0, MAX_ITEMS).map((t) => ({ text: t })),
      items.length > 1 ? "Твой текст" : "Твоя фраза",
      false,
      0,
      true
    );
    if (items.length > MAX_ITEMS) {
      setNotice(`Взял первые ${MAX_ITEMS} предложений. Остальное вставь потом отдельно.`);
      setTimeout(() => setNotice(""), 9000);
    }
  }

  // The text box grows with what's pasted into it (up to a few lines, then it scrolls).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [text, view]);

  // Dictation: say the phrase instead of typing it.
  async function dictate() {
    if (dictating) {
      recRef.current?.stop();
      return;
    }
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const parts: BlobPart[] = [];
      rec.ondataavailable = (e) => parts.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        setDictating(false);
        try {
          const r = await fetchScoreWords(new Blob(parts, { type: rec.mimeType || "audio/webm" }));
          if (r.text.trim()) setText(r.text.trim());
          else setError("Не расслышал. Попробуй ещё раз.");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Не получилось распознать.");
        }
      };
      recRef.current = rec;
      rec.start();
      setDictating(true);
    } catch {
      setError("Нет доступа к микрофону.");
    }
  }

  const go = (v: View) => {
    setMenu(false);
    setView(v);
    window.scrollTo({ top: 0 });
  };

  const due = progress.library.filter(isDue);
  const mission = missionProgress(progress);
  const st = streak(progress);
  const feedback = me?.recs.filter((r) => r.feedback).length ?? 0;
  const voice = pickVoice(settings.voice);
  const filteredPacks = PACKS.filter((p) => !search.trim() || (p.title + " " + p.blurb + " " + p.phrases.join(" ")).toLowerCase().includes(search.toLowerCase()));
  const sortedLib = [...progress.library].sort((a, b) => (isDue(a) === isDue(b) ? a.due.localeCompare(b.due) : isDue(a) ? -1 : 1));
  const current = queue?.items[queue.index];
  // A topic is playing (a pack): the top bar can switch topics like a playlist.
  const topicAt = queue && !queue.fromLibrary && !queue.own ? PACKS.findIndex((p) => p.title === queue.label) : -1;

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="logo" onClick={() => go("home")}>
          <span className="orb" aria-hidden /> Neuro-Fluent Shadow
        </button>
        <div className="top-right">
          {mounted && st > 0 && <span className="pill-link desk-only">🔥 {st}</span>}
          <button type="button" className="pill-link desk-only" onClick={() => go("packs")}>
            Наборы
          </button>
          <button type="button" className="pill-link desk-only" onClick={() => go("library")}>
            Мои фразы {mounted && due.length > 0 && <span className="count">{due.length}</span>}
          </button>
          <button type="button" className="pill-link desk-only" onClick={() => go("progress")}>
            Прогресс
          </button>
          {me?.plan === "free" && !store && (
            <button type="button" className="pill-link pro-pill" onClick={() => openPro("menu")}>
              <Sparkles size={16} />
              Pro
            </button>
          )}
          <button type="button" className="icon-btn" aria-label="Меню и настройки" onClick={() => setMenu(true)}>
            <Ellipsis size={20} />
            {mounted && feedback > 0 && <span className="dot-badge" />}
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.main
          key={view}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className={`page ${view === "home" ? "home" : ""}`}
        >
          {view === "home" && (
            <>
              <section className="hero">
                <h1>Повторяй за носителем 5 минут в день</h1>
                <ol className="how" aria-label="Как это работает">
                  <li>
                    <span aria-hidden>🎧</span>Слушаешь носителя
                  </li>
                  <li>
                    <span aria-hidden>🗣</span>Повторяешь вслух
                  </li>
                  <li>
                    <span aria-hidden>🚀</span>Ставишь американский акцент
                  </li>
                </ol>
                <button type="button" className="start-big" onClick={startToday}>
                  <span className="start-ic" aria-hidden>
                    <Play size={22} fill="currentColor" />
                  </span>
                  <span className="start-txt">
                    <b>Начать тренировку</b>
                    <small>Готовые фразы · около 5 минут</small>
                  </span>
                </button>
                <div className="hero-links">
                  <button
                    type="button"
                    className="chip-link"
                    onClick={() => {
                      boxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                      boxRef.current?.focus({ preventScroll: true });
                    }}
                  >
                    ✍️ Вставить свой текст
                  </button>
                    {mounted && due.length > 0 && (
                      <button type="button" className="chip-link" onClick={() => startQueue(due.map((x) => ({ text: x.s.text, s: x.s })), "Повторение", true)}>
                        <RotateCcw size={15} /> Повторить сохранённые · {due.length}
                      </button>
                    )}
                    {me?.plan === "class" && (
                      <button type="button" className="chip-link" onClick={() => (go("assigned"), loadMe())}>
                        <Send size={15} /> От препода{feedback > 0 ? ` · ${feedback}` : ""}
                      </button>
                    )}
                </div>
              </section>

              {error && <p className="error-line">{error}</p>}
              {notice && <p className="pro-chip">{notice}</p>}
              {me?.plan === "pro" && me.pro?.until && (
                <p className="pro-chip">
                  <Sparkles size={14} /> Pro до {new Date(me.pro.until).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                </p>
              )}
              {me?.lapsed && !store && (
                <button type="button" className="pro-chip warn" onClick={() => openPro("lapsed")}>
                  Pro закончился — продлить →
                </button>
              )}
              {me?.free && !me.lapsed && (
                <p className="free-chip">
                  Бесплатно сегодня: осталось <b>{Math.max(0, me.free.limit - me.free.used)}</b> из {me.free.limit}
                  {!store && (
                    <>
                      {" · "}
                      <button type="button" className="inline-link" onClick={() => openPro("menu")}>
                        хочу больше
                      </button>
                    </>
                  )}
                </p>
              )}

              <section className="home-sec">
                <h2>Или выбери тему</h2>
                <div className="ptiles">
                  {PACKS.map((p) => (
                    <PackTile key={p.id} p={p} onClick={() => startPack(p)} />
                  ))}
                </div>
              </section>

              <section className="home-sec">
                <h2>Есть свой текст?</h2>
                <p className="sec-sub">
                  Вставь фразу или целый текст: письмо, статью, субтитры. Озвучу сразу и разберу по предложениям.
                  {me?.free && !store ? ` Бесплатно ${me.free.limit} предложений в день.` : ""}
                </p>
                <form className="prompt" onSubmit={submit}>
                  <textarea
                    ref={boxRef}
                    rows={1}
                    aria-label="Фраза на английском"
                    placeholder={dictating ? "Говори…" : "Вставь фразу или текст на английском…"}
                    value={text}
                    maxLength={MAX_PASTE}
                    enterKeyHint="send"
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
                    }}
                  />
                  <button type="button" className={`ghost ${dictating ? "rec" : ""}`} aria-label={dictating ? "Остановить" : "Сказать голосом"} onClick={dictate}>
                    {dictating ? <Square size={18} fill="currentColor" /> : <Mic size={20} />}
                  </button>
                  <button type="submit" className="send" aria-label="Разобрать" disabled={!text.trim()}>
                    <ArrowUp size={22} />
                  </button>
                </form>
                <div className="examples">
                  <span>Например:</span>
                  {EXAMPLES.map((x) => (
                    <button key={x} type="button" className="ex-chip" onClick={() => tryExample(x)}>
                      {x}
                    </button>
                  ))}
                </div>
              </section>

              <button type="button" className="tip-line" onClick={() => setTip((tip + 1) % TIPS.length)}>
                <b>Совет дня:</b> {TIPS[tip]}
              </button>
            </>
          )}

          {view === "packs" && (
            <>
              <div className="page-head">
                <h2>Наборы фраз</h2>
              </div>
              <label className="search">
                <Search size={20} />
                <input placeholder="Найти: кафе, аэропорт, свидание…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Поиск наборов" />
              </label>
              <div className="pack-grid">
                {filteredPacks.map((p) => (
                  <PackCard key={p.id} p={p} onClick={() => startPack(p)} />
                ))}
              </div>
            </>
          )}

          {view === "library" && mounted && (
            <>
              <div className="page-head">
                <h2>Мои фразы</h2>
              </div>
              {progress.library.length === 0 ? (
                <div className="empty-box">Пока пусто. В тренировке нажми ⋯ → «Сохранить», и фраза будет возвращаться через 1, 3, 7, 14 и 30 дней.</div>
              ) : (
                <>
                  {due.length > 0 && (
                    <button type="button" className="wide-btn" onClick={() => startQueue(due.map((x) => ({ text: x.s.text, s: x.s })), "Повторение", true)}>
                      <RotateCcw size={18} /> Повторить сегодня: {due.length}
                    </button>
                  )}
                  <ul className="list">
                    {sortedLib.map((x, i) => (
                      <li key={x.id}>
                        <button type="button" onClick={() => startQueue(sortedLib.map((y) => ({ text: y.s.text, s: y.s })), "Мои фразы", true, i)}>
                          <span className="grow">{x.s.text}</span>
                          <span className={`meta ${isDue(x) ? "due" : ""}`}>{isDue(x) ? "сегодня" : x.due.split("-").reverse().slice(0, 2).join(".")}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          {view === "progress" && mounted && (
            <>
              <div className="page-head">
                <h2>Прогресс</h2>
              </div>
              <div className="stat-grid">
                <div className="stat">
                  <b>🔥 {st}</b>
                  <span>дней подряд</span>
                </div>
                <div className="stat">
                  <b>{progress.best || "—"}</b>
                  <span>лучшая оценка</span>
                </div>
                <div className="stat">
                  <b>{progress.counts.breakdowns}</b>
                  <span>фраз разобрано</span>
                </div>
              </div>
              <div className="mission-card">
                <h3>Задача на сегодня {mission.complete ? "✓" : ""}</h3>
                <ul>
                  {mission.parts.map((p, i) => (
                    <li key={i} className={p.done >= p.of ? "done" : ""}>
                      <span>{p.done >= p.of ? "✓" : "○"}</span> {p.label}{" "}
                      <b>
                        {p.done}/{p.of}
                      </b>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="badge-grid">
                {BADGES.map((b) => {
                  const got = progress.badges.includes(b.id);
                  return (
                    <div key={b.id} className={`badge ${got ? "got" : ""}`}>
                      <span className="b-icon">{got ? b.icon : "🔒"}</span>
                      <b>{b.title}</b>
                      <span>{b.desc}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {view === "assigned" && me?.role === "student" && (
            <>
              <div className="page-head">
                <h2>От преподавателя</h2>
              </div>
              {me.assigned.length > 0 ? (
                <>
                  <button type="button" className="wide-btn" onClick={() => startTexts(me.assigned, "Задание")}>
                    Начать задание · {me.assigned.length}
                  </button>
                  <ul className="list">
                    {me.assigned.map((ph, i) => (
                      <li key={ph}>
                        <button type="button" onClick={() => startTexts(me.assigned, "Задание", i)}>
                          <span className="grow">{ph}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="empty-box">Пока ничего не задано.</div>
              )}
              {me.recs.length > 0 && (
                <ul className="my-recs">
                  {me.recs.map((r) => (
                    <li key={r.id}>
                      <div className="mr-top">
                        <b>{r.text}</b>
                        {r.score !== null && <span className="mr-score">{r.score}/100</span>}
                      </div>
                      <audio controls preload="none" src={recAudioUrl(r)} />
                      {r.feedback ? <div className="mr-fb">{r.feedback}</div> : <div className="muted">Ещё не прослушано.</div>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </motion.main>
      </AnimatePresence>

      <nav className="bottom-nav" aria-label="Навигация">
        <button type="button" className={view === "home" ? "on" : ""} onClick={() => go("home")}>
          <House size={22} /> Главная
        </button>
        <button type="button" className={view === "packs" ? "on" : ""} onClick={() => go("packs")}>
          <LayoutGrid size={22} /> Наборы
        </button>
        <button type="button" className={view === "library" ? "on" : ""} onClick={() => go("library")}>
          <Bookmark size={22} /> Мои фразы
          {mounted && due.length > 0 && <span className="count">{due.length}</span>}
        </button>
        <button type="button" className={view === "progress" ? "on" : ""} onClick={() => go("progress")}>
          <ChartColumn size={22} /> Прогресс
        </button>
      </nav>

      {/* Menu + settings */}
      <Sheet open={menu} onOpenChange={setMenu} title="Настройки">
        {me?.role === "student" && (
          <p className="tip-line" style={{ textAlign: "left" }}>
            Привет, {me.name}!
          </p>
        )}
        <p className="sheet-sec">Голос</p>
        <div className="voices">
          {VOICES.map((v) => (
            <button key={v.id} type="button" className={`voice ${voice === v.id ? "on" : ""}`} onClick={() => setSettings({ voice: v.id })} aria-pressed={voice === v.id}>
              <b>{v.name}</b>
              <span>{v.note}</span>
            </button>
          ))}
        </div>
        <p className="sheet-sec">Тренировка</p>
        <div className="rows">
          <Switch label="Звук сразу, когда открывается фраза" checked={settings.autoplay} onChange={(v) => setSettings({ autoplay: v })} />
          <Switch label="Сначала на слух (текст скрыт)" checked={settings.hide} onChange={(v) => setSettings({ hide: v })} />
          <Switch label="Подсказки и советы" checked={settings.tips} onChange={(v) => setSettings({ tips: v })} />
          <Switch label="Кириллица в разборе" checked={settings.cyrillic} onChange={(v) => setSettings({ cyrillic: v })} />
          <label className="range-row">
            Пауза для повтора ×{settings.gap.toFixed(1)}
            <input type="range" min={0.8} max={2.5} step={0.1} value={settings.gap} onChange={(e) => setSettings({ gap: Number(e.target.value) })} />
          </label>
        </div>
        <p className="sheet-sec">Тема</p>
        <div className="seg2" role="group" aria-label="Тема">
          {(
            [
              ["system", "Как в системе"],
              ["light", "Светлая"],
              ["dark", "Тёмная"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" className={settings.theme === k ? "on" : ""} onClick={() => setSettings({ theme: k })}>
              {l}
            </button>
          ))}
        </div>
        <p className="sheet-sec">Доступ</p>
        <div className="rows">
          {me?.plan === "pro" ? (
            <div className="row-item">
              Shadow Pro
              <span className="sub">до {me.pro?.until ? new Date(me.pro.until).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "—"}</span>
            </div>
          ) : me?.plan === "free" && !store ? (
            <button type="button" className="row-item" onClick={() => (setMenu(false), openPro("menu"))}>
              Shadow Pro: 25 фраз в день
              <Sparkles size={18} />
            </button>
          ) : null}
          <button type="button" className="row-item" onClick={() => (setMenu(false), setPro({ reason: "code" }))}>
            {store ? "Ввести код доступа" : "Код доступа или восстановить Pro"}
            <KeyRound size={18} />
          </button>
        </div>
        {me?.plan === "pro" && me.pro?.src === "stars" && <p className="muted small">Подписка через Telegram Stars. Отменить: Настройки Telegram → Telegram Stars → Подписки.</p>}
        {me?.role === "teacher" && (
          <a className="wide-btn light" href="/teacher">
            Кабинет преподавателя
          </a>
        )}
        <p className="legal-links">
          {!store && (
            <>
              <a href="/start">О приложении</a> · <a href="/terms">Условия</a> ·{" "}
            </>
          )}
          <a href="/phrases">Все фразы</a> · <a href="/privacy">Конфиденциальность</a> · <a href="/delete-data">Удалить данные</a> ·{" "}
          <a href={me?.free?.contact || "https://t.me/rawmeatsalad"} target="_blank" rel="noopener noreferrer">
            Написать Артёму
          </a>
        </p>
      </Sheet>

      {/* Pro offer: free limit reached, lapsed, or opened from the menu */}
      {/* The end of a topic: what you did, your streak, and what's next */}
      <Sheet open={!!done} onOpenChange={(v) => !v && setDone(null)} title="Готово 🎉">
        {done &&
          (() => {
            const at = PACKS.findIndex((p) => p.title === done.label);
            const next = at >= 0 ? PACKS[(at + 1) % PACKS.length] : todaysSession().pack;
            return (
              <div className="done-box">
                <p className="done-line">
                  «{done.label}»: {done.count} {plural(done.count, "фраза", "фразы", "фраз")} пройдено.{mounted && mission.complete ? " Задача на сегодня выполнена ✓" : ""}
                </p>
                {mounted && st > 0 && (
                  <p className="done-stats">
                    🔥 {st} {plural(st, "день", "дня", "дней")} подряд. Завтра эти фразы стоит повторить: так они останутся в голове.
                  </p>
                )}
                <button type="button" className="start-big" onClick={() => startPack(next)}>
                  <span className="start-ic" aria-hidden>
                    {next.emoji}
                  </span>
                  <span className="start-txt">
                    <b>Следующая тема</b>
                    <small>{next.title}</small>
                  </span>
                </button>
                <div className="hero-links">
                  <button type="button" className="chip-link" onClick={() => startQueue(done.texts.map((t) => ({ text: t })), done.label, !!done.fromLibrary)}>
                    <RotateCcw size={15} /> Пройти ещё раз
                  </button>
                  <button type="button" className="chip-link" onClick={() => (setDone(null), go("progress"))}>
                    <ChartColumn size={15} /> Мой прогресс
                  </button>
                </div>
              </div>
            );
          })()}
      </Sheet>

      <ProSheet
        open={!!pro}
        reason={pro?.reason ?? "menu"}
        startWaiting={!!pro?.waiting}
        me={me}
        onClose={() => {
          if (pro?.reason === "limit") setQueue(null);
          setPro(null);
        }}
        onActivated={activated}
      />

      {/* Practice */}
      <AnimatePresence>
        {queue && (
          <motion.div
            key="practice"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
          >
            <Practice
              key={`${queue.index}-${current?.text}`}
              text={current?.text ?? ""}
              item={current?.s ?? null}
              loading={!current?.s}
              loadError={current?.err ?? ""}
              label={queue.label}
              index={queue.index}
              total={queue.items.length}
              fromLibrary={queue.fromLibrary}
              canSend={me?.plan === "class"}
              onPrev={() => setQueue((q) => (q ? { ...q, index: Math.max(0, q.index - 1) } : q))}
              onNext={() => setQueue((q) => (q ? { ...q, index: Math.min(q.items.length - 1, q.index + 1) } : q))}
              onClose={() => setQueue(null)}
              onFinish={finish}
              onPrevTopic={topicAt >= 0 ? () => startPack(PACKS[(topicAt - 1 + PACKS.length) % PACKS.length]) : undefined}
              onNextTopic={topicAt >= 0 ? () => startPack(PACKS[(topicAt + 1) % PACKS.length]) : undefined}
              onRetry={() => setQueue((q) => (q ? { ...q, items: q.items.map((x, i) => (i === q.index ? { text: x.text } : x)) } : q))}
              onPasscodeNeeded={() => {}}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="toasts" aria-live="polite">
        {toasts.map((id, i) => {
          const b = BADGES.find((x) => x.id === id);
          return b ? (
            <motion.div key={`${id}-${i}`} className="toast" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
              <span>{b.icon}</span>
              <div>
                <b>{b.title}</b>
                <span>{b.desc}</span>
              </div>
            </motion.div>
          ) : null;
        })}
      </div>
    </div>
  );
}
