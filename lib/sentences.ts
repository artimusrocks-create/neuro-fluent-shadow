/**
 * Pasted text → practice items, one sentence each. The first one opens at once (voice first, breakdown
 * fills in), and every breakdown stays small, so a long text never runs into the AI's answer-size limit.
 * Line breaks count as sentence ends (subtitles, lyrics, chat logs). Tiny pieces like "Hi!" stay with
 * the next sentence: one thing to practice, one breakdown.
 */
export const MAX_ITEMS = 40;
const MAX_ITEM_CHARS = 300; // the voice takes up to 600 characters; long run-on lines are cut at commas

type SegmenterCtor = new (locale: string, o: { granularity: "sentence" }) => { segment: (t: string) => Iterable<{ segment: string }> };

function sentencesOf(line: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  if (Seg) return Array.from(new Seg("en", { granularity: "sentence" }).segment(line), (x) => x.segment.trim()).filter(Boolean);
  return line.match(/[^.!?…]+(?:[.!?…]+["'»”’)\]]*|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [line];
}

/** A run-on line with no full stops is cut at a comma (or a space) so each piece stays easy to voice and repeat. */
function cut(s: string): string[] {
  const out: string[] = [];
  let rest = s;
  while (rest.length > MAX_ITEM_CHARS) {
    const head = rest.slice(0, MAX_ITEM_CHARS);
    let at = Math.max(head.lastIndexOf(", "), head.lastIndexOf("; "), head.lastIndexOf(": "));
    if (at < MAX_ITEM_CHARS / 3) at = head.lastIndexOf(" ");
    if (at <= 0) at = MAX_ITEM_CHARS - 1;
    out.push(rest.slice(0, at + 1).trim());
    rest = rest.slice(at + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function splitSentences(text: string): string[] {
  const pieces = text
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .flatMap((line) => sentencesOf(line).flatMap(cut));
  const out: string[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const next = pieces[i + 1];
    if (next && words(pieces[i]) < 3 && pieces[i].length + next.length < MAX_ITEM_CHARS) {
      pieces[i + 1] = `${pieces[i]} ${next}`;
      continue;
    }
    out.push(pieces[i]);
  }
  return out;
}
