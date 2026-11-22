import { useEffect, useRef, useState } from "react";

export type OmbakMood =
  | "welcome"
  | "idle"
  | "processing"
  | "thinking"
  | "review"
  | "error"
  | "positive"
  | "empty";
type Props = {
  mood?: OmbakMood;
  size?: "small" | "medium" | "hero";
  animated?: boolean;
  className?: string;
};

/*
 * Ombak Pintar yang hidup.
 * Gambar maskot diletakkan di "panggung" dengan rasio asli (1332 × 1181)
 * sehingga kelopak mata, gelembung, dan bayangan selalu berada di posisi yang sama
 * pada setiap ukuran. Gerak per suasana diatur di theme.css (data-mood) dan
 * otomatis berhenti bila pengguna memilih prefers-reduced-motion.
 */
function Stage({ hero, mood }: { hero: boolean; mood: OmbakMood }) {
  return (
    <span className="ombak-stage">
      <span className="ombak-shadow" />
      <span className="ombak-body">
        <img
          className="ombak-hero-art"
          src="/ombak-main-640.webp"
          alt=""
          loading="eager"
          fetchPriority={hero ? "high" : "auto"}
          decoding="async"
          width={640}
          height={567}
          draggable={false}
        />
        <span className="ombak-lid ombak-lid-near" />
        <span className="ombak-lid ombak-lid-far" />
        <span className="ombak-cheek ombak-cheek-near" />
        <span className="ombak-cheek ombak-cheek-far" />
      </span>
      {(mood === "processing" || mood === "thinking") && (
        <span className="ombak-thought">
          <i />
          <i />
          <i />
        </span>
      )}
      {mood === "positive" && (
        <span className="ombak-sparkles">
          <i />
          <i />
          <i />
        </span>
      )}
      <span className="ombak-bubbles">
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}

export function OmbakPintar({
  mood = "idle",
  size = "small",
  animated = true,
  className = "",
}: Props) {
  // Saat suasana berganti, maskot "bereaksi" singkat (pop) sebelum kembali ke gerak dasarnya.
  const [react, setReact] = useState(0);
  const lastMood = useRef(mood);
  useEffect(() => {
    if (lastMood.current === mood) return;
    lastMood.current = mood;
    setReact((n) => n + 1);
  }, [mood]);
  return (
    <span
      className={`mascot ombak-character ombak-size-${size} ${size === "hero" ? "mascot-main" : ""} ${animated ? "ombak-animated" : "ombak-still"} ${className}`}
      data-mood={mood}
      aria-hidden="true"
    >
      <span key={react} className="ombak-layer ombak-current">
        <Stage hero={size === "hero"} mood={mood} />
      </span>
      {mood === "error" && <span className="ombak-state-mark">!</span>}
    </span>
  );
}
