"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import SentenceCard from "./SentenceCard";
import { ApiError, Me, Sentence, fetchBreakdown, fetchMe, getPasscode, recAudioUrl, saveProgressRemote, setPasscode } from "@/lib/client";
import { PACKS, phraseOfTheDay } from "@/lib/packs";
import { BADGES, LibItem, getState, isDue, mergeRemote, missionProgress, onBadges, onChange, setSettings, streak, track, useProgress } from "@/lib/progress";

const EXAMPLE: Sentence[] = [
  {
    text: "I did start at the beginning with both of my foreign languages.",
    clear: "I DID START at the BEGINNING with BOTH of my FOREIGN LANGUAGES.",
    fast: "I DID stardathuh beginning wibothuhmy foreign languages.",
    rhythm: "I DID STAR-duh-thuh bi-GIN-ing wi-BOTH-uh-my FOR-in LANG-gwij-iz.",
    blobs: [
      { written: "start at the", blob: "stardathuh", rule: "Флэп (E) + Выпадение (C): T глотается перед th" },
      { written: "with both of my", blob: "wibothuhmy", rule: "Выпадение (C): th исчезает + Связка (D) + of → uh (A)" },
    ],
    chunks: ["I did start", "at the beginning", "with both of my foreign languages."],
    shadow_tip: "Бей по DID сильнее всего. А «at the» пусть просто прилипнет к «start», без паузы.",
    ru_tip: "th в «with» тут почти пропадает: «wi'both». Радуйся, одним мучением меньше.",
    flags: ["DID оставили громким: это эмфаза. Проглотишь его — и смысл уйдёт.", "«beginning» оставили чётким. Совсем разговорно будет «beginnin'»."],
    cyrillic: { stardathuh: "стардаза", wibothuhmy: "уибоузамай" },
  },
];

const QUIPS = [
  "«I am fine, thank you, and you?» В Америке так не отвечает никто. Даже автоответчик.",
  "Пять лет Duolingo, а на созвоне всё равно «sorry, can you repeat».",
  "Американцы не говорят «going to». Они говорят «гана». Учебник об этом стыдливо молчит.",
  "Ты произносишь каждое слово одинаково громко. Поэтому и звучишь как навигатор.",
  "Грамматику ты знаешь лучше американца. Беда в том, что он её почти не произносит.",
  "Пассивный словарь — пять тысяч слов. На слух понимаешь пятьдесят. Знакомо же?",
  "Письма тебе пишет ChatGPT. А на дейлике говорить всё равно тебе.",
  "Сериал с субтитрами — это не шэдоуинг. Это сериал с субтитрами.",
  "IELTS на 7.0, а «whatcha gonna do» всё ещё звучит как одно длинное заклинание.",
  "Твоё старательное «зе» с языком между зубов прекрасно. Только носитель его вообще проглатывает.",
  "«London is the capital of Great Britain» ты выучил в третьем классе. Пора дальше.",
  "Маленькие слова надо глотать. Это не лень, это американский ритм.",
];

const LOADING = [
  "Глотаем маленькие слова…",
  "Выкидываем «to», как это делают американцы…",
  "Учительница из 7 «Б» нервно курит…",
  "Склеиваем слова, которые школа учила говорить отдельно…",
  "Объясняем, куда делась буква T…",
];

type View = "main" | "packs" | "library" | "badges" | "teacher";

export default function Page() {
  const progress = useProgress();
  const [view, setView] = useState<View>("main");
  const [text, setText] = useState("");
  const [cyrillic, setCyrillic] = useState(false);
  const [ruTip, setRuTip] = useState(true);
  const [sentences, setSentences] = useState<Sentence[]>(EXAMPLE);
  const [isExample, setIsExample] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingLine, setLoadingLine] = useState(LOADING[0]);
  const [error, setError] = useState("");
  const [needPass, setNeedPass] = useState(false);
  const [pass, setPass] = useState("");
  const [quip, setQuip] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [libOpen, setLibOpen] = useState<LibItem | null>(null);
  const [toasts, setToasts] = useState<string[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const passRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function loadMe() {
    try {
      const m = await fetchMe();
      setMe(m);
      if (m.role === "student" && m.progress) mergeRemote(m.progress as never);
    } catch (e) {
      if (e instanceof ApiError && e.kind === "passcode") {
        setMe(null);
        if (getPasscode()) setError("Код не подошёл. Попроси у препода свою личную ссылку.");
      }
    }
  }

  // Keep a student's progress in sync with the server (debounced).
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
    // Personal link from the teacher: /?code=lena-7k3q
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (code) {
      setPasscode(code.trim());
      url.searchParams.delete("code");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    loadMe();
    setPass(getPasscode());
    setQuip(Math.floor(Math.random() * QUIPS.length));
    // Telegram Mini App: fit the screen when opened inside Telegram.
    const tg = (window as unknown as { Telegram?: { WebApp?: { ready: () => void; expand: () => void } } }).Telegram?.WebApp;
    tg?.ready();
    tg?.expand();
    return onBadges((ids) => {
      setToasts((t) => [...t, ...ids]);
      setTimeout(() => setToasts((t) => t.slice(ids.length)), 4500);
    });
  }, []);

  useEffect(() => {
    if (!loading) return;
    let i = 0;
    setLoadingLine(LOADING[0]);
    const id = setInterval(() => {
      i = (i + 1) % LOADING.length;
      setLoadingLine(LOADING[i]);
    }, 2600);
    return () => clearInterval(id);
  }, [loading]);

  function askPasscode() {
    setNeedPass(true);
    setTimeout(() => passRef.current?.focus(), 50);
  }

  async function breakdown(t: string) {
    if (!t.trim()) {
      setError("Сначала вставь фразу. Мысли мы пока не читаем.");
      return;
    }
    setView("main");
    setLoading(true);
    setError("");
    try {
      const d = await fetchBreakdown(t.trim(), cyrillic);
      setSentences(d.sentences);
      setIsExample(false);
      track("breakdowns");
    } catch (err) {
      if (err instanceof ApiError && err.kind === "passcode") {
        askPasscode();
        setError("Нужен пароль. Без него не пустим: кредиты на голос не бесконечные.");
      } else setError(err instanceof Error ? err.message : "Что-то сломалось. Попробуй ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    breakdown(text);
  }

  function pick(phrase: string) {
    setText(phrase);
    window.scrollTo({ top: 0, behavior: "smooth" });
    breakdown(phrase);
  }

  const potd = phraseOfTheDay();
  const mission = missionProgress(progress);
  const st = streak(progress);
  const due = progress.library.filter(isDue);
  const sortedLib = [...progress.library].sort((a, b) => (isDue(a) === isDue(b) ? a.due.localeCompare(b.due) : isDue(a) ? -1 : 1));

  const feedbackCount = me?.recs.filter((r) => r.feedback).length ?? 0;
  const attention = due.length + (me?.role === "student" ? feedbackCount : 0);
  const go = (v: View) => {
    setMenuOpen(false);
    setView(v);
    setLibOpen(null);
    if (v === "teacher") loadMe();
    window.scrollTo({ top: 0 });
  };
  const titles: Record<View, string> = { main: "", packs: "📦 Наборы фраз", library: "⭐ Мои фразы", badges: "🏅 Прогресс", teacher: "📌 От препода" };

  return (
    <main className="wrap slim">
      <header className="bar">
        <button type="button" className="brand-btn" onClick={() => go("main")}>
          Neuro-Fluent
        </button>
        <div className="bar-right">
          {mounted && st > 0 && <span className="mini-streak">🔥 {st}</span>}
          <div className="menu-wrap">
            <button type="button" className="dots-btn" aria-label="Меню" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
              ⋯{mounted && attention > 0 && <span className="dot-badge" />}
            </button>
            {menuOpen && (
              <>
                <button type="button" className="menu-scrim" aria-label="Закрыть меню" onClick={() => setMenuOpen(false)} />
                <div className="menu big" role="menu">
                  {me?.role === "student" && <div className="menu-note">Привет, {me.name} 👋</div>}
                  <button type="button" className="menu-item" onClick={() => (setMenuOpen(false), pick(potd.text))}>
                    📅 Фраза дня
                  </button>
                  <button type="button" className="menu-item" onClick={() => go("packs")}>
                    📦 Наборы фраз
                  </button>
                  <button type="button" className="menu-item" onClick={() => go("library")}>
                    ⭐ Мои фразы{progress.library.length ? ` · ${progress.library.length}` : ""}
                    {due.length > 0 && <span className="due-badge">{due.length}</span>}
                  </button>
                  {me?.role === "student" && (
                    <button type="button" className="menu-item" onClick={() => go("teacher")}>
                      📌 От препода{feedbackCount > 0 && <span className="due-badge">{feedbackCount}</span>}
                    </button>
                  )}
                  <button type="button" className="menu-item" onClick={() => go("badges")}>
                    🏅 Прогресс и ачивки
                  </button>
                  <div className="menu-sep" />
                  <label className="menu-toggle">
                    <input type="checkbox" checked={progress.settings.hide} onChange={(e) => setSettings({ hide: e.target.checked })} /> 🙈 Сначала на слух
                  </label>
                  <label className="menu-toggle">
                    <input type="checkbox" checked={cyrillic} onChange={(e) => setCyrillic(e.target.checked)} /> Кириллица (костыль)
                  </label>
                  <label className="menu-toggle">
                    <input type="checkbox" checked={ruTip} onChange={(e) => setRuTip(e.target.checked)} /> Советы для русских
                  </label>
                  <label className="menu-toggle col">
                    <span>
                      Пауза в «Эхо» ×{progress.settings.gap.toFixed(1)}
                    </span>
                    <input type="range" min={0.8} max={2.5} step={0.1} value={progress.settings.gap} onChange={(e) => setSettings({ gap: Number(e.target.value) })} />
                  </label>
                  <div className="menu-sep" />
                  {me?.role === "demo" && <div className="menu-note">Демо: {me.limits?.breakdown ?? 5} своих фраз в день. Полный доступ — по ссылке от препода.</div>}
                  {me?.role === "teacher" && (
                    <a className="menu-item" href="/teacher">
                      🧑‍🏫 Кабинет препода
                    </a>
                  )}
                  <button type="button" className="menu-item" onClick={() => (setMenuOpen(false), askPasscode())}>
                    🔑 Ввести код
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {needPass && (
        <form
          className="passbox"
          onSubmit={(e) => {
            e.preventDefault();
            setPasscode(pass.trim());
            setNeedPass(false);
            setError("");
            loadMe();
          }}
        >
          <input id="pass" ref={passRef} value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Код от препода" autoComplete="off" aria-label="Код" />
          <button type="submit" className="go small">
            OK
          </button>
        </form>
      )}

      {view !== "main" && (
        <div className="view-head">
          <button type="button" className="linkish" onClick={() => go("main")}>
            ← Назад
          </button>
          <h2>{titles[view]}</h2>
        </div>
      )}

      {view === "main" && (
        <>
          <section className="hero">
            <h1>
              Хватит звучать как <span className="hl">учебник 2007 года</span>
            </h1>
            <button type="button" className="quip-line" onClick={() => setQuip((quip + 1) % QUIPS.length)} title="Ещё">
              {QUIPS[quip]}
            </button>
          </section>

          <form className="box" onSubmit={submit}>
            <textarea
              id="input"
              ref={inputRef}
              aria-label="Фраза для шэдоуинга"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              placeholder="Вставь фразу на английском"
            />
            <button type="submit" className="go" disabled={loading}>
              {loading ? "Разбираю…" : "Разобрать"}
            </button>
          </form>

          {loading && (
            <div className="status">
              <span className="dots">
                <i />
                <i />
                <i />
              </span>{" "}
              {loadingLine}
            </div>
          )}
          {error && <div className="status error">{error}</div>}

          <section className="results">
            {sentences.map((s, i) => (
              <SentenceCard
                key={`${s.text}-${i}`}
                s={s}
                index={i}
                total={sentences.length}
                showCyrillic={cyrillic}
                showTip={ruTip}
                canSend={me?.role === "student"}
                onPasscodeNeeded={askPasscode}
              />
            ))}
            {isExample && <div className="example-tag">Это пример. Жми ▶ и слушай.</div>}
          </section>
        </>
      )}

      {view === "packs" && (
        <section className="packs">
          {PACKS.map((p) => (
            <div key={p.id} className="pack">
              <div className="pack-head">
                <span className="pack-icon">{p.icon}</span>
                <div>
                  <h3>{p.title}</h3>
                  <p>{p.blurb}</p>
                </div>
              </div>
              <ul>
                {p.phrases.map((ph) => (
                  <li key={ph}>
                    <button type="button" onClick={() => pick(ph)}>
                      {ph}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {view === "library" && mounted && (
        <section className="results">
          {libOpen ? (
            <SentenceCard key={libOpen.id} s={libOpen.s} index={0} total={1} showCyrillic={cyrillic} showTip={ruTip} fromLibrary canSend={me?.role === "student"} onPasscodeNeeded={askPasscode} />
          ) : progress.library.length === 0 ? (
            <div className="empty">
              <p>Пусто. На любой фразе жми ⋯ → «Сохранить», и она будет возвращаться через 1, 3, 7, 14 и 30 дней.</p>
            </div>
          ) : (
            <>
              <div className="lib-summary">{due.length ? `Повторить сегодня: ${due.length}` : "На сегодня всё повторено."}</div>
              <ul className="lib-list">
                {sortedLib.map((x) => (
                  <li key={x.id}>
                    <button type="button" onClick={() => setLibOpen(x)}>
                      <span className="lib-text">{x.s.text}</span>
                      <span className={`lib-due ${isDue(x) ? "now" : ""}`}>{isDue(x) ? "Повторить" : `с ${x.due.split("-").reverse().slice(0, 2).join(".")}`}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {view === "teacher" && me?.role === "student" && (
        <section className="results">
          {me.assigned.length > 0 ? (
            <ul className="lib-list">
              {me.assigned.map((ph) => (
                <li key={ph}>
                  <button type="button" onClick={() => pick(ph)}>
                    <span className="lib-text">{ph}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">
              <p>Пока ничего не задано. Отдыхай, но недолго.</p>
            </div>
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
                  {r.feedback ? <div className="mr-fb">🧑‍🏫 {r.feedback}</div> : <div className="muted">Препод ещё не послушал.</div>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {view === "badges" && mounted && (
        <section className="badges-view">
          <div className="mission-card">
            <h3>Миссия дня {mission.complete ? "✅" : ""}</h3>
            <ul>
              {mission.parts.map((p, i) => (
                <li key={i} className={p.done >= p.of ? "done" : ""}>
                  <span>{p.done >= p.of ? "✓" : "○"}</span> {p.label} <b>{p.done}/{p.of}</b>
                </li>
              ))}
            </ul>
            <p className="muted">
              🔥 {st} подряд · лучшая оценка {progress.best || "—"} · фраз разобрано {progress.counts.breakdowns}
            </p>
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
        </section>
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((id, i) => {
          const b = BADGES.find((x) => x.id === id);
          return b ? (
            <div key={`${id}-${i}`} className="toast">
              <span>{b.icon}</span>
              <div>
                <b>{b.title}</b>
                <span>{b.desc}</span>
              </div>
            </div>
          ) : null;
        })}
      </div>
    </main>
  );
}
