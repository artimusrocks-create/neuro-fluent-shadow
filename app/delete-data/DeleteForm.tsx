"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { sendReport } from "@/lib/client";

export default function DeleteForm() {
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setState("sending");
    try {
      await sendReport({ kind: "delete", contact, note });
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не отправилось. Попробуй ещё раз или напиши в Telegram.");
      setState("idle");
    }
  }

  if (state === "done") return <p className="report-done">Запрос отправлен. Удалим в течение 30 дней и напишем тебе.</p>;
  return (
    <form className="pro-form" onSubmit={submit} aria-label="Запрос на удаление данных">
      <label className="field">
        <span>Почта, Telegram или код доступа</span>
        <input required minLength={3} maxLength={120} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="you@example.com или @username" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      </label>
      <label className="field">
        <span>Комментарий (можно пропустить)</span>
        <input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: удалить только записи голоса" />
      </label>
      {error && <p className="error-line">{error}</p>}
      <button type="submit" className="wide-btn" disabled={state === "sending" || contact.trim().length < 3}>
        {state === "sending" ? <LoaderCircle className="spin" size={18} /> : null} Удалить мои данные
      </button>
    </form>
  );
}
