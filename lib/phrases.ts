// Public phrase pages (/phrases, /phrase/[slug]): built at deploy time from the pre-generated pack content.
// Server-only: reads files from /public/baked.
import fs from "node:fs";
import path from "node:path";
import { PACKS } from "./packs";
import BAKED from "./baked-index.json";
import { clipKey, textKey } from "./bakekey";
import { DEFAULT_VOICE } from "./voices";
import type { Sentence, WordInfo } from "./client";

/** How each pack phrase is said in Russian (for the page title and search). */
export const RU: Record<string, string> = {
  "Can I get a coffee to go?": "Можно кофе с собой?",
  "Could we get the check, please?": "Можно нам счёт, пожалуйста?",
  "I'll have what she's having.": "Мне то же, что и ей.",
  "Is it okay if we sit outside?": "Можно мы сядем на улице?",
  "Can I get that without onions?": "А можно без лука?",
  "We're still deciding, give us a minute.": "Мы ещё выбираем, дайте нам минутку.",
  "Could I get a glass of water?": "Можно стакан воды?",
  "Everything was great, thank you.": "Всё было отлично, спасибо.",
  "Where do I check in for this flight?": "Где регистрация на этот рейс?",
  "Is this the line for security?": "Это очередь на досмотр?",
  "Could you help me with my bag?": "Не поможете с сумкой?",
  "How long does it take to get downtown?": "Сколько ехать до центра?",
  "I have a reservation under Mikhailov.": "У меня бронь на фамилию Михайлов.",
  "What time is checkout?": "Во сколько выезд из номера?",
  "Can you call me a cab?": "Вызовете мне такси?",
  "Is breakfast included?": "Завтрак входит в стоимость?",
  "Hey, how's it going?": "Привет, как дела?",
  "Not bad, can't complain. How about you?": "Нормально, жаловаться не на что. А у тебя?",
  "Did you do anything fun this weekend?": "Как выходные, было что-нибудь интересное?",
  "Oh, that sounds awesome.": "О, звучит круто.",
  "It's been crazy busy lately, to be honest.": "Если честно, в последнее время полный завал.",
  "What do you do for a living?": "Кем ты работаешь?",
  "I've got to run, but it was nice catching up.": "Мне пора бежать, но я рад, что поболтали.",
  "Let's grab a coffee sometime.": "Давай как-нибудь выпьем кофе.",
  "Hi, I don't think we've met. I'm Artem.": "Привет, мы, кажется, не знакомы. Я Артём.",
  "So how do you know everyone here?": "А ты откуда здесь всех знаешь?",
  "Do you want to grab a drink sometime?": "Не хочешь как-нибудь сходить выпить?",
  "I had a really good time tonight.": "Мне очень понравился этот вечер.",
  "What kind of music are you into?": "Какую музыку ты слушаешь?",
  "Are you free this Saturday?": "У тебя есть время в эту субботу?",
  "Can I get your number?": "Дашь свой номер?",
  "Text me when you get home.": "Напиши, как доберёшься до дома.",
  "Sorry, you're on mute.": "Извини, у тебя выключен микрофон.",
  "Can you hear me okay?": "Меня нормально слышно?",
  "Let me share my screen real quick.": "Секунду, сейчас расшарю экран.",
  "Can we push this to next week?": "Можем перенести на следующую неделю?",
  "I'll follow up with an email.": "Я потом скину детали письмом.",
  "Sorry, could you say that again?": "Прости, можешь повторить?",
  "I think we're running out of time.": "Кажется, у нас заканчивается время.",
  "Thanks, everyone. Talk soon.": "Всем спасибо, на связи.",
  "I'm just looking, thanks.": "Я просто смотрю, спасибо.",
  "Do you have this in a medium?": "А есть такое в размере M?",
  "Can I try this on?": "Можно примерить?",
  "I'd like to return this, please.": "Хочу вернуть вот это.",
  "Do you take cards?": "Картой можно?",
  "Could I get a bag, please?": "Можно пакет?",
  "Is this on sale?": "На это есть скидка?",
  "Where can I find the shampoo?": "Где у вас шампуни?",
  "You gotta be kidding me.": "Да ты издеваешься.",
  "I don't know what you're talking about.": "Не понимаю, о чём ты.",
  "What are you doing here?": "Ты что здесь делаешь?",
  "Let me get this straight.": "Стоп, давай по порядку.",
  "I told you so.": "Я же тебе говорил.",
  "It's not what it looks like.": "Это не то, что ты думаешь.",
  "We need to talk.": "Нам надо поговорить.",
  "Are you out of your mind?": "Ты с ума сошёл?",
  "I mean, it's not a big deal, you know?": "Ну то есть ничего страшного, понимаешь?",
  "It was, like, the best day ever.": "Это был, типа, лучший день в жизни.",
  "I'm gonna be honest with you.": "Скажу тебе честно.",
  "That's literally what I said.": "Я буквально это и сказал.",
  "Yeah, no, that totally makes sense.": "Не, ну да, это вполне логично.",
  "I'm kinda tired, to be honest.": "Честно говоря, я что-то устал.",
  "Dude, you gotta see this.": "Чувак, ты должен это увидеть.",
  "Whatever works for you.": "Как тебе удобнее.",
};

export const slugify = (t: string) =>
  t
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export type PhraseEntry = { slug: string; text: string; ru: string; packId: string; packTitle: string };

export const PHRASES: PhraseEntry[] = PACKS.flatMap((p) => p.phrases.map((text) => ({ slug: slugify(text), text, ru: RU[text] ?? "", packId: p.id, packTitle: p.title })));

export const phraseBySlug = (slug: string) => PHRASES.find((p) => p.slug === slug) ?? null;

const BAKED_DIR = path.join(process.cwd(), "public", "baked");
const audioSet = new Set<string>(BAKED.a);

function readJSON<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** All sentences of a pack phrase (a phrase like "Not bad, can't complain. How about you?" is two). */
export function loadSentences(text: string): Sentence[] {
  return readJSON<{ sentences: Sentence[] }>(path.join(BAKED_DIR, "bd", `${textKey(text)}.json`))?.sentences ?? [];
}

export function loadSentence(text: string): Sentence | null {
  return loadSentences(text)[0] ?? null;
}

export function loadWords(text: string): WordInfo[] {
  return readJSON<{ words: WordInfo[] }>(path.join(BAKED_DIR, "wd", `${textKey(text)}.json`))?.words ?? [];
}

/** URL of the pre-generated clip in the default voice, or null if it wasn't baked. */
export function audioFor(text: string, speed: number): string | null {
  const k = clipKey(text, speed, DEFAULT_VOICE);
  return audioSet.has(k) ? `/baked/a/${k}.mp3` : null;
}
