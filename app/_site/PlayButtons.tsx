"use client";

import { useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

/** Two buttons, normal speed and slow, playing pre-generated clips. One plays at a time. */
export default function PlayButtons({ normal, slow }: { normal: string | null; slow: string | null }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [on, setOn] = useState<string | null>(null);

  function play(src: string) {
    if (!audio.current) audio.current = new Audio();
    const a = audio.current;
    if (on === src) {
      a.pause();
      setOn(null);
      return;
    }
    a.src = src;
    a.currentTime = 0;
    a.onended = () => setOn(null);
    a.play().then(() => setOn(src)).catch(() => setOn(null));
  }

  if (!normal && !slow) return null;
  return (
    <div className="chip-row start">
      {normal && (
        <button type="button" className={`chip-btn ${on === normal ? "on" : ""}`} onClick={() => play(normal)}>
          {on === normal ? <Pause size={16} /> : <Play size={16} />} Обычная скорость
        </button>
      )}
      {slow && (
        <button type="button" className={`chip-btn ${on === slow ? "on" : ""}`} onClick={() => play(slow)}>
          {on === slow ? <Pause size={16} /> : <Play size={16} />} Медленно
        </button>
      )}
    </div>
  );
}
