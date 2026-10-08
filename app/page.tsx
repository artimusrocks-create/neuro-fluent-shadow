"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUp,
  Bookmark,
  CalendarDays,
  ChartColumn,
  Ellipsis,
  House,
  LayoutGrid,
  Mic,
  Plus,
  RotateCcw,
  Search,
  Send,
  Square,
} from "lucide-react";
import Practice from "./Practice";
import Sheet, { Switch } from "./ui/Sheet";
import { ApiError, Me, Sentence, fetchBreakdown, fetchMe, fetchScoreWords, getPasscode, recAudioUrl, saveProgressRemote, setPasscode } from "@/lib/client";
import { PACKS, Pack, packGradient, phraseOfTheDay } from "@/lib/packs";
import { BADGES, getState, isDue, mergeRemote, missionProgress, onBadges, onChange, setSettings, streak, track, useProgress } from "@/lib/progress";
import { DEFAULT_VOICE, VOICES } from "@/lib/voices";

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

type View = "home" | "packs" | "library" | "progress" | "assigned";
type Item = { text: string; s?: Sentence; err?: string };
type Queue = { items: Item[]; index: number; label: string; fromLibrary?: boolean } | null;

export default function Page() {
  const progress = useProgress();
  const settings = progress.settings;
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<View>("home");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tip, setTip] = useState(0);
  const [menu, setMenu] = useState(false);
  const [queue, setQueue] = useState<Queue>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [code, setCode] = useState("");
  const [toasts, setToasts] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [dictating, setDictating] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const loadingRef = useRef<Set<string>>(new Set());

  // ---------- Who am I, progress sync ----------
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
    const c = url.searchParams.get("code");
    if (c) {
      setPasscode(c.trim());
      url.searchParams.delete("code");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    setCode(getPasscode());
    loadMe();
    setTip(Math.floor(Math.random() * TIPS.length));
    const tg = (window as unknown as { Telegram?: { WebApp?: { ready: () => void; expand: () => void } } }).Telegram?.WebApp;
    tg?.ready();
    tg?.expand();
    return onBadges((ids) => {
      setToasts((t) => [...t, ...ids]);
      setTimeout(() => setToasts((t) => t.slice(ids.length)), 4000);
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
    async (q: NonNullable<Queue>, i: number) => {
      const it = q.items[i];
      if (!it || it.s || it.err || loadingRef.current.has(it.text)) return;
      loadingRef.current.add(it.text);
      try {
        const d = await fetchBreakdown(it.text, settings.cyrillic);
        track("breakdowns");
        setQueue((cur) => {
          if (!cur) return cur;
          const idx = cur.items.findIndex((x) => x.text === it.text && !x.s);
          if (idx < 0) return cur;
          const items = [...cur.items];
          items.splice(idx, 1, ...d.sentences.map((s, k) => ({ text: k === 0 ? it.text : s.text, s })));
          return { ...cur, items };
        });
      } catch (e) {
        if (e instanceof ApiError && e.kind === "passcode") setMenu(true);
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
    // Prefetch the next phrase for people with a full account (demo has a small daily limit).
    if (me && me.role !== "demo") ensureLoaded(queue, queue.index + 1);
  }, [queue, ensureLoaded, me]);

  function startQueue(items: Item[], label: string, fromLibrary = false, index = 0) {
    if (!items.length) return;
    setMenu(false);
    setQueue({ items, index, label, fromLibrary });
  }
  const startTexts = (texts: string[], label: string, index = 0) => startQueue(texts.map((t) => ({ text: t })), label, false, index);
  const startPack = (p: Pack) => startTexts(p.phrases, p.title);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    setError("");
    try {
      const d = await fetchBreakdown(t, settings.cyrillic);
      track("breakdowns");
      startQueue(
        d.sentences.map((s) => ({ text: s.text, s })),
        "Твой текст"
      );
    } catch (err) {
      if (err instanceof ApiError && err.kind === "passcode") setMenu(true);
      setError(err instanceof Error ? err.message : "Не получилось. Попробуй ещё раз.");
    } finally {
      setBusy(false);
    }
  }

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

  const potd = phraseOfTheDay();
  const due = progress.library.filter(isDue);
  const mission = missionProgress(progress);
  const st = streak(progress);
  const feedback = me?.recs.filter((r) => r.feedback).length ?? 0;
  const voice = settings.voice || DEFAULT_VOICE;
  const filteredPacks = PACKS.filter((p) => !search.trim() || (p.title + " " + p.blurb + " " + p.phrases.join(" ")).toLowerCase().includes(search.toLowerCase()));
  const sortedLib = [...progress.library].sort((a, b) => (isDue(a) === isDue(b) ? a.due.localeCompare(b.due) : isDue(a) ? -1 : 1));
  const current = queue?.items[queue.index];

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
              <h1>Что будем повторять сегодня?</h1>
              <form className="prompt" onSubmit={submit}>
                <span className="orb lg" aria-hidden />
                <button type="button" className="ghost" aria-label="Наборы фраз" onClick={() => go("packs")}>
                  <Plus size={22} />
                </button>
                <input aria-label="Фраза на английском" placeholder={dictating ? "Говори…" : "Фраза на английском…"} value={text} onChange={(e) => setText(e.target.value)} />
                <button type="button" className={`ghost ${dictating ? "rec" : ""}`} aria-label={dictating ? "Остановить" : "Сказать голосом"} onClick={dictate}>
                  {dictating ? <Square size={18} fill="currentColor" /> : <Mic size={20} />}
                </button>
                <button type="submit" className="send" aria-label="Разобрать" disabled={!text.trim() || busy}>
                  <ArrowUp size={22} />
                </button>
              </form>
              {busy && (
                <p className="loading-line">
                  <span className="dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  Разбираю фразу…
                </p>
              )}
              {error && <p className="error-line">{error}</p>}
              <button type="button" className="tip-line" onClick={() => setTip((tip + 1) % TIPS.length)}>
                <b>Совет дня:</b> {TIPS[tip]}
              </button>

              <nav className="tiles" aria-label="Разделы">
                <button type="button" className="tile" onClick={() => startTexts([potd.text], "Фраза дня")}>
                  <span className="tile-ic">
                    <CalendarDays size={22} />
                  </span>
                  Фраза дня
                </button>
                <button type="button" className="tile" onClick={() => go("packs")}>
                  <span className="tile-ic">
                    <LayoutGrid size={22} />
                  </span>
                  Наборы
                </button>
                <button type="button" className="tile" onClick={() => go("library")}>
                  <span className="tile-ic">
                    <Bookmark size={22} />
                  </span>
                  Мои фразы
                </button>
                <button type="button" className="tile" onClick={() => (due.length ? startQueue(due.map((x) => ({ text: x.s.text, s: x.s })), "Повторение", true) : go("library"))}>
                  <span className="tile-ic">
                    <RotateCcw size={22} />
                  </span>
                  Повторить
                  {mounted && due.length > 0 && <span className="count">{due.length}</span>}
                </button>
                <button type="button" className="tile" onClick={() => go("progress")}>
                  <span className="tile-ic">
                    <ChartColumn size={22} />
                  </span>
                  Прогресс
                </button>
                {me?.role === "student" && (
                  <button type="button" className="tile" onClick={() => (go("assigned"), loadMe())}>
                    <span className="tile-ic">
                      <Send size={22} />
                    </span>
                    От препода
                    {feedback > 0 && <span className="count">{feedback}</span>}
                  </button>
                )}
                <button type="button" className="tile" onClick={() => setMenu(true)}>
                  <span className="tile-ic">
                    <Ellipsis size={22} />
                  </span>
                  Ещё
                </button>
              </nav>

              <button type="button" className="banner" style={{ background: packGradient(PACKS[0]) }} onClick={() => startPack(PACKS[0])}>
                <h3>Набор: «{PACKS[0].title}»</h3>
                <p>{PACKS[0].blurb}. Восемь фраз, около пяти минут.</p>
                <span className="cta">Начать</span>
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
                  <motion.button
                    key={p.id}
                    type="button"
                    className="pack-card"
                    style={{ background: packGradient(p) }}
                    onClick={() => startPack(p)}
                    whileHover={{ y: -3 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className="bubble">{p.sample}</span>
                    <span className="bubble fast">{p.fast}</span>
                    <span className="label">
                      <b>{p.title}</b>
                      <span>
                        {p.phrases.length} фраз · {p.blurb}
                      </span>
                    </span>
                  </motion.button>
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
          <Switch label="Сначала на слух (текст скрыт)" checked={settings.hide} onChange={(v) => setSettings({ hide: v })} />
          <Switch label="Подсказки и советы" checked={settings.tips} onChange={(v) => setSettings({ tips: v })} />
          <Switch label="Кириллица в разборе" checked={settings.cyrillic} onChange={(v) => setSettings({ cyrillic: v })} />
          <label className="range-row">
            Пауза в «Эхо» ×{settings.gap.toFixed(1)}
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
        {me?.role === "demo" && (
          <p className="tip-line" style={{ textAlign: "left" }}>
            Демо: {me.limits?.breakdown ?? 5} своих фраз в день. Наборы — без ограничений.
          </p>
        )}
        <form
          className="prompt"
          style={{ boxShadow: "none" }}
          onSubmit={(e) => {
            e.preventDefault();
            setPasscode(code.trim());
            setError("");
            loadMe();
            setMenu(false);
          }}
        >
          <input aria-label="Код доступа" placeholder="Код от преподавателя" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
          <button type="submit" className="send" aria-label="Сохранить код">
            <ArrowUp size={20} />
          </button>
        </form>
        {me?.role === "teacher" && (
          <a className="wide-btn light" href="/teacher">
            Кабинет преподавателя
          </a>
        )}
      </Sheet>

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
              key={`${queue.index}-${current?.text}-${!!current?.s}`}
              item={current?.s ?? null}
              loading={!current?.s}
              loadError={current?.err ?? ""}
              label={queue.label}
              index={queue.index}
              total={queue.items.length}
              fromLibrary={queue.fromLibrary}
              canSend={me?.role === "student"}
              onPrev={() => setQueue((q) => (q ? { ...q, index: Math.max(0, q.index - 1) } : q))}
              onNext={() => setQueue((q) => (q ? { ...q, index: Math.min(q.items.length - 1, q.index + 1) } : q))}
              onClose={() => setQueue(null)}
              onRetry={() => setQueue((q) => (q ? { ...q, items: q.items.map((x, i) => (i === q.index ? { text: x.text } : x)) } : q))}
              onPasscodeNeeded={() => setMenu(true)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="toasts" aria-live="polite">
        {toasts.map((id, i) => {
          const b = BADGES.find((x) => x.id === id);
          return b ? (
            <motion.div key={`${id}-${i}`} className="toast" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
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
