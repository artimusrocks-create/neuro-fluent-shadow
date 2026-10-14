// Ready-made phrase packs. Edit freely: add a pack or a phrase and redeploy.

export type Pack = {
  id: string;
  title: string;
  blurb: string;
  emoji: string; // the card's icon
  sample: string; // shown in the card's chat bubble
  fast: string; // its fast version, shown under the bubble
  colors: [string, string, string]; // card gradient: glow 1, glow 2, base
  phrases: string[];
  notes?: Record<string, string>; // a line under a phrase in practice, e.g. which film it's from
  featured?: boolean; // shown first and wide on the first screen (a new topic)
};

export const PACKS: Pack[] = [
  {
    id: "cafe",
    emoji: "☕",
    title: "В кафе и ресторане",
    blurb: "Заказать, попросить счёт, уточнить",
    sample: "Can I get a coffee to go?",
    fast: "kinai geda coffee",
    colors: ["#ffe8b0", "#ffc9b0", "#ffd9c2"],
    phrases: [
      "Can I get a coffee to go?",
      "Could we get the check, please?",
      "I'll have what she's having.",
      "Is it okay if we sit outside?",
      "Can I get that without onions?",
      "We're still deciding, give us a minute.",
      "Could I get a glass of water?",
      "Everything was great, thank you.",
    ],
  },
  {
    id: "travel",
    emoji: "✈️",
    title: "Аэропорт и путешествия",
    blurb: "Регистрация, такси, отель",
    sample: "Where do I check in?",
    fast: "wheredai check in",
    colors: ["#c8e7ff", "#d9d0ff", "#cfe0ff"],
    phrases: [
      "Where do I check in for this flight?",
      "Is this the line for security?",
      "Could you help me with my bag?",
      "How long does it take to get downtown?",
      "I have a reservation under Mikhailov.",
      "What time is checkout?",
      "Can you call me a cab?",
      "Is breakfast included?",
    ],
  },
  {
    id: "smalltalk",
    emoji: "💬",
    title: "Small talk",
    blurb: "Те самые пять минут ни о чём",
    sample: "Hey, how's it going?",
    fast: "hey, howzit going",
    colors: ["#d3f1e4", "#fff1a8", "#dff5e9"],
    phrases: [
      "Hey, how's it going?",
      "Not bad, can't complain. How about you?",
      "Did you do anything fun this weekend?",
      "Oh, that sounds awesome.",
      "It's been crazy busy lately, to be honest.",
      "What do you do for a living?",
      "I've got to run, but it was nice catching up.",
      "Let's grab a coffee sometime.",
    ],
  },
  {
    id: "dating",
    emoji: "🍷",
    title: "Знакомства и свидания",
    blurb: "Познакомиться, пригласить, поболтать",
    sample: "Do you wanna grab a drink?",
    fast: "dyuh wanna grab a drink",
    colors: ["#ffd3e2", "#e2d4ff", "#f9dbe8"],
    phrases: [
      "Hi, I don't think we've met. I'm Artem.",
      "So how do you know everyone here?",
      "Do you want to grab a drink sometime?",
      "I had a really good time tonight.",
      "What kind of music are you into?",
      "Are you free this Saturday?",
      "Can I get your number?",
      "Text me when you get home.",
    ],
  },
  {
    id: "calls",
    emoji: "💻",
    title: "Работа и созвоны",
    blurb: "Для звонков и встреч на английском",
    sample: "Sorry, you're on mute.",
    fast: "sorry, yer on mute",
    colors: ["#dcd5fa", "#c8e7ff", "#e3ddff"],
    phrases: [
      "Sorry, you're on mute.",
      "Can you hear me okay?",
      "Let me share my screen real quick.",
      "Can we push this to next week?",
      "I'll follow up with an email.",
      "Sorry, could you say that again?",
      "I think we're running out of time.",
      "Thanks, everyone. Talk soon.",
    ],
  },
  {
    id: "shops",
    emoji: "🛍️",
    title: "Магазины и сервис",
    blurb: "Купить, вернуть, спросить",
    sample: "I'm just looking, thanks.",
    fast: "aim jus lookin, thanks",
    colors: ["#fff1a8", "#d3f1e4", "#fbf3c9"],
    phrases: [
      "I'm just looking, thanks.",
      "Do you have this in a medium?",
      "Can I try this on?",
      "I'd like to return this, please.",
      "Do you take cards?",
      "Could I get a bag, please?",
      "Is this on sale?",
      "Where can I find the shampoo?",
    ],
  },
  {
    id: "shows",
    emoji: "🎬",
    title: "Как в сериалах",
    blurb: "Живые реакции, которые слышишь в кино",
    sample: "You gotta be kidding me.",
    fast: "yuh gotta be kiddin me",
    colors: ["#e2d4ff", "#ffc9b0", "#ecdfff"],
    phrases: [
      "You gotta be kidding me.",
      "I don't know what you're talking about.",
      "What are you doing here?",
      "Let me get this straight.",
      "I told you so.",
      "It's not what it looks like.",
      "We need to talk.",
      "Are you out of your mind?",
    ],
  },
  {
    id: "slang",
    emoji: "🤙",
    title: "Сленг и словечки",
    blurb: "Like, you know, I mean",
    sample: "I mean, it's whatever.",
    fast: "ai mean, its whatever",
    colors: ["#c8f0ec", "#ffe8b0", "#d6f3ef"],
    phrases: [
      "I mean, it's not a big deal, you know?",
      "It was, like, the best day ever.",
      "I'm gonna be honest with you.",
      "That's literally what I said.",
      "Yeah, no, that totally makes sense.",
      "I'm kinda tired, to be honest.",
      "Dude, you gotta see this.",
      "Whatever works for you.",
    ],
  },
  {
    id: "movies",
    emoji: "🍿",
    title: "Фразы из фильмов",
    blurb: "Культовые реплики, как их говорят актёры",
    sample: "You're gonna need a bigger boat.",
    fast: "yergonna needa bigger boat",
    colors: ["#ffd9c2", "#e2d4ff", "#fbe3d6"],
    featured: true,
    phrases: [
      "I'll be back.",
      "Houston, we have a problem.",
      "You're gonna need a bigger boat.",
      "Say hello to my little friend!",
      "I'm gonna make him an offer he can't refuse.",
      "You can't handle the truth!",
      "You're goddamn right.",
      "You know what they call a Quarter Pounder with Cheese in Paris?",
    ],
    notes: {
      "I'll be back.": "🎬 «Терминатор», 1984",
      "Houston, we have a problem.": "🎬 «Аполлон-13», 1995",
      "You're gonna need a bigger boat.": "🎬 «Челюсти», 1975",
      "Say hello to my little friend!": "🎬 «Лицо со шрамом», 1983",
      "I'm gonna make him an offer he can't refuse.": "🎬 «Крёстный отец», 1972",
      "You can't handle the truth!": "🎬 «Несколько хороших парней», 1992",
      "You're goddamn right.": "🎬 «Во все тяжкие», сериал",
      "You know what they call a Quarter Pounder with Cheese in Paris?": "🎬 «Криминальное чтиво», 1994",
    },
  },
];

export const packGradient = (p: Pack) =>
  `radial-gradient(circle at 20% 20%, ${p.colors[0]} 0, transparent 55%), radial-gradient(circle at 90% 80%, ${p.colors[1]} 0, transparent 55%), ${p.colors[2]}`;

export const ALL_PHRASES = PACKS.flatMap((p) => p.phrases.map((text) => ({ text, pack: p })));

const dayNumber = (date: Date) => {
  const start = new Date(date.getFullYear(), 0, 0).getTime();
  return Math.floor((date.getTime() - start) / 86400000) + date.getFullYear() * 400;
};

/** Same phrase for everyone on a given day. */
export function phraseOfTheDay(date = new Date()) {
  return ALL_PHRASES[dayNumber(date) % ALL_PHRASES.length];
}

/** «Начать тренировку»: today's phrase first, then the rest of its pack. Ready-made, nothing to invent. */
export function todaysSession(date = new Date()) {
  const potd = phraseOfTheDay(date);
  return { pack: potd.pack, texts: [potd.text, ...potd.pack.phrases.filter((t) => t !== potd.text)] };
}

/** One-sentence pack phrases: each has exactly one pre-made clip, so a channel post can carry its audio. */
const SINGLE_SENTENCE = ALL_PHRASES.filter((p) => !/[.!?…]["»”]?\s+\S/.test(p.text.trim()));

/** The phrase the Telegram channel gets today. */
export function channelPhraseOfTheDay(date = new Date()) {
  return SINGLE_SENTENCE[dayNumber(date) % SINGLE_SENTENCE.length];
}
