// Keys for pre-generated ("baked") content. Shared by the bake script and the app,
// so both compute the same file name for the same phrase / clip.

function fnv(s: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
const key = (s: string) => fnv(s, 2166136261) + fnv(s, 0x9747b28c);
const norm = (t: string) => t.trim().replace(/\s+/g, " ");

export const textKey = (text: string) => key(norm(text).toLowerCase());
export const clipKey = (text: string, speed: number, voice: string) => key(`${voice}|${speed}|${norm(text)}`);
