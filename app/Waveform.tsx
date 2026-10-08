"use client";

import { useEffect, useRef, useState } from "react";

/** Loudness envelope of an audio file, as `bins` values 0..1, plus its duration. */
async function envelope(url: string, bins: number): Promise<{ env: number[]; dur: number }> {
  const buf = await (await fetch(url)).arrayBuffer();
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const data = audio.getChannelData(0);
    const size = Math.max(1, Math.floor(data.length / bins));
    const env: number[] = [];
    for (let b = 0; b < bins; b++) {
      let sum = 0;
      const start = b * size;
      for (let i = start; i < start + size && i < data.length; i++) sum += data[i] * data[i];
      env.push(Math.sqrt(sum / size));
    }
    const max = Math.max(...env, 1e-6);
    return { env: env.map((v) => v / max), dur: audio.duration };
  } finally {
    ctx.close().catch(() => {});
  }
}

/** Two loudness shapes on one time axis: the model voice (filled) and you (line). */
export default function Waveform({ modelUrl, userUrl }: { modelUrl: string; userUrl: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [m, u] = await Promise.all([envelope(modelUrl, 220), envelope(userUrl, 220)]);
        if (cancelled || !ref.current) return;
        const c = ref.current;
        const css = getComputedStyle(c);
        const w = c.clientWidth;
        const h = 110;
        const dpr = window.devicePixelRatio || 1;
        c.width = w * dpr;
        c.height = h * dpr;
        const g = c.getContext("2d")!;
        g.scale(dpr, dpr);
        g.clearRect(0, 0, w, h);
        const maxDur = Math.max(m.dur, u.dur, 0.1);
        const mid = h / 2;
        const draw = (e: { env: number[]; dur: number }, fill: boolean, color: string) => {
          const width = (e.dur / maxDur) * w;
          g.beginPath();
          g.moveTo(0, mid);
          e.env.forEach((v, i) => g.lineTo((i / (e.env.length - 1)) * width, mid - v * (mid - 6)));
          if (fill) {
            for (let i = e.env.length - 1; i >= 0; i--) g.lineTo((i / (e.env.length - 1)) * width, mid + e.env[i] * (mid - 6));
            g.closePath();
            g.fillStyle = color;
            g.fill();
          } else {
            g.strokeStyle = color;
            g.lineWidth = 2;
            g.stroke();
          }
        };
        draw(m, true, css.getPropertyValue("--lav").trim() || "#dcd5fa");
        draw(u, false, css.getPropertyValue("--peach-ink").trim() || "#b0532e");
        // second marks
        g.fillStyle = css.getPropertyValue("--muted").trim() || "#77738f";
        g.font = "11px sans-serif";
        for (let s = 1; s < maxDur; s++) g.fillText(`${s}с`, (s / maxDur) * w + 2, h - 2);
      } catch {
        if (!cancelled) setErr("Не получилось нарисовать волну для этой записи.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modelUrl, userUrl]);

  return (
    <div className="wave">
      <div className="wave-legend">
        <span className="lg-model">▮ модель</span>
        <span className="lg-you">— ты</span>
        <span className="wave-hint">Пики = ударные слова. Твои должны совпадать по месту.</span>
      </div>
      <canvas ref={ref} style={{ width: "100%", height: 110 }} />
      {err && <div className="error">{err}</div>}
    </div>
  );
}
