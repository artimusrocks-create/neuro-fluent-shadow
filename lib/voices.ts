// Voices students can pick. IDs come from ElevenLabs → Voices. Add or remove freely.
export type Voice = { id: string; name: string; note: string };

export const VOICES: Voice[] = [
  { id: "Os4ZX8JiIw21ZTNqYl53", name: "Артём", note: "Препод · мужской" },
  { id: "QAmlwgbPtjxpk7u98Qs9", name: "Адам", note: "Мужской · уверенный" },
  { id: "lxYfHSkYm1EzQzGhdbfc", name: "Джессика", note: "Женский · спокойный" },
];

export const DEFAULT_VOICE = VOICES[0].id;
export const isKnownVoice = (id: string) => VOICES.some((v) => v.id === id);
