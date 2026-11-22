import {
  MAX_VOICE_BYTES,
  MAX_VOICE_SECONDS,
  MIN_VOICE_SECONDS,
  VOICE_SAMPLE_RATE,
  type VoiceRequest,
} from "../src/voice/contract.ts";
import { VisionError } from "./errors.ts";

export type ValidVoiceInput = {
  request: VoiceRequest;
  audio: { mimeType: "audio/wav"; data: string };
  durationSeconds: number;
};
const invalidAudio = () =>
  new VisionError(
    "INVALID_AUDIO",
    400,
    "Rekaman kosong atau tidak dapat dibaca. Rekam kembali atau gunakan teks.",
  );
export function validateVoiceInput(value: unknown): ValidVoiceInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalidAudio();
  const input = value as Record<string, unknown>;
  const keys = ["requestId", "sourceId", "sourceRevision", "audioDataUrl"];
  if (
    Object.keys(input).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(input, key))
  )
    throw invalidAudio();
  for (const key of ["requestId", "sourceId", "sourceRevision"]) {
    if (
      typeof input[key] !== "string" ||
      !/^[a-zA-Z0-9_.:-]{1,160}$/.test(input[key])
    )
      throw new VisionError(
        "INVALID_INPUT",
        400,
        "Identitas rekaman belum valid.",
      );
  }
  if (typeof input.audioDataUrl !== "string") throw invalidAudio();
  if (!input.audioDataUrl.startsWith("data:audio/wav;base64,"))
    throw new VisionError(
      "UNSUPPORTED_AUDIO",
      415,
      "Format rekaman belum didukung. Gunakan konversi WAV di browser atau isi manual.",
    );
  const match = /^data:audio\/wav;base64,([A-Za-z0-9+/]+={0,2})$/.exec(
    input.audioDataUrl,
  );
  if (!match || match[1].length % 4 !== 0) throw invalidAudio();
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length > MAX_VOICE_BYTES)
    throw new VisionError(
      "TOO_LARGE",
      413,
      "Rekaman melebihi batas 2 MB. Rekam lebih singkat.",
    );
  if (
    bytes.length < 44 ||
    bytes.toString("base64") !== match[1] ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WAVE" ||
    bytes.readUInt32LE(4) !== bytes.length - 8
  )
    throw invalidAudio();
  let position = 12;
  let dataStart = -1;
  let dataLength = 0;
  let hasFormat = false;
  let chunks = 0;
  while (position < bytes.length) {
    if (++chunks > 256 || position + 8 > bytes.length) throw invalidAudio();
    const tag = bytes.toString("ascii", position, position + 4);
    const length = bytes.readUInt32LE(position + 4);
    const start = position + 8;
    if (start + length > bytes.length) throw invalidAudio();
    if (tag === "fmt ") {
      if (
        hasFormat ||
        length !== 16 ||
        bytes.readUInt16LE(start) !== 1 ||
        bytes.readUInt16LE(start + 2) !== 1 ||
        bytes.readUInt32LE(start + 4) !== VOICE_SAMPLE_RATE ||
        bytes.readUInt32LE(start + 8) !== VOICE_SAMPLE_RATE * 2 ||
        bytes.readUInt16LE(start + 12) !== 2 ||
        bytes.readUInt16LE(start + 14) !== 16
      )
        throw invalidAudio();
      hasFormat = true;
    }
    if (tag === "data") {
      if (dataStart !== -1 || !length || length % 2 !== 0) throw invalidAudio();
      dataStart = start;
      dataLength = length;
    }
    position = start + length + (length % 2);
    if (position > bytes.length) throw invalidAudio();
  }
  if (!hasFormat || dataStart < 0) throw invalidAudio();
  const durationSeconds = dataLength / (VOICE_SAMPLE_RATE * 2);
  if (durationSeconds > MAX_VOICE_SECONDS)
    throw new VisionError(
      "AUDIO_TOO_LONG",
      413,
      "Rekaman melebihi 30 detik. Rekam lebih singkat.",
    );
  if (durationSeconds < MIN_VOICE_SECONDS) throw invalidAudio();
  let hasSignal = false;
  for (let i = dataStart; i < dataStart + dataLength; i += 2)
    if (bytes.readInt16LE(i) !== 0) {
      hasSignal = true;
      break;
    }
  if (!hasSignal) throw invalidAudio();
  return {
    request: input as VoiceRequest,
    audio: { mimeType: "audio/wav", data: match[1] },
    durationSeconds,
  };
}
