// Public facts about the product, in one place. Change them in Vercel → Settings → Environment Variables.

/** The public address. Set NEXT_PUBLIC_SITE_URL when you connect your own domain. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://neuro-fluent-shadow-faj3.vercel.app").replace(/\/$/, "");

export const CONTACT = {
  telegram: process.env.CONTACT_URL || "https://t.me/rawmeatsalad",
  telegramHandle: "@" + (process.env.CONTACT_URL || "https://t.me/rawmeatsalad").split("/").pop(),
  email: process.env.SUPPORT_EMAIL || "",
};

/** Who runs the service (shown in the terms and privacy policy). Set LEGAL_NAME / LEGAL_ID in Vercel. */
export const LEGAL = {
  name: process.env.LEGAL_NAME || "Артём (Neuro-Fluent), индивидуальный предприниматель, Грузия",
  id: process.env.LEGAL_ID || "",
  country: "Грузия",
};

export const PRICES = {
  stars: Number(process.env.PRO_STARS || 450),
  rub: process.env.PRO_PRICE_RUB || "690 ₽",
  usd: process.env.PRO_PRICE_USD || "$9",
};

export const ANDROID_APK = process.env.NEXT_PUBLIC_APK_URL || "/download/neuro-fluent-shadow.apk";
/** The bot's @username (without @). Defaults to Artem's bot, so no Vercel setting is needed for it. */
export const TELEGRAM_BOT = process.env.TELEGRAM_BOT_USERNAME || process.env.NEXT_PUBLIC_TELEGRAM_BOT || "shadowlearnbot";
