"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Check, CreditCard, KeyRound, LoaderCircle, MessageCircle, Star } from "lucide-react";
import Sheet from "./ui/Sheet";
import {
  ApiError,
  Me,
  checkClaim,
  isStoreApp,
  newNonce,
  pendingClaim,
  restoreAccess,
  setPasscode,
  setPendingClaim,
  startCard,
  startStars,
  telegramApp,
  trackEvent,
} from "@/lib/client";

export type ProReason = "limit" | "menu" | "lapsed" | "code";
type View = "offer" | "card" | "code" | "restore" | "waiting";

const fmtUntil = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "");

/** The Pro offer: pay with Telegram Stars or a card, then the app picks up the new access code by itself. */
export default function ProSheet({
  open,
  reason,
  me,
  startWaiting,
  onClose,
  onActivated,
}: {
  open: boolean;
  reason: ProReason;
  me: Me | null;
  startWaiting?: boolean;
  onClose: () => void;
  onActivated: (code: string) => void;
}) {
  const [view, setView] = useState<View>("offer");
  const [email, setEmail] = useState("");
  const [currency, setCurrency] = useState<"RUB" | "USD">("RUB");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [store, setStore] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const offer = me?.offer;

  useEffect(() => {
    if (!open) return;
    setStore(isStoreApp());
    setError("");
    setNote("");
    setView(startWaiting && pendingClaim() ? "waiting" : reason === "code" ? "code" : "offer");
    if (reason !== "code") trackEvent("paywall");
  }, [open, startWaiting, reason]);

  // While waiting for a payment, ask the server every few seconds whether it arrived.
  useEffect(() => {
    if (!open || view !== "waiting") return;
    const nonce = pendingClaim();
    if (!nonce) return;
    let tries = 0;
    const tick = async () => {
      tries++;
      const c = await checkClaim(nonce);
      if (c) {
        stop();
        setPendingClaim(null);
        trackEvent("pro_activated");
        onActivated(c);
      } else if (tries > 240) stop(); // ~10 minutes
    };
    const stop = () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
    tick();
    pollRef.current = setInterval(tick, 2500);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => {
      stop();
      window.removeEventListener("focus", onFocus);
    };
  }, [open, view, onActivated]);

  async function payStars() {
    setError("");
    setBusy(true);
    const nonce = newNonce();
    try {
      const { link } = await startStars(nonce);
      setPendingClaim(nonce);
      trackEvent("checkout_stars");
      const tg = telegramApp();
      if (tg?.openInvoice) {
        tg.openInvoice(link, (status) => {
          if (status === "paid" || status === "pending") setView("waiting");
        });
      } else {
        window.open(link, "_blank", "noopener");
        setView("waiting");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось открыть оплату.");
    } finally {
      setBusy(false);
    }
  }

  async function payCard(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const nonce = newNonce();
    try {
      const { url } = await startCard(nonce, email.trim(), currency);
      setPendingClaim(nonce);
      trackEvent("checkout_card");
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не получилось начать оплату.");
      setBusy(false);
    }
  }

  function submitCode(e: FormEvent) {
    e.preventDefault();
    const c = code.trim();
    if (!c) return;
    setPasscode(c);
    onActivated(c);
  }

  async function restore(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await restoreAccess(email.trim());
      setNote(r.manual ? "Напиши мне в Telegram — пришлю ссылку вручную." : "Если на эту почту оформлен Pro, письмо со ссылкой уже летит. Проверь «Спам».");
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Не получилось.");
    } finally {
      setBusy(false);
    }
  }

  const title =
    store && reason !== "lapsed"
      ? reason === "limit"
        ? "На сегодня всё"
        : "Код доступа"
      : reason === "limit"
        ? "Бесплатные фразы на сегодня закончились"
        : reason === "lapsed"
          ? "Pro закончился"
          : reason === "code"
            ? "Код доступа"
            : "Shadow Pro";
  const contact = me?.free?.contact || "https://t.me/rawmeatsalad";
  const canPay = !!offer && (offer.telegram || offer.card);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()} title={title}>
      {/* Android app from Google Play: no prices, no payment links (Play's rules). */}
      {store ? (
        <>
          {reason === "limit" && <p className="pro-lead">Завтра будет ещё 5 своих фраз. Готовые наборы работают без ограничений — загляни в «Наборы».</p>}
          <form className="pro-form" onSubmit={submitCode}>
            <label className="field">
              <span>Есть код доступа? Введи его</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="например, lena-7k3q" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            </label>
            <button type="submit" className="wide-btn" disabled={!code.trim()}>
              <KeyRound size={18} /> Войти по коду
            </button>
          </form>
          <button type="button" className="wide-btn light" onClick={onClose}>
            Понятно
          </button>
        </>
      ) : view === "waiting" ? (
        <div className="pro-wait">
          <LoaderCircle className="spin" size={36} />
          <p className="pro-lead">Жду подтверждение оплаты. Как только деньги дойдут, Pro включится сам — обычно это секунд десять.</p>
          <p className="muted">Платил в Telegram? Бот ещё пришлёт личную ссылку. Картой — ссылка придёт и на почту.</p>
          <button type="button" className="wide-btn light" onClick={() => setView("offer")}>
            Назад
          </button>
        </div>
      ) : view === "card" ? (
        <form className="pro-form" onSubmit={payCard}>
          <label className="field">
            <span>Почта — туда придут чек и ссылка</span>
            <input type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <div className="seg2 wide" role="group" aria-label="Какая у тебя карта">
            <button type="button" className={currency === "RUB" ? "on" : ""} onClick={() => setCurrency("RUB")} aria-pressed={currency === "RUB"}>
              Российская · {offer?.priceRub}
            </button>
            <button type="button" className={currency === "USD" ? "on" : ""} onClick={() => setCurrency("USD")} aria-pressed={currency === "USD"}>
              Зарубежная · {offer?.priceUsd}
            </button>
          </div>
          {error && <p className="error-line">{error}</p>}
          <button type="submit" className="wide-btn" disabled={busy || !email.trim()}>
            {busy ? <LoaderCircle className="spin" size={18} /> : <CreditCard size={18} />} Перейти к оплате
          </button>
          <p className="muted small">Оплата через lava.top. Подписка продлевается раз в месяц, отменить можно в любой момент — ссылка будет в письме.</p>
          <button type="button" className="text-btn" onClick={() => setView("offer")}>
            ← Назад
          </button>
        </form>
      ) : view === "code" ? (
        <form className="pro-form" onSubmit={submitCode}>
          <label className="field">
            <span>Код доступа</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="например, lena-7k3q" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </label>
          <button type="submit" className="wide-btn" disabled={!code.trim()}>
            <KeyRound size={18} /> Войти
          </button>
          <div className="pro-links">
            <button type="button" className="text-btn" onClick={() => setView("offer")}>
              ← Shadow Pro
            </button>
            {canPay && (
              <button type="button" className="text-btn" onClick={() => setView("restore")}>
                Оплатил, но потерял ссылку
              </button>
            )}
          </div>
        </form>
      ) : view === "restore" ? (
        <form className="pro-form" onSubmit={restore}>
          <label className="field">
            <span>Почта, на которую оформлял Pro</span>
            <input type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          {error && <p className="error-line">{error}</p>}
          {note && <p className="pro-note">{note}</p>}
          <button type="submit" className="wide-btn" disabled={busy || !email.trim()}>
            Прислать ссылку
          </button>
          <p className="muted small">
            Платил звёздами? Напиши боту /code — он пришлёт ссылку.{" "}
            <a href={contact} target="_blank" rel="noopener noreferrer">
              Или напиши мне
            </a>
            .
          </p>
          <button type="button" className="text-btn" onClick={() => setView("offer")}>
            ← Назад
          </button>
        </form>
      ) : (
        <>
          <p className="pro-lead">
            {reason === "limit"
              ? "Завтра будет ещё 5. А с Pro — 25 своих фраз каждый день."
              : reason === "lapsed"
                ? `Доступ закончился ${fmtUntil(me?.lapsed?.until)}. Прогресс никуда не делся — продли, и продолжим.`
                : "Для тех, кто занимается каждый день и упирается в пять фраз."}
          </p>
          <ul className="pro-list">
            <li>
              <Check size={18} /> 25 своих фраз в день вместо пяти
            </li>
            <li>
              <Check size={18} /> Разбор по словам и оценка произношения — с запасом
            </li>
            <li>
              <Check size={18} /> Прогресс и сохранённые фразы на всех устройствах
            </li>
            <li>
              <Check size={18} /> Деньги идут живому преподу, а не корпорации
            </li>
          </ul>
          {canPay ? (
            <div className="pro-pay">
              {offer!.telegram && (
                <button type="button" className="wide-btn" onClick={payStars} disabled={busy}>
                  {busy ? <LoaderCircle className="spin" size={18} /> : <Star size={18} />} В Telegram · {offer!.stars} ⭐ в месяц
                </button>
              )}
              {offer!.card && (
                <button type="button" className={`wide-btn ${offer!.telegram ? "light" : ""}`} onClick={() => setView("card")}>
                  <CreditCard size={18} /> Картой · {offer!.priceRub} или {offer!.priceUsd}
                </button>
              )}
            </div>
          ) : (
            <a className="wide-btn" href={contact} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={18} /> Написать Артёму в Telegram
            </a>
          )}
          {error && <p className="error-line">{error}</p>}
          <div className="pro-links">
            <button type="button" className="text-btn" onClick={() => setView("code")}>
              У меня есть код
            </button>
            {canPay && (
              <button type="button" className="text-btn" onClick={() => setView("restore")}>
                Оплатил, но потерял ссылку
              </button>
            )}
          </div>
          <p className="muted small center">
            Продлевается раз в 30 дней, отменить можно когда угодно.{" "}
            <a href="/terms" target="_blank">
              Условия
            </a>{" "}
            ·{" "}
            <a href="/privacy" target="_blank">
              Конфиденциальность
            </a>
          </p>
        </>
      )}
    </Sheet>
  );
}
