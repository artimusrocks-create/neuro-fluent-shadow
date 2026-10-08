"use client";

import { Sentence, WordTiming, splitWords, wordAt } from "./client";

// Renders a vertical 1080×1920 video for Instagram Reels, in the browser:
//   1. "Как в учебнике" — the sentence, karaoke at slow speed
//   2. "Как говорят на самом деле" — the fast respelling with blobs, karaoke at real speed
//   3. Outro card

type Clip = { url: string; words: WordTiming[] };

const W = 1080;
const H = 1920;
const C = {
  bg: "#f4f2fb",
  card: "#ffffff",
  ink: "#2e2a45",
  muted: "#77738f",
  lav: "#dcd5fa",
  lavInk: "#5a4bb5",
  butter: "#fff1a8",
  peach: "#ffe0d2",
  peachInk: "#b0532e",
  mint: "#d3f1e4",
  mintInk: "#2f7a5b",
};
const FONT = "Onest, system-ui, sans-serif";

function pickMime(): string {
  const options = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
  return options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

type Placed = { text: string; x: number; y: number; w: number; size: number; bold: boolean };

/** Lay words out in centered lines. */
function layout(g: CanvasRenderingContext2D, words: { text: string; size: number; bold: boolean }[], top: number, maxW: number, lineH: number): { placed: Placed[]; bottom: number } {
  const lines: Placed[][] = [[]];
  let lineW = 0;
  const gap = 22;
  for (const w of words) {
    g.font = `${w.bold ? 800 : 500} ${w.size}px ${FONT}`;
    const ww = g.measureText(w.text).width;
    if (lineW && lineW + gap + ww > maxW) {
      lines.push([]);
      lineW = 0;
    }
    lines[lines.length - 1].push({ text: w.text, x: lineW ? lineW + gap : 0, y: 0, w: ww, size: w.size, bold: w.bold });
    lineW = lineW ? lineW + gap + ww : ww;
  }
  const placed: Placed[] = [];
  lines.forEach((line, li) => {
    const total = line.length ? line[line.length - 1].x + line[line.length - 1].w : 0;
    const off = (W - total) / 2;
    line.forEach((p) => placed.push({ ...p, x: p.x + off, y: top + li * lineH }));
  });
  return { placed, bottom: top + lines.length * lineH };
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function pill(g: CanvasRenderingContext2D, text: string, y: number, bg: string, fg: string) {
  g.font = `700 44px ${FONT}`;
  const w = g.measureText(text).width + 64;
  roundRect(g, (W - w) / 2, y, w, 84, 42);
  g.fillStyle = bg;
  g.fill();
  g.fillStyle = fg;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, W / 2, y + 44);
  g.textAlign = "left";
}

function drawWords(g: CanvasRenderingContext2D, placed: Placed[], active: number, colorFor: (i: number) => string, hl = C.butter) {
  g.textBaseline = "alphabetic";
  placed.forEach((p, i) => {
    if (i === active) {
      roundRect(g, p.x - 14, p.y - p.size * 0.95, p.w + 28, p.size * 1.3, 18);
      g.fillStyle = hl;
      g.fill();
    }
    g.font = `${p.bold ? 800 : 500} ${p.size}px ${FONT}`;
    g.fillStyle = i === active ? C.ink : colorFor(i);
    g.fillText(p.text, p.x, p.y);
  });
}

async function decode(ctx: AudioContext, url: string) {
  const buf = await (await fetch(url)).arrayBuffer();
  return ctx.decodeAudioData(buf);
}

export async function renderReel(opts: {
  s: Sentence;
  stressed: boolean[];
  slow: Clip;
  fast: Clip;
  onProgress?: (p: number) => void;
}): Promise<{ blob: Blob; ext: string }> {
  const mime = pickMime();
  if (!mime) throw new Error("Этот браузер не умеет записывать видео. Открой в Chrome.");
  try {
    await document.fonts?.load(`800 80px Onest`);
  } catch {}

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;

  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ac = new Ctx();
  const [slowBuf, fastBuf] = await Promise.all([decode(ac, opts.slow.url), decode(ac, opts.fast.url)]);
  const dest = ac.createMediaStreamDestination();

  const words = splitWords(opts.s.text);
  const fastWords = splitWords(opts.s.fast);
  const blobSet = new Set((opts.s.blobs ?? []).map((b) => b.blob));

  const INTRO = 1.0;
  const GAP = 0.9;
  const OUTRO = 2.2;
  const tSlow = INTRO;
  const tFast = tSlow + slowBuf.duration + GAP;
  const tEnd = tFast + fastBuf.duration + OUTRO;

  const stream = canvas.captureStream(30);
  dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));

  if (ac.state === "suspended") await ac.resume();
  const t0 = ac.currentTime + 0.15;
  const play = (buf: AudioBuffer, at: number) => {
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(dest);
    src.start(t0 + at);
  };
  play(slowBuf, tSlow);
  play(fastBuf, tFast);
  rec.start(250);

  // Pre-compute layouts
  const sentenceLayout = layout(
    g,
    words.map((w, i) => ({ text: w, size: opts.stressed[i] ? 86 : 62, bold: !!opts.stressed[i] })),
    760,
    940,
    122
  );
  const fastLayout = layout(
    g,
    fastWords.map((w) => ({ text: w, size: 84, bold: blobSet.has(w.replace(/[^\w']/g, "")) || blobSet.has(w) })),
    640,
    940,
    118
  );
  const smallLayout = layout(
    g,
    words.map((w, i) => ({ text: w, size: opts.stressed[i] ? 54 : 42, bold: !!opts.stressed[i] })),
    fastLayout.bottom + 120,
    940,
    76
  );

  await new Promise<void>((resolve) => {
    const frame = () => {
      const t = ac.currentTime - t0;
      opts.onProgress?.(Math.max(0, Math.min(1, t / tEnd)));
      g.fillStyle = C.bg;
      g.fillRect(0, 0, W, H);
      // brand
      g.font = `700 40px ${FONT}`;
      g.fillStyle = C.lavInk;
      g.textAlign = "center";
      g.textBaseline = "alphabetic";
      g.fillText("NEURO-FLUENT", W / 2, 170);
      g.textAlign = "left";

      if (t < tFast - GAP / 2) {
        pill(g, "🐢 Как в учебнике", 380, C.mint, C.mintInk);
        const i = t >= tSlow ? wordAt(opts.slow.words, t - tSlow) : -1;
        const finished = t > tSlow + slowBuf.duration;
        drawWords(g, sentenceLayout.placed, finished ? -1 : i, (k) => (opts.stressed[k] ? C.ink : C.muted));
      } else if (t < tFast + fastBuf.duration + 0.4) {
        pill(g, "🔥 Как говорят на самом деле", 380, C.peach, C.peachInk);
        const i = t >= tFast ? wordAt(opts.fast.words, t - tFast) : -1;
        // fast respelling: blobs in butter boxes
        fastLayout.placed.forEach((p) => {
          if (p.bold) {
            roundRect(g, p.x - 12, p.y - p.size * 0.92, p.w + 24, p.size * 1.25, 16);
            g.fillStyle = C.butter;
            g.fill();
          }
          g.font = `${p.bold ? 800 : 600} ${p.size}px ${FONT}`;
          g.fillStyle = C.ink;
          g.fillText(p.text, p.x, p.y);
        });
        drawWords(g, smallLayout.placed, i, (k) => (opts.stressed[k] ? C.ink : C.muted), C.lav);
      } else {
        pill(g, "Повтори 3 раза вслух 👇", 700, C.lav, C.lavInk);
        g.textAlign = "center";
        g.font = `800 92px ${FONT}`;
        g.fillStyle = C.ink;
        const fastLine = opts.s.fast.length > 34 ? opts.s.fast.slice(0, 32) + "…" : opts.s.fast;
        g.fillText(fastLine, W / 2, 960);
        g.font = `500 46px ${FONT}`;
        g.fillStyle = C.muted;
        g.fillText("Разбор и озвучка — Neuro-Fluent", W / 2, 1100);
        g.textAlign = "left";
      }

      if (t >= tEnd) return resolve();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  rec.stop();
  await done;
  ac.close().catch(() => {});
  const type = mime.split(";")[0];
  return { blob: new Blob(chunks, { type }), ext: type.includes("mp4") ? "mp4" : "webm" };
}
