import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import SwRegister from "./SwRegister";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Neuro-Fluent Shadow — американское произношение через шэдоуинг", template: "%s · Neuro-Fluent Shadow" },
  description: "Вставляешь любую английскую фразу — слышишь, как её реально говорят американцы, повторяешь следом и получаешь оценку произношения. Разбор беглой речи и каждое слово по-русски.",
  applicationName: "Neuro-Fluent Shadow",
  appleWebApp: { capable: true, title: "NF Shadow", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Neuro-Fluent Shadow",
    title: "Neuro-Fluent Shadow — говори как американцы, а не как учебник",
    description: "Любая фраза: как её реально произносят, разбор склеек и ударений, повтор следом и оценка произношения.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Neuro-Fluent Shadow" }],
  },
  twitter: { card: "summary_large_image" },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    yandex: process.env.YANDEX_VERIFICATION || undefined,
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#fcfbff" };

const YM = process.env.NEXT_PUBLIC_YM_ID;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
        {/* Telegram Mini App support: harmless outside Telegram */}
        <script src="https://telegram.org/js/telegram-web-app.js" async />
      </head>
      <body>
        {children}
        <SwRegister />
        {/* Yandex Metrica, only if NEXT_PUBLIC_YM_ID is set in Vercel */}
        {YM && /^\d+$/.test(YM) && (
          <Script id="ym" strategy="afterInteractive">
            {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${YM},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true});`}
          </Script>
        )}
      </body>
    </html>
  );
}
