import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "../../_site/SiteHeader";
import SiteFooter from "../../_site/SiteFooter";
import PlayButtons from "../../_site/PlayButtons";
import Track from "../../_site/Track";
import { PHRASES, audioFor, loadSentence, loadWords, phraseBySlug } from "@/lib/phrases";

export const dynamicParams = false;
export const generateStaticParams = () => PHRASES.map((p) => ({ slug: p.slug }));

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = phraseBySlug((await params).slug);
  if (!p) return {};
  const s = loadSentence(p.text);
  const title = `«${p.text}» — как сказать «${p.ru}» по-английски`;
  const description = `Как американцы реально говорят «${p.text}»${s ? `: в быстрой речи это «${s.fast}»` : ""}. Склейки, ударения, аудио и разбор каждого слова по-русски.`;
  return { title, description, alternates: { canonical: `/phrase/${p.slug}` }, openGraph: { title, description } };
}

const isLoud = (w: string) => /[A-Z]{2,}/.test(w.replace(/[^A-Za-z]/g, ""));

export default async function PhrasePage({ params }: Props) {
  const p = phraseBySlug((await params).slug);
  if (!p) notFound();
  const s = loadSentence(p.text);
  const words = loadWords(p.text);
  const more = PHRASES.filter((x) => x.packId === p.packId && x.slug !== p.slug);
  const practice = `/?p=${encodeURIComponent(p.text)}`;

  // Highlight the glued pieces ("blobs") inside the fast version.
  const blobs = (s?.blobs ?? []).map((b) => b.blob).filter(Boolean).sort((a, b) => b.length - a.length);
  const fastParts =
    s && blobs.length
      ? s.fast.split(new RegExp("(" + blobs.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "g")).map((t, i) => ({ t, blob: i % 2 === 1 }))
      : [{ t: s?.fast ?? "", blob: false }];

  return (
    <div className="site">
      <Track event="seo" />
      <SiteHeader cta="Тренировать" href={practice} />
      <main className="site-main">
        <nav className="crumbs" aria-label="Навигация">
          <Link href="/phrases">Все фразы</Link> <span aria-hidden>›</span> <span>{p.packTitle}</span>
        </nav>
        <h1 className="phrase-h1">«{p.text}»</h1>
        {p.ru && <p className="phrase-ru">{p.ru}</p>}
        <PlayButtons normal={audioFor(s?.text ?? p.text, 1)} slow={audioFor(s?.text ?? p.text, 0.75)} />

        {s && (
          <>
            <section className="card-sec">
              <h2>Как это звучит на самом деле</h2>
              <p className="fast-show">
                {fastParts.map((x, i) => (x.blob ? <mark key={i}>{x.t}</mark> : <span key={i}>{x.t}</span>))}
              </p>
              {s.shadow_tip && <p className="tip-bubble">{s.shadow_tip}</p>}
            </section>

            <section className="card-sec">
              <h2>Где ударения</h2>
              <p className="clear-show">
                {s.clear.split(/\s+/).map((w, i) => (
                  <span key={i}>{isLoud(w) ? <b>{w}</b> : w} </span>
                ))}
              </p>
              <p className="muted">Громкие слова — заглавными. Остальные проговариваются быстро и тихо, почти проглатываются.</p>
            </section>

            {s.blobs?.length > 0 && (
              <section className="card-sec">
                <h2>Склейки</h2>
                <ul className="blobs">
                  {s.blobs.map((b, i) => (
                    <li key={i}>
                      <span className="w">{b.written}</span>
                      <span className="arrow">→</span>
                      <span className="b">{b.blob}</span>
                      <span className="r">{b.rule}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {s.ru_tip && (
              <section className="card-sec">
                <h2>Где спотыкаются русскоговорящие</h2>
                <p>{s.ru_tip}</p>
              </section>
            )}
          </>
        )}

        {words.length > 0 && (
          <section className="card-sec">
            <h2>Каждое слово</h2>
            <div className="table-wrap">
              <table className="word-table">
                <thead>
                  <tr>
                    <th scope="col">Слово</th>
                    <th scope="col">Звучит</th>
                    <th scope="col">По-русски</th>
                  </tr>
                </thead>
                <tbody>
                  {words.map((w, i) => (
                    <tr key={i}>
                      <td>
                        <b>{w.word}</b>
                      </td>
                      <td>
                        <code>{w.sound}</code>
                      </td>
                      <td>
                        {w.ru}
                        {(w.note || w.nuance) && <div className="muted">{w.note || w.nuance}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="cta-box">
          <h2>Повтори вслух и получи оценку</h2>
          <p>Тренажёр сыграет фразу, даст паузу повторить и сравнит твою запись с образцом.</p>
          <Link className="wide-btn" href={practice}>
            Тренировать эту фразу
          </Link>
        </section>

        {more.length > 0 && (
          <section className="card-sec">
            <h2>Ещё из набора «{p.packTitle}»</h2>
            <ul className="phrase-links">
              {more.map((x) => (
                <li key={x.slug}>
                  <Link href={`/phrase/${x.slug}`}>
                    <b>{x.text}</b>
                    <span>{x.ru}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
