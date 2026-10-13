import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../_site/SiteHeader";
import SiteFooter from "../_site/SiteFooter";
import PlayButtons from "../_site/PlayButtons";
import StoreHide from "../_site/StoreHide";
import Track from "../_site/Track";
import { audioFor, loadSentence } from "@/lib/phrases";
import { PRICES, TELEGRAM_BOT } from "@/lib/site";

export const metadata: Metadata = {
  title: "Тренажёр американского произношения для русскоговорящих",
  description:
    "Вставляешь любую английскую фразу — слышишь, как её реально говорят, повторяешь следом и получаешь оценку произношения. 5 фраз в день бесплатно, без регистрации.",
  alternates: { canonical: "/start" },
};

const DEMO = "Can I get a coffee to go?";

const FAQ: [string, string][] = [
  ["Что такое шэдоуинг?", "Это когда повторяешь за носителем почти одновременно с ним, как тень. Не «прослушал — повторил», а прямо следом, в том же темпе. Так копируется ритм и склейки, а не только отдельные звуки."],
  ["Это живой голос?", "Нет, это ИИ-голос, сделанный из моего (клон в ElevenLabs), плюс ещё два на выбор. Ритм и склейки проверяются по правилам американской речи. Если какая-то фраза звучит странно — напиши мне, поправлю."],
  ["Как оплатить из России?", "Звёздами в Telegram или российской картой через lava.top. Зарубежные карты тоже подходят."],
  ["Как отменить подписку?", "Звёзды: Настройки Telegram → Telegram Stars → Подписки. Карта: ссылка на отмену есть в письме от lava.top. Доступ остаётся до конца оплаченного месяца."],
  ["Можно вернуть деньги?", "Да, в течение 7 дней после оплаты. Просто напиши мне в Telegram."],
  ["Это заменит уроки?", "Нет. Тренажёр ставит ухо и рот, а свободно говорить всё-таки лучше учиться с живым человеком. Захочешь со мной — пиши, у меня есть групповые занятия."],
];

export default function Landing() {
  const s = loadSentence(DEMO);
  const bot = TELEGRAM_BOT.replace(/^@/, "");
  return (
    <div className="site">
      <Track event="landing" />
      <SiteHeader />
      <main className="site-main">
        <section className="hero-sec">
          <p className="eyebrow-pill">Тренажёр американского произношения</p>
          <h1 className="site-h1 big">Говори как американцы, а не как учебник</h1>
          <p className="site-lead">
            Вставляешь любую фразу — хоть ту, что нужна завтра на созвоне. Тренажёр показывает, как её на самом деле произносят, ты повторяешь следом и
            получаешь оценку. Минут десять в день, и ухо начинает ловить то, что раньше пролетало мимо.
          </p>
          <div className="chip-row start">
            <Link className="wide-btn" href="/">
              Попробовать бесплатно
            </Link>
            {bot && (
              <a className="wide-btn light" href={`https://t.me/${bot}`} target="_blank" rel="noopener noreferrer">
                Открыть в Telegram
              </a>
            )}
            <Link className="wide-btn light" href="/download">
              Скачать на телефон
            </Link>
          </div>
          <p className="muted">5 своих фраз в день бесплатно, готовые наборы — без ограничений. Регистрация не нужна.</p>
        </section>

        {s && (
          <section className="card-sec demo">
            <h2>Вот как это выглядит</h2>
            <p className="demo-line">
              <span className="muted">Фраза:</span> <b>{s.text}</b>
            </p>
            <p className="demo-line">
              <span className="muted">По учебнику:</span> кэн ай гет э кофи ту гоу
            </p>
            <p className="demo-line">
              <span className="muted">В жизни:</span> <mark>{s.fast}</mark>
            </p>
            <PlayButtons normal={audioFor(s.text, 1)} slow={audioFor(s.text, 0.75)} />
            {s.shadow_tip && <p className="tip-bubble">{s.shadow_tip}</p>}
          </section>
        )}

        <section className="card-sec">
          <h2>Как это работает</h2>
          <ol className="steps">
            <li>
              <b>Вставь фразу.</b> Свою или из наборов: кафе, аэропорт, созвоны, свидания, сериалы, сленг.
            </li>
            <li>
              <b>Послушай, как её говорят.</b> Караоке по словам, две скорости и разбор: где ударение, что глотают, что во что слипается.
            </li>
            <li>
              <b>Повтори и получи оценку.</b> Записываешь себя, тренажёр сравнивает с образцом и показывает, какие слова поплыли.
            </li>
          </ol>
        </section>

        <section className="card-sec">
          <h2>Для кого</h2>
          <ul className="pro-list plain">
            <li>Грамматику знаешь, а на слух понимаешь от силы половину.</li>
            <li>На созвонах снова и снова говоришь «sorry, can you repeat».</li>
            <li>Сериалы смотришь с субтитрами — и всё равно не успеваешь.</li>
          </ul>
        </section>

        <StoreHide>
          <section className="card-sec">
            <h2>Сколько стоит</h2>
            <div className="plans">
              <div className="plan">
                <h3>Бесплатно</h3>
                <p className="price">0</p>
                <ul>
                  <li>5 своих фраз в день</li>
                  <li>Все готовые наборы</li>
                  <li>Оценка произношения</li>
                </ul>
              </div>
              <div className="plan pro">
                <h3>Shadow Pro</h3>
                <p className="price">
                  {PRICES.rub} <span>или {PRICES.usd}, или {PRICES.stars} ⭐ в месяц</span>
                </p>
                <ul>
                  <li>25 своих фраз в день</li>
                  <li>Разбор по словам и оценки с запасом</li>
                  <li>Прогресс на всех устройствах</li>
                </ul>
                <Link className="wide-btn" href="/?pro=1">
                  Оформить Pro
                </Link>
              </div>
            </div>
          </section>
        </StoreHide>

        <section className="card-sec">
          <h2>Кто это сделал</h2>
          <p>
            Я Артём — билингв, преподаю английский больше десяти лет, сертификат CELTA от Кембриджа. Neuro-Fluent я делаю для русскоговорящих, которые
            знают грамматику, но теряются в живой речи. В тренажёр собрал то, что годами объясняю на уроках. А ещё веду стендап в Батуми, так что
            занудства тут не будет.
          </p>
        </section>

        <section className="card-sec">
          <h2>Вопросы</h2>
          <div className="faq">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="cta-box">
          <h2>Попробуй на одной фразе</h2>
          <p>Бесплатно и без регистрации. Одна минута — и поймёшь, твоё или нет.</p>
          <Link className="wide-btn" href="/">
            Открыть тренажёр
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
