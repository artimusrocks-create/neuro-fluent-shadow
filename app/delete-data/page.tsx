import type { Metadata } from "next";
import SiteHeader from "../_site/SiteHeader";
import SiteFooter from "../_site/SiteFooter";
import DeleteForm from "./DeleteForm";
import { CONTACT } from "@/lib/site";

export const metadata: Metadata = {
  title: "Удалить мои данные",
  description: "Как удалить свои данные из Neuro-Fluent Shadow: прогресс, сохранённые фразы, записи голоса и аккаунт Pro.",
  alternates: { canonical: "/delete-data" },
};

/** Google Play asks for a page like this (Data safety → "how can people request deletion"). */
export default function DeleteData() {
  return (
    <div className="site">
      <SiteHeader />
      <main className="site-main legal">
        <h1 className="site-h1">Удалить мои данные</h1>
        <p className="site-lead">Neuro-Fluent Shadow · тренажёр американского произношения</p>

        <h2>Что удаляется</h2>
        <ul>
          <li>прогресс: серии дней, сохранённые фразы, значки;</li>
          <li>записи голоса, которые ты отправлял преподавателю;</li>
          <li>аккаунт Pro или ученика и твой код доступа.</li>
        </ul>
        <p>
          Записи платежей (дата, сумма, почта) мы храним до 3 лет, потому что этого требует бухгалтерия и споры по оплате. Подписку перед удалением
          стоит отменить, иначе она продолжит списываться.
        </p>

        <h2>Без аккаунта — всё у тебя</h2>
        <p>
          Если ты не покупал Pro и не учишься у Артёма, твои данные лежат только в браузере или в приложении. Удалить их можно самому: настройки
          телефона → Приложения → NF Shadow (или Chrome) → Хранилище → Очистить данные.
        </p>

        <h2>Отправить запрос</h2>
        <p>Оставь почту, Telegram или код доступа, по которым мы найдём твои данные. Удалим в течение 30 дней и напишем, когда готово.</p>
        <DeleteForm />
        <p className="muted">
          Или напиши напрямую в Telegram{" "}
          <a href={CONTACT.telegram} target="_blank" rel="noopener noreferrer">
            {CONTACT.telegramHandle}
          </a>
          {CONTACT.email ? <>, на почту {CONTACT.email}</> : null}.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
