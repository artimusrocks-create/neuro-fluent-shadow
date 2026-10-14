import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../_site/SiteHeader";
import SiteFooter from "../_site/SiteFooter";
import StoreHide from "../_site/StoreHide";
import { ANDROID_APK, TELEGRAM_BOT } from "@/lib/site";

export const metadata: Metadata = {
  title: "Установить тренажёр на телефон",
  description: "Neuro-Fluent Shadow на Android, iPhone, в Telegram и на компьютере. Один и тот же тренажёр везде.",
  alternates: { canonical: "/download" },
};

export default function Download() {
  const bot = TELEGRAM_BOT.replace(/^@/, "");
  return (
    <div className="site">
      <SiteHeader />
      <main className="site-main">
        <h1 className="site-h1">Установить тренажёр</h1>
        <p className="site-lead">Везде один и тот же тренажёр: что сохранил на телефоне, то и на компьютере (если у тебя Pro или код от преподавателя).</p>

        <StoreHide>
        <section className="card-sec">
          <h2>Android</h2>
          <a className="wide-btn" href={ANDROID_APK} download>
            Скачать приложение (APK)
          </a>
          <ol className="steps">
            <li>Нажми кнопку выше — скачается файл.</li>
            <li>Открой его. Телефон спросит, можно ли ставить приложения из браузера, — разреши.</li>
            <li>Готово: на экране появится иконка NF Shadow.</li>
          </ol>
          <p className="muted">Не хочешь качать файл? Открой этот сайт в Chrome → меню ⋮ → «Установить приложение». Получится то же самое.</p>
        </section>
        </StoreHide>

        <section className="card-sec">
          <h2>iPhone</h2>
          <ol className="steps">
            <li>
              Открой <Link href="/">тренажёр</Link> в Safari.
            </li>
            <li>Нажми «Поделиться» (квадрат со стрелкой вверх).</li>
            <li>Выбери «На экран „Домой“».</li>
          </ol>
        </section>

        {bot && (
          <section className="card-sec">
            <h2>Telegram</h2>
            <p>Открой бота и нажми кнопку «🎧 Тренажёр». Каждое утро бот присылает фразу дня.</p>
            <a className="wide-btn light" href={`https://t.me/${bot}`} target="_blank" rel="noopener noreferrer">
              Открыть @{bot}
            </a>
          </section>
        )}

        <section className="card-sec">
          <h2>Компьютер</h2>
          <p>
            Просто открой <Link href="/">сайт</Link>. В Chrome и Edge справа в адресной строке появится значок установки — так тренажёр откроется в
            отдельном окне.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
