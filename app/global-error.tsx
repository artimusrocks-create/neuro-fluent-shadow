"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ru">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0, padding: 16, textAlign: "center" }}>
        <main>
          <h1>Что-то сломалось</h1>
          <p>Обнови страницу. Если не помогло — напиши мне в Telegram: @rawmeatsalad</p>
          <button type="button" onClick={() => reset()} style={{ height: 48, padding: "0 24px", borderRadius: 999, border: 0, background: "#1f1c2e", color: "#fff", fontWeight: 600 }}>
            Обновить
          </button>
        </main>
      </body>
    </html>
  );
}
