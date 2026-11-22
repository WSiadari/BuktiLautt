import { useEffect, useState } from "react";
import { OmbakPintar, type OmbakMood } from "./OmbakPintar";

// Saat memuat, Ombak "berekspresi bebas": berganti suasana tiap beberapa detik.
const moods: OmbakMood[] = ["welcome", "thinking", "positive", "processing"];

export function BootScene() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(
      () => setIndex((value) => (value + 1) % moods.length),
      1600,
    );
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="boot-scene" aria-hidden="true">
      <OmbakPintar mood={moods[index]} size="hero" />
      <svg className="boot-wave" viewBox="0 0 240 40" preserveAspectRatio="none">
        <path d="M0 22c20-10 40-10 60 0s40 10 60 0 40-10 60 0 40 10 60 0v18H0z" />
      </svg>
      <span className="boot-dots">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}
