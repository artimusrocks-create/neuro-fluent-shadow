import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page home" style={{ textAlign: "center" }}>
      <span className="orb lg" aria-hidden />
      <h1>Такой страницы нет</h1>
      <p className="tip-line">Зато есть тренажёр и десятки разобранных фраз.</p>
      <div className="chip-row">
        <Link className="wide-btn" href="/">
          Открыть тренажёр
        </Link>
        <Link className="wide-btn light" href="/phrases">
          Все фразы
        </Link>
      </div>
    </main>
  );
}
