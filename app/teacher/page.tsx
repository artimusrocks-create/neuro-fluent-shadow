"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, MyRec, getPasscode, recAudioUrl, setPasscode, teacherDo, teacherGet } from "@/lib/client";
import { PACKS } from "@/lib/packs";

type Usage = { breakdown: number; words: number; speak: number; score: number };
type StudentRow = {
  id: string;
  name: string;
  code: string;
  created: string;
  seen: string | null;
  usage: Usage;
  limits: Usage;
  assigned: string[];
  stats: { streak: number; best: number; daysTotal: number; saved: number; badges: number; records: number };
};
type Dash = {
  students: StudentRow[];
  recs: MyRec[];
  telegram: { configured: boolean; subscribers: number; appUrl: string | null; bot: string | null };
};
type Tab = "students" | "inbox" | "telegram";

const QUICK = ["🔥 Огонь, так и говори", "Глотай маленькие слова сильнее", "Ударение не туда, послушай ещё раз", "Медленно. Давай на 🐢 0.75 три раза", "Склейку не сделал, слова отдельно"];

function ago(iso: string | null) {
  if (!iso) return "ещё не заходил";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 2) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.round(h / 24)} дн назад`;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function Teacher() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [error, setError] = useState("");
  const [needLogin, setNeedLogin] = useState(false);
  const [pass, setPass] = useState("");
  const [tab, setTab] = useState<Tab>("students");
  const [newName, setNewName] = useState("");
  const [open, setOpen] = useState<{ id: string; what: "assign" | "limits" } | null>(null);
  const [assignText, setAssignText] = useState("");
  const [limitDraft, setLimitDraft] = useState<Usage | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [fb, setFb] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState("");
  const [origin, setOrigin] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setDash(await teacherGet<Dash>());
      setNeedLogin(false);
    } catch (e) {
      if (e instanceof ApiError && e.kind === "passcode") setNeedLogin(true);
      else setError(e instanceof Error ? e.message : "Не загрузилось.");
    }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    setPass(getPasscode());
    if (!getPasscode()) setNeedLogin(true);
    else load();
  }, [load]);

  const say = (t: string) => {
    setFlash(t);
    setTimeout(() => setFlash(""), 2500);
  };

  async function act(body: Record<string, unknown>, msg?: string) {
    setError("");
    try {
      const res = await teacherDo<Record<string, unknown>>(body);
      if (msg) say(msg);
      await load();
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось.");
      return null;
    }
  }

  const link = (s: StudentRow) => `${origin}/?code=${s.code}`;
  const tgLink = (s: StudentRow) => (dash?.telegram.bot ? `https://t.me/${dash.telegram.bot}?start=${s.code}` : null);
  const unread = dash?.recs.filter((r) => !r.seen).length ?? 0;

  if (needLogin) {
    return (
      <main className="wrap">
        <header>
          <span className="brand">Neuro-Fluent · Кабинет препода</span>
          <h1>Вход для препода</h1>
        </header>
        <form
          className="passbox"
          onSubmit={(e) => {
            e.preventDefault();
            setPasscode(pass.trim());
            load();
          }}
        >
          <label htmlFor="tpass">Пароль препода</label>
          <input id="tpass" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="off" />
          <button type="submit" className="go small">
            Войти
          </button>
        </form>
        {error && <div className="status error">{error}</div>}
      </main>
    );
  }

  return (
    <main className="wrap wide">
      <header>
        <div className="topline">
          <span className="brand">Neuro-Fluent · Кабинет препода</span>
          <a className="linkish" href="/">
            ← В тренажёр
          </a>
        </div>
        <h1>
          Твои <span className="hl">ученики</span>
        </h1>
      </header>

      <nav className="tabs">
        <button type="button" className={tab === "students" ? "on" : ""} onClick={() => setTab("students")}>
          👥 Ученики{dash ? ` · ${dash.students.length}` : ""}
        </button>
        <button type="button" className={tab === "inbox" ? "on" : ""} onClick={() => setTab("inbox")}>
          📥 Записи{unread ? <span className="due-badge">{unread}</span> : null}
        </button>
        <button type="button" className={tab === "telegram" ? "on" : ""} onClick={() => setTab("telegram")}>
          🤖 Telegram
        </button>
        <button type="button" onClick={load}>
          ↻ Обновить
        </button>
      </nav>

      {error && <div className="status error">{error}</div>}
      {flash && <div className="flash">{flash}</div>}
      {!dash && !error && <div className="status">Загружаем…</div>}

      {dash && tab === "students" && (
        <section className="results">
          <form
            className="box add-student"
            onSubmit={async (e) => {
              e.preventDefault();
              const res = (await act({ action: "create", name: newName }, "Ученик добавлен. Скопируй ему ссылку.")) as { student?: StudentRow } | null;
              if (res?.student) {
                setNewName("");
                copy(`${origin}/?code=${res.student.code}`);
              }
            }}
          >
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Имя нового ученика, например Лена" aria-label="Имя ученика" />
            <button type="submit" className="go small">
              + Добавить
            </button>
          </form>

          {dash.students.length === 0 && (
            <div className="empty">
              <p>Пока никого. Добавь ученика — он получит личную ссылку. По ней он заходит без пароля, а ты видишь его прогресс и записи.</p>
            </div>
          )}

          {dash.students.map((s) => (
            <div key={s.id} className="srow">
              <div className="srow-top">
                <div>
                  <b className="sname">{s.name}</b>
                  <span className="muted"> · {ago(s.seen)}</span>
                </div>
                <div className="sstats">
                  <span title="Серия дней">🔥 {s.stats.streak}</span>
                  <span title="Лучшая оценка">🧪 {s.stats.best || "—"}</span>
                  <span title="Дней с практикой">📆 {s.stats.daysTotal}</span>
                  <span title="Сохранённых фраз">⭐ {s.stats.saved}</span>
                  <span title="Ачивок">🏅 {s.stats.badges}</span>
                </div>
              </div>
              <div className="susage">
                Сегодня: разборов {s.usage.breakdown}/{s.limits.breakdown} · озвучек {s.usage.speak}/{s.limits.speak} · оценок {s.usage.score}/{s.limits.score}
              </div>
              <div className="actions">
                <button type="button" className="act" onClick={async () => say((await copy(link(s))) ? "Ссылка скопирована" : link(s))}>
                  🔗 Ссылка
                </button>
                {tgLink(s) && (
                  <button type="button" className="act" onClick={async () => say((await copy(tgLink(s)!)) ? "Ссылка на бота скопирована" : tgLink(s)!)}>
                    🤖 Ссылка в Telegram
                  </button>
                )}
                <button
                  type="button"
                  className="act"
                  onClick={() => {
                    setOpen(open?.id === s.id && open.what === "assign" ? null : { id: s.id, what: "assign" });
                    setAssignText(s.assigned.join("\n"));
                  }}
                >
                  📌 Задать фразы{s.assigned.length ? ` · ${s.assigned.length}` : ""}
                </button>
                <button
                  type="button"
                  className="act"
                  onClick={() => {
                    setOpen(open?.id === s.id && open.what === "limits" ? null : { id: s.id, what: "limits" });
                    setLimitDraft(s.limits);
                  }}
                >
                  🚦 Лимиты
                </button>
                {confirmDel === s.id ? (
                  <button type="button" className="act running" onClick={() => (act({ action: "delete", id: s.id }, "Удалён"), setConfirmDel(null))}>
                    Точно удалить?
                  </button>
                ) : (
                  <button type="button" className="act" onClick={() => setConfirmDel(s.id)}>
                    🗑
                  </button>
                )}
              </div>
              <div className="slink">{link(s)}</div>

              {open?.id === s.id && open.what === "assign" && (
                <div className="sedit">
                  <label htmlFor={`as-${s.id}`}>Одна фраза на строку. Ученик увидит их во вкладке «📌 От препода».</label>
                  <textarea id={`as-${s.id}`} value={assignText} onChange={(e) => setAssignText(e.target.value)} rows={6} />
                  <div className="pack-picks">
                    {PACKS.map((p) => (
                      <button key={p.id} type="button" className="chip" onClick={() => setAssignText((t) => [t.trim(), ...p.phrases].filter(Boolean).join("\n"))}>
                        + {p.icon} {p.title}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="go small" onClick={() => act({ action: "assign", id: s.id, phrases: assignText.split("\n") }, "Задано")}>
                    Сохранить
                  </button>
                </div>
              )}

              {open?.id === s.id && open.what === "limits" && limitDraft && (
                <div className="sedit limits">
                  {(["breakdown", "words", "speak", "score"] as const).map((k) => (
                    <label key={k}>
                      {{ breakdown: "Разборов в день", words: "Разборов по словам", speak: "Озвучек", score: "Оценок акцента" }[k]}
                      <input type="number" min={0} max={5000} value={limitDraft[k]} onChange={(e) => setLimitDraft({ ...limitDraft, [k]: Number(e.target.value) })} />
                    </label>
                  ))}
                  <button type="button" className="go small" onClick={() => act({ action: "limits", id: s.id, limits: limitDraft }, "Лимиты сохранены")}>
                    Сохранить
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {dash && tab === "inbox" && (
        <section className="results">
          {dash.recs.length === 0 && (
            <div className="empty">
              <p>Записей пока нет. Ученики отправляют их кнопкой «📤 Отправить преподу» после того, как запишут себя.</p>
            </div>
          )}
          {dash.recs.map((r) => (
            <div key={r.id} className={`inbox ${r.seen ? "" : "unread"}`}>
              <div className="mr-top">
                <span>
                  <b>{r.name}</b> <span className="muted">· {ago(r.at)}</span>
                </span>
                {r.score !== null && <span className="mr-score">{r.score}/100</span>}
              </div>
              <div className="inbox-text">«{r.text}»</div>
              <audio controls preload="none" src={recAudioUrl(r)} onPlay={() => !r.seen && teacherDo({ action: "seen", recId: r.id }).catch(() => {})} />
              {r.feedback && <div className="mr-fb">Твой ответ: {r.feedback}</div>}
              <div className="pack-picks">
                {QUICK.map((q) => (
                  <button key={q} type="button" className="chip" onClick={() => setFb({ ...fb, [r.id]: [fb[r.id], q].filter(Boolean).join(". ") })}>
                    {q}
                  </button>
                ))}
              </div>
              <div className="fb-row">
                <textarea
                  rows={2}
                  value={fb[r.id] ?? ""}
                  onChange={(e) => setFb({ ...fb, [r.id]: e.target.value })}
                  placeholder="Комментарий ученику"
                  aria-label={`Комментарий для ${r.name}`}
                />
                <button
                  type="button"
                  className="go small"
                  disabled={!(fb[r.id] ?? "").trim()}
                  onClick={async () => {
                    await act({ action: "feedback", recId: r.id, text: fb[r.id] }, "Ответ отправлен");
                    setFb({ ...fb, [r.id]: "" });
                  }}
                >
                  Ответить
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {dash && tab === "telegram" && (
        <section className="results">
          <div className="pack">
            {!dash.telegram.configured ? (
              <p>
                Бот ещё не подключён. Создай бота в <b>@BotFather</b>, добавь токен в Vercel как <code>TELEGRAM_BOT_TOKEN</code>, сделай Redeploy и вернись сюда.
              </p>
            ) : (
              <>
                <p>
                  {dash.telegram.bot ? (
                    <>
                      Бот: <a href={`https://t.me/${dash.telegram.bot}`}>@{dash.telegram.bot}</a> · подписчиков на «Фразу дня»: <b>{dash.telegram.subscribers}</b>
                    </>
                  ) : (
                    "Токен есть. Осталось нажать кнопку ниже."
                  )}
                </p>
                <p className="muted">Кнопка ниже привязывает бота к этому сайту: меню «🎧 Тренажёр», команды и ежедневная рассылка в 9:00 по Тбилиси. Жми её ещё раз, если поменяешь адрес сайта.</p>
                <button
                  type="button"
                  className="go small"
                  onClick={async () => {
                    const res = (await act({ action: "telegram" })) as { bot?: string } | null;
                    if (res?.bot) say(`Готово: @${res.bot} подключён`);
                  }}
                >
                  🤖 {dash.telegram.bot ? "Переподключить бота" : "Подключить бота"}
                </button>
              </>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
