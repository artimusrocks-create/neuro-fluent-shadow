// The voices students can pick. All three are ElevenLabs stock voices that ElevenLabs itself labels
// "American" (en-US), so every option models the same General American accent.
// Stock voices are maintained by ElevenLabs and can't be withdrawn by a third party, unlike Voice Library voices.
// Changing the default voice or the engine below? Run `npx tsx scripts/bake.ts` so the phrase packs
// get pre-made audio again (the content test fails until you do).
export type Voice = { id: string; name: string; note: string };

export const VOICES: Voice[] = [
  // "Standard American accent… crisp diction… highly intelligible" (ElevenLabs' description)
  { id: "hpp4J3VqNfWAUOO0d1Us", name: "Белла", note: "Женский · чёткий" },
  // "A smooth tenor pitch from a man in his 40s"
  { id: "cjVigY5qzO86Huf0OWal", name: "Эрик", note: "Мужской · мягкий" },
  // "Natural and real, this down-to-earth voice"
  { id: "iP95p4xoKVk53GoZ742B", name: "Крис", note: "Мужской · разговорный" },
];
export const DEFAULT_VOICE = VOICES[0].id;
export const isKnownVoice = (id: string) => VOICES.some((v) => v.id === id);
/** A saved choice that no longer exists (a removed voice) falls back to the default voice. */
export const pickVoice = (id?: string | null) => (id && isKnownVoice(id) ? id : DEFAULT_VOICE);

/**
 * One voice engine for every clip, live and pre-made.
 * Flash v2.5 replaces Turbo v2.5, which ElevenLabs retired: same model family, lower latency, half the price.
 * Settings are tuned for zero accent drift: steady delivery (stability 0.5), close to the original
 * speaker (similarity 0.8 + speaker boost), no style exaggeration, and the language locked to English.
 */
export const TTS = {
  model: "eleven_flash_v2_5",
  language: "en",
  settings: { stability: 0.5, similarity_boost: 0.8, style: 0, use_speaker_boost: true },
};

/** Changes whenever the engine changes, so audio made with older settings is never reused. */
export const TTS_TAG = [TTS.model, TTS.language, TTS.settings.stability, TTS.settings.similarity_boost, TTS.settings.style].join("/");

/** Request body for ElevenLabs text-to-speech, shared by the live route and the bake script. */
export function ttsBody(text: string, speed: number) {
  return {
    text,
    model_id: TTS.model,
    // ElevenLabs doesn't accept a language lock on Multilingual v2, only on the v2.5 and newer models.
    ...(TTS.model.startsWith("eleven_multilingual") ? {} : { language_code: TTS.language }),
    voice_settings: { ...TTS.settings, speed },
  };
}
