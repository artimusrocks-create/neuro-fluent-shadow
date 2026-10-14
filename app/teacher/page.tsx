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
type ProRow = { id: string; name: string; code: string; email: string | null; tgUser: string | null; src: string | null; until: string | null; autoRenew: boolean; active: boolean; seen: string | null; canRefundStars: boolean };
type PayRow = { at: string; src: string; kind: string; amount: number; currency: string; who: string; note?: string };
type DayRow = { day: string; visitors: number; events: Record<string, number>; revenue: Record<string, number> };
type Dash = {
  students: StudentRow[];
  recs: MyRec[];
  telegram: { configured: boolean; subscribers: number; appUrl: string | null; bot: string | null; adminChat: boolean };
  money: { pro: ProRow[]; log: PayRow[]; days: DayRow[]; offer: { telegram: boolean; card: boolean; stars: number; priceRub: string; priceUsd: string } };
  reports?: { kind: "ai" | "delete"; text: string; where: string; note: string; contact: string; at: string }[];
};
type Tab = "students" | "inbox" | "money" | "telegram";

const KIND: Record<string, string> = { new: "💸 новая", renew: "🔁 продление", refund: "↩️ возврат", cancel: "🚪 отмена", fail: "⚠️ не прошла", manual: "🎁 вручную" };
const SRC: Record<string, string> = { stars: "звёзды", lava: "карта", manual: "вручную" };
const fmtD = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : "—");
function money(rev: Record<string, number>) {
  const parts = Object.entries(rev)
    .filter(([k, v]) => k !== "payments" && v)
    .map(([k, v]) => (k === "XTR" ? `${Math.round(v)}⭐` : `${Math.round(v * 100) / 100} ${k}`));
  return parts.length ? parts.join(" + ") : "—";
}
function sumRevenue(days: DayRow[]) {
  const out: Record<string, number> = {};
  for (const d of days) for (const [k, v] of Object.entries(d.revenue)) out[k] = (out[k] ?? 0) + v;
  return out;
}

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
  const [grant, setGrant] = useState({ name: "", email: "", days: 30 });

  // A wrong or old password (or a student's code) saved in this browser brings the password box back.
  const wrongPass = (e: unknown) => {
    if (!(e instanceof ApiError && e.kind === "passcode")) return false;
    setNeedLogin(true);
    setDash(null);
    setError("Пароль не подошёл. Проверь большие и маленькие буквы и попробуй ещё раз.");
    return true;
  };

  const load = useCallback(async () => {
    setError("");
    try {
      setDash(await teacherGet<Dash>());
      setNeedLogin(false);
    } catch (e) {
      if (!wrongPass(e)) setError(e instanceof Error ? e.message : "Не загрузилось.");
    }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
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
      if (!wrongPass(e)) setError(e instanceof Error ? e.message : "Не получилось.");
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
          <span className="brand">Neuro-Fluent Shadow · Кабинет</span>
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
          <input id="tpass" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          <button type="submit" className="go small" disabled={!pass.trim()}>
            Войти
          </button>
        </form>
        {error && <div className="status error">{error}</div>}
        <p className="hint">Забыл пароль? Он лежит в Vercel → Settings → Environment Variables → APP_PASSCODE.</p>
      </main>
    );
  }

  return (
    <main className="wrap wide">
      <header>
        <div className="topline">
          <span className="brand">Neuro-Fluent Shadow · Кабинет</span>
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
        <button type="button" className={tab === "money" ? "on" : ""} onClick={() => setTab("money")}>
          💰 Деньги{dash ? ` · ${dash.money.pro.filter((p) => p.active).length} Pro` : ""}
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
                        + {p.title}
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
          {(dash.reports?.length ?? 0) > 0 && (
            <div className="report-list" aria-label="Жалобы и просьбы">
              <h3>🚩 Жалобы на разборы и просьбы удалить данные</h3>
              {dash.reports!.map((rp, i) => (
                <div key={i} className="report-item">
                  <span>
                    <b>{rp.kind === "ai" ? "Ошибка в разборе" : "Удалить данные"}</b> <span className="muted">· {ago(rp.at)}</span>
                  </span>
                  {rp.kind === "ai" ? <span>«{rp.text}»{rp.where === "words" ? " (слова)" : ""}</span> : <span>Контакт: {rp.contact}</span>}
                  {rp.note && <span className="muted">{rp.note}</span>}
                </div>
              ))}
            </div>
          )}
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

      {dash && tab === "money" && (
        <section className="results">
          <div className="stat-grid">
            <div className="stat">
              <b>{dash.money.pro.filter((p) => p.active).length}</b>
              <span>активных Pro</span>
            </div>
            <div className="stat">
              <b>{money(sumRevenue(dash.money.days.slice(0, 7)))}</b>
              <span>выручка за 7 дней</span>
            </div>
            <div className="stat">
              <b>{dash.money.days.slice(0, 7).reduce((n, d) => n + d.visitors, 0)}</b>
              <span>посетителей за 7 дней</span>
            </div>
          </div>

          <div className="pack">
            <h3>Оплата</h3>
            <p>
              ⭐ Звёзды в Telegram: <b>{dash.money.offer.telegram ? `включены, ${dash.money.offer.stars}⭐/мес` : "выключены"}</b>
              <br />
              💳 Карта (lava.top): <b>{dash.money.offer.card ? `включена, ${dash.money.offer.priceRub} / ${dash.money.offer.priceUsd}` : "выключена — добавь ключи lava.top в Vercel"}</b>
              <br />
              🔔 Уведомления об оплатах и утренний отчёт:{" "}
              <b>{dash.telegram.adminChat ? "приходят тебе в Telegram" : dash.telegram.bot ? `напиши боту /admin <пароль препода>` : "сначала подключи бота"}</b>
            </p>
          </div>

          <div className="pack">
            <h3>Воронка по дням</h3>
            <div className="table-wrap">
              <table className="word-table funnel">
                <thead>
                  <tr>
                    <th scope="col">День</th>
                    <th scope="col">Зашли</th>
                    <th scope="col">Фразы</th>
                    <th scope="col">Лимит</th>
                    <th scope="col">Видели Pro</th>
                    <th scope="col">Жали «оплатить»</th>
                    <th scope="col">Оплаты</th>
                    <th scope="col">Выручка</th>
                  </tr>
                </thead>
                <tbody>
                  {dash.money.days.map((d) => (
                    <tr key={d.day}>
                      <td>{fmtD(d.day + "T12:00:00Z")}</td>
                      <td>{d.visitors}</td>
                      <td>{d.events.phrase ?? 0}</td>
                      <td>{d.events.limit ?? 0}</td>
                      <td>{d.events.paywall ?? 0}</td>
                      <td>{(d.events.checkout_stars ?? 0) + (d.events.checkout_card ?? 0)}</td>
                      <td>{(d.events.pay_new ?? 0) + (d.events.pay_renew ?? 0)}</td>
                      <td>{money(d.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <form
            className="pack sedit"
            onSubmit={async (e) => {
              e.preventDefault();
              const res = (await act({ action: "grant", ...grant }, "Pro выдан, ссылка скопирована")) as { link?: string } | null;
              if (res?.link) {
                copy(res.link);
                setGrant({ name: "", email: "", days: 30 });
              }
            }}
          >
            <h3>Выдать Pro вручную</h3>
            <p className="muted">Например, тому, кто перевёл деньги напрямую, или в подарок. Ссылка скопируется — отправь её человеку.</p>
            <label>
              Имя
              <input value={grant.name} onChange={(e) => setGrant({ ...grant, name: e.target.value })} placeholder="Лена" />
            </label>
            <label>
              Почта (необязательно)
              <input type="email" value={grant.email} onChange={(e) => setGrant({ ...grant, email: e.target.value })} placeholder="lena@example.com" />
            </label>
            <label>
              Дней
              <input type="number" min={1} max={400} value={grant.days} onChange={(e) => setGrant({ ...grant, days: Number(e.target.value) })} />
            </label>
            <button type="submit" className="go small" disabled={!grant.name.trim() && !grant.email.trim()}>
              🎁 Выдать
            </button>
          </form>

          <h3>Подписчики Pro</h3>
          {dash.money.pro.length === 0 && (
            <div className="empty">
              <p>Пока никого. Как только кто-то оплатит, он появится здесь, а тебе придёт сообщение в Telegram.</p>
            </div>
          )}
          {dash.money.pro.map((p) => (
            <div key={p.id} className="srow">
              <div className="srow-top">
                <div>
                  <b className="sname">{p.name}</b>
                  <span className="muted">
                    {" "}
                    · {p.email ?? (p.tgUser ? "@" + p.tgUser : "")} · {SRC[p.src ?? ""] ?? p.src} · {ago(p.seen)}
                  </span>
                </div>
                <div className="sstats">
                  <span>{p.active ? `✅ до ${fmtD(p.until)}` : `⛔ закончился ${fmtD(p.until)}`}</span>
                  <span>{p.autoRenew ? "🔁 продлится" : "без автопродления"}</span>
                </div>
              </div>
              <div className="actions">
                <button type="button" className="act" onClick={async () => say((await copy(`${origin}/?code=${p.code}`)) ? "Ссылка скопирована" : `${origin}/?code=${p.code}`)}>
                  🔗 Ссылка
                </button>
                <button type="button" className="act" onClick={() => act({ action: "extend", id: p.id, days: 30 }, "+30 дней")}>
                  ➕ 30 дней
                </button>
                {p.active &&
                  (confirmDel === `rv-${p.id}` ? (
                    <button type="button" className="act running" onClick={() => (act({ action: "revoke", id: p.id }, "Доступ закрыт"), setConfirmDel(null))}>
                      Точно закрыть доступ?
                    </button>
                  ) : (
                    <button type="button" className="act" onClick={() => setConfirmDel(`rv-${p.id}`)}>
                      ⛔ Закрыть
                    </button>
                  ))}
                {p.canRefundStars &&
                  (confirmDel === `rf-${p.id}` ? (
                    <button type="button" className="act running" onClick={() => (act({ action: "refundStars", id: p.id }, "Звёзды вернули"), setConfirmDel(null))}>
                      Вернуть звёзды и закрыть?
                    </button>
                  ) : (
                    <button type="button" className="act" onClick={() => setConfirmDel(`rf-${p.id}`)}>
                      ↩️ Вернуть звёзды
                    </button>
                  ))}
              </div>
            </div>
          ))}

          <h3>Платежи</h3>
          {dash.money.log.length === 0 ? (
            <div className="empty">
              <p>Платежей пока не было.</p>
            </div>
          ) : (
            <ul className="lib-list">
              {dash.money.log.map((l, i) => (
                <li key={i} className="pay-row">
                  <span>{fmtD(l.at)}</span>
                  <span>{KIND[l.kind] ?? l.kind}</span>
                  <b>{l.amount ? `${l.amount} ${l.currency === "XTR" ? "⭐" : l.currency}` : ""}</b>
                  <span className="muted">
                    {l.who} · {SRC[l.src] ?? l.src}
                    {l.note ? ` · ${l.note}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
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
                <p className="muted">
                  Кнопка ниже привязывает бота к этому сайту: меню «🎧 Тренажёр», команды, оплата звёздами и рассылка «Фразы дня» в 9:00 по Тбилиси. Жми её ещё раз, если
                  поменяешь адрес сайта.
                </p>
                <p className="muted">
                  Чтобы получать уведомления об оплатах и утренний отчёт, напиши боту: <code>/admin пароль-препода</code>.{" "}
                  {dash.telegram.adminChat ? "✅ Уже подключено." : ""}
                </p>
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
