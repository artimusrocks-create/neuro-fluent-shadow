import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "../../_site/SiteHeader";
import SiteFooter from "../../_site/SiteFooter";
import PlayButtons from "../../_site/PlayButtons";
import Track from "../../_site/Track";
import { PHRASES, audioFor, loadSentences, loadWords, phraseBySlug } from "@/lib/phrases";
import type { Sentence } from "@/lib/client";

export const dynamicParams = false;
export const generateStaticParams = () => PHRASES.map((p) => ({ slug: p.slug }));

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = phraseBySlug((await params).slug);
  if (!p) return {};
  const fast = loadSentences(p.text)
    .map((s) => s.fast)
    .join(" ");
  const title = `«${p.text}» — как сказать «${p.ru}» по-английски`;
  const description = `Как американцы реально говорят «${p.text}»${fast ? `: в быстрой речи это «${fast}»` : ""}. Склейки, ударения, аудио и разбор каждого слова по-русски.`;
  return { title, description, alternates: { canonical: `/phrase/${p.slug}` }, openGraph: { title, description } };
}

const isLoud = (w: string) => /[A-Z]{2,}/.test(w.replace(/[^A-Za-z]/g, ""));

/** The fast version with the glued pieces ("blobs") highlighted. */
function fastParts(s: Sentence) {
  const blobs = (s.blobs ?? []).map((b) => b.blob).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!blobs.length) return [{ t: s.fast, blob: false }];
  const re = new RegExp("(" + blobs.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "g");
  return s.fast.split(re).map((t, i) => ({ t, blob: i % 2 === 1 }));
}

export default async function PhrasePage({ params }: Props) {
  const p = phraseBySlug((await params).slug);
  if (!p) notFound();
  const sentences = loadSentences(p.text);
  const many = sentences.length > 1;
  const words = sentences.flatMap((s) => loadWords(s.text));
  const blobs = sentences.flatMap((s) => s.blobs ?? []);
  const ruTips = sentences.map((s) => s.ru_tip).filter(Boolean);
  const more = PHRASES.filter((x) => x.packId === p.packId && x.slug !== p.slug);
  const practice = `/?p=${encodeURIComponent(p.text)}`;

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
        {sentences.map((s, i) => (
          <div key={i} className="play-block">
            {many && <p className="muted">«{s.text}»</p>}
            <PlayButtons normal={audioFor(s.text, 1)} slow={audioFor(s.text, 0.75)} />
          </div>
        ))}

        {sentences.length > 0 && (
          <>
            <section className="card-sec">
              <h2>Как это звучит на самом деле</h2>
              {sentences.map((s, i) => (
                <div key={i} className="sentence-block">
                  <p className="fast-show">{fastParts(s).map((x, j) => (x.blob ? <mark key={j}>{x.t}</mark> : <span key={j}>{x.t}</span>))}</p>
                  {s.shadow_tip && <p className="tip-bubble">{s.shadow_tip}</p>}
                </div>
              ))}
            </section>

            <section className="card-sec">
              <h2>Где ударения</h2>
              {sentences.map((s, i) => (
                <p key={i} className="clear-show">
                  {s.clear.split(/\s+/).map((w, j) => (
                    <span key={j}>{isLoud(w) ? <b>{w}</b> : w} </span>
                  ))}
                </p>
              ))}
              <p className="muted">Громкие слова — заглавными. Остальные проговариваются быстро и тихо, почти проглатываются.</p>
            </section>

            {blobs.length > 0 && (
              <section className="card-sec">
                <h2>Склейки</h2>
                <ul className="blobs">
                  {blobs.map((b, i) => (
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

            {ruTips.length > 0 && (
              <section className="card-sec">
                <h2>Где спотыкаются русскоговорящие</h2>
                {ruTips.map((t, i) => (
                  <p key={i}>{t}</p>
                ))}
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
