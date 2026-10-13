import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../_site/SiteHeader";
import SiteFooter from "../_site/SiteFooter";
import Track from "../_site/Track";
import { PACKS } from "@/lib/packs";
import { PHRASES } from "@/lib/phrases";

export const metadata: Metadata = {
  title: "Фразы, которые американцы говорят каждый день — с произношением",
  description: "Кафе, аэропорт, созвоны, свидания, сериалы и сленг: как эти фразы звучат в живой речи, где склейки и ударения. С аудио и разбором по-русски.",
  alternates: { canonical: "/phrases" },
};

export default function PhrasesPage() {
  return (
    <div className="site">
      <Track event="seo" />
      <SiteHeader />
      <main className="site-main">
        <h1 className="site-h1">Фразы, которые американцы говорят каждый день</h1>
        <p className="site-lead">
          Каждую можно послушать в нормальном темпе и медленно, увидеть, где слова слипаются, и сразу повторить в тренажёре.
        </p>
        {PACKS.map((pack) => (
          <section key={pack.id} className="card-sec">
            <h2>{pack.title}</h2>
            <p className="muted">{pack.blurb}</p>
            <ul className="phrase-links">
              {PHRASES.filter((x) => x.packId === pack.id).map((x) => (
                <li key={x.slug}>
                  <Link href={`/phrase/${x.slug}`}>
                    <b>{x.text}</b>
                    <span>{x.ru}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
      <SiteFooter />
    </div>
  );
}
