// Ready-made phrase packs. Edit freely: add a pack or a phrase and redeploy.

export type Pack = { id: string; icon: string; title: string; blurb: string; phrases: string[] };

export const PACKS: Pack[] = [
  {
    id: "standup",
    icon: "☕",
    title: "Дейлик",
    blurb: "Чтобы на стендапе не звучать как отчёт в Excel",
    phrases: [
      "Yesterday I was working on the login bug, and I think I've got a fix.",
      "Today I'm going to wrap up the API changes and open a PR.",
      "I'm kind of blocked on this until I hear back from the backend team.",
      "Nothing new on my end, just still digging into it.",
      "Can we take that offline? I don't want to hold everyone up.",
      "I'll need a couple of days to get it done, if that's okay.",
      "Sorry, I was on mute. Can you hear me now?",
      "Let me share my screen real quick.",
    ],
  },
  {
    id: "interview",
    icon: "💼",
    title: "Собес",
    blurb: "Для интервью в американскую компанию",
    phrases: [
      "Tell me a little bit about yourself.",
      "I've been working as a backend developer for about five years.",
      "What I'm looking for is a team where I can grow and take on more ownership.",
      "That's a great question. Let me think about it for a second.",
      "I'd probably start by figuring out where the bottleneck is.",
      "We had a pretty tight deadline, so I had to prioritize.",
      "What does a typical day look like for someone on your team?",
      "I'm really excited about this role, and I think I'd be a good fit.",
    ],
  },
  {
    id: "smalltalk",
    icon: "🌤",
    title: "Small talk",
    blurb: "Те самые пять минут до начала созвона",
    phrases: [
      "Hey, how's it going?",
      "Not bad, can't complain. How about you?",
      "Did you get a chance to do anything fun this weekend?",
      "Oh, that sounds awesome. I've been meaning to check that out.",
      "It's been crazy busy lately, to be honest.",
      "What's the weather like over there right now?",
      "I've got to run, but it was really nice catching up.",
      "Let's grab a coffee next time you're in town.",
    ],
  },
  {
    id: "codereview",
    icon: "🧑‍💻",
    title: "Код-ревью вслух",
    blurb: "Когда объясняешь код голосом, а не в комментах",
    phrases: [
      "So what's going on here is we're caching the result to avoid an extra call.",
      "I'm not a hundred percent sure this is going to scale.",
      "Could you walk me through what this function is supposed to do?",
      "We might want to pull this out into a separate service.",
      "It's kind of a hack, but it works for now.",
      "Let's not overthink it. We can always refactor it later.",
      "Did you get a chance to look at my comments?",
      "I think we're good to merge once the tests pass.",
    ],
  },
  {
    id: "slang",
    icon: "🤙",
    title: "Сленг и паразиты",
    blurb: "Like, you know, I mean — без них ты звучишь как диктор",
    phrases: [
      "I mean, it's not the end of the world, you know?",
      "It was, like, the worst meeting ever.",
      "I'm gonna be honest with you, I have no idea.",
      "That's literally what I've been saying for weeks.",
      "Yeah, no, that totally makes sense.",
      "I don't know, it's kind of a gray area.",
      "Dude, you gotta check this out.",
      "Whatever works for you works for me.",
    ],
  },
];

export const ALL_PHRASES = PACKS.flatMap((p) => p.phrases.map((text) => ({ text, pack: p })));

/** Same phrase for everyone on a given day. */
export function phraseOfTheDay(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0).getTime();
  const day = Math.floor((date.getTime() - start) / 86400000) + date.getFullYear() * 400;
  return ALL_PHRASES[day % ALL_PHRASES.length];
}
