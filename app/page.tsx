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

export default function Page() {
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
  const passRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPass(getPasscode());
    setQuip(Math.floor(Math.random() * QUIPS.length));
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

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!t) {
      setError("Сначала вставь фразу. Мысли мы пока не читаем.");
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
        setError("Нужен пароль. Без него не пустим: кредиты на голос не бесконечные.");
      } else setError(err instanceof Error ? err.message : "Что-то сломалось. Попробуй ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="wrap">
      <header>
        <div className="topline">
          <span className="brand">Neuro-Fluent · Шэдоуинг</span>
          <button type="button" className="linkish" onClick={askPasscode}>
            🔑 Пароль
          </button>
        </div>
        <h1>
          Хватит звучать как <span className="hl">учебник 2007 года</span>
        </h1>
        <p className="sub">
          Вставь фразу, которую повторяешь за носителем. Покажем, почему американец говорит не «вот ар ю гоинг ту ду», а «уачагана», и дадим
          повторить за ним, пока не заговоришь так же.
        </p>
        <div className="quip">
          <span>{QUIPS[quip]}</span>
          <button type="button" className="quip-next" onClick={() => setQuip((quip + 1) % QUIPS.length)} aria-label="Следующая правда">
            ↻
          </button>
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
          }}
        >
          <label htmlFor="pass">Пароль</label>
          <input id="pass" ref={passRef} value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Спроси у препода" autoComplete="off" />
          <button type="submit" className="go small">
            Сохранить
          </button>
        </form>
      )}

      <form className="box" onSubmit={submit}>
        <textarea
          id="input"
          aria-label="Фраза для шэдоуинга"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          placeholder="Например: What are you going to do about it?"
        />
        <div className="controls">
          <div className="toggles">
            <label className="chip-toggle">
              <input type="checkbox" checked={cyrillic} onChange={(e) => setCyrillic(e.target.checked)} /> Кириллица (костыль)
            </label>
            <label className="chip-toggle">
              <input type="checkbox" checked={ruTip} onChange={(e) => setRuTip(e.target.checked)} /> Советы для русских
            </label>
          </div>
          <button type="submit" className="go" disabled={loading}>
            {loading ? "Разбираю…" : "Разобрать"} <kbd>Ctrl+↵</kbd>
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
          {loadingLine}
        </div>
      )}
      {error && <div className="status error">{error}</div>}

      <section className="results">
        {isExample && <div className="example-tag">Пример. Жми ▶ и слушай, потом вставь свою фразу</div>}
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

      <footer>Американский английский · Без транскрипции и без «London is the capital»</footer>
    </main>
  );
}
