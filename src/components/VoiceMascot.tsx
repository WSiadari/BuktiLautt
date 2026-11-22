import { useId } from "react";

export type VoiceMood =
  | "ready"
  | "requesting"
  | "recording"
  | "preparing"
  | "processing"
  | "review"
  | "error";
export function VoiceMascot({ state }: { state: VoiceMood }) {
  const clipId = useId().replaceAll(":", "");
  return (
    <svg
      className="voice-mascot"
      data-voice-mood={state}
      viewBox="0 0 240 216"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <path d="M28 155C70 154 120 145 157 120C179 104 204 101 219 115C238 132 238 154 226 174C212 194 185 206 144 209C96 212 55 205 38 186Z" />
        </clipPath>
      </defs>
      <image href="/ombak-main-640.webp" width="240" height="216" />
      <g clipPath={`url(#${clipId})`}>
        <g className="voice-wave-body">
          <image href="/ombak-main-640.webp" width="240" height="216" />
        </g>
        <path
          className="voice-body-sweep"
          d="M18 170Q92 185 160 141T254 130"
          fill="none"
          stroke="#DCEFFA"
          strokeWidth="5"
          opacity="0"
        />
      </g>
    </svg>
  );
}
