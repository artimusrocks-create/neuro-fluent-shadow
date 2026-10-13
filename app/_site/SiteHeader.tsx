import Link from "next/link";

/** Header for the public pages (landing, phrases, legal). */
export default function SiteHeader({ cta = "Открыть тренажёр", href = "/" }: { cta?: string; href?: string }) {
  return (
    <header className="topbar">
      <Link href="/start" className="logo">
        <span className="orb" aria-hidden /> Neuro-Fluent Shadow
      </Link>
      <div className="top-right">
        <Link href="/phrases" className="pill-link desk-only">
          Фразы
        </Link>
        <Link href={href} className="pill-link solid">
          {cta}
        </Link>
      </div>
    </header>
  );
}
