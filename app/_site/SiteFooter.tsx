import Link from "next/link";
import { CONTACT, LEGAL } from "@/lib/site";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav aria-label="Ссылки">
        <Link href="/start">О тренажёре</Link>
        <Link href="/phrases">Все фразы</Link>
        <Link href="/download">Скачать</Link>
        <Link href="/terms">Условия</Link>
        <Link href="/privacy">Конфиденциальность</Link>
        <Link href="/delete-data">Удалить данные</Link>
        <a href={CONTACT.telegram} target="_blank" rel="noopener noreferrer">
          Написать Артёму
        </a>
      </nav>
      <p>
        © {new Date().getFullYear()} Neuro-Fluent · {LEGAL.name}
        {LEGAL.id ? ` · ${LEGAL.id}` : ""}
      </p>
    </footer>
  );
}
