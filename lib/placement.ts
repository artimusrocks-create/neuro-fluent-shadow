// The level questionnaire (/level): what one finished report looks like, and splitting it for Telegram.

export type Placement = { name: string; contact: string; level: string; report: string; at: string };

export function chunks(text: string, size = 3800): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > size) {
    let cut = rest.lastIndexOf("\n", size);
    if (cut < size / 2) cut = size;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  if (rest) out.push(rest);
  return out;
}

