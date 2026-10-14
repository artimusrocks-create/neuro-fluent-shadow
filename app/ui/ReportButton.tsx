"use client";

import { useState } from "react";
import { Flag, LoaderCircle } from "lucide-react";
import { sendReport } from "@/lib/client";

/**
 * "Something's wrong with this AI answer" — right inside the app (Google Play's AI-content rule:
 * people must be able to flag AI output without leaving the app). Goes to the teacher's dashboard and Telegram.
 */
export default function ReportButton({ text, where }: { text: string; where: "breakdown" | "words" }) {
  const [state, setState] = useState<"idle" | "open" | "sending" | "done">("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setState("sending");
    try {
      await sendReport({ kind: "ai", text, where, note });
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не отправилось. Попробуй ещё раз.");
      setState("open");
    }
  }

  if (state === "done") return <p className="report-done">Спасибо! Артём посмотрит и поправит.</p>;
  if (state === "idle")
    return (
      <button type="button" className="report-btn" onClick={() => setState("open")}>
        <Flag size={14} aria-hidden /> Ошибка в разборе? Сообщить
      </button>
    );
  return (
    <form className="report-form" onSubmit={send} aria-label="Сообщить об ошибке в разборе">
      <label className="field">
        <span>Что не так? (можно пропустить)</span>
        <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: неверный перевод, странное ударение, что-то обидное" />
      </label>
      {error && <p className="error-line">{error}</p>}
      <div className="report-row">
        <button type="submit" className="go small" disabled={state === "sending"}>
          {state === "sending" ? <LoaderCircle className="spin" size={16} /> : null} Отправить
        </button>
        <button type="button" className="text-btn" onClick={() => setState("idle")}>
          Отмена
        </button>
      </div>
    </form>
  );
}
