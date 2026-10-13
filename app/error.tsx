"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="page home" style={{ textAlign: "center" }}>
      <span className="orb lg" aria-hidden />
      <h1>Что-то сломалось</h1>
      <p className="tip-line">Обычно помогает просто обновить. Если не помогло — напиши мне, починю.</p>
      <div className="chip-row">
        <button type="button" className="wide-btn" onClick={() => reset()}>
          Попробовать ещё раз
        </button>
        <a className="wide-btn light" href="/">
          На главную
        </a>
      </div>
    </main>
  );
}
