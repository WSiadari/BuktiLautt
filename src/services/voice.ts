import {
  MAX_VOICE_BYTES,
  MAX_VOICE_SECONDS,
  MIN_VOICE_SECONDS,
  VOICE_SAMPLE_RATE,
  validateVoiceResult,
  type VoiceErrorCode,
  type VoiceRequest,
  type VoiceResult,
  type VoiceStatus,
} from "../voice/contract.ts";
import { visionClientTimeout } from "./vision.ts";

const messages: Record<VoiceErrorCode, string> = {
  INVALID_INPUT:
    "Identitas atau isi rekaman belum valid. Rekam ulang atau isi manual.",
  INVALID_IMAGE:
    "Sumber rekaman belum dapat dibaca. Rekam ulang atau isi manual.",
  INVALID_AUDIO:
    "Rekaman kosong atau tidak dapat dibaca. Rekam ulang atau gunakan teks.",
  UNSUPPORTED_AUDIO:
    "Browser belum dapat membuka format rekaman ini. Gunakan teks atau foto.",
  AUDIO_TOO_LONG: "Rekaman melebihi 30 detik. Rekam lebih singkat.",
  TOO_LARGE: "Rekaman terlalu besar. Rekam lebih singkat atau gunakan teks.",
  NOT_CONFIGURED: "Layanan suara belum dikonfigurasi. Gunakan teks atau foto.",
  FORBIDDEN:
    "Akses layanan suara ditolak. Gunakan alamat aplikasi yang dikonfigurasi.",
  RATE_LIMITED:
    "Batas pembacaan tercapai. Tunggu sebelum mencoba lagi atau isi manual.",
  BUSY: "Layanan sedang memproses sumber lain. Coba lagi sebentar atau isi manual.",
  TIMEOUT:
    "Layanan AI belum menyelesaikan rekaman. Coba lagi atau gunakan teks.",
  CANCELLED: "Pemrosesan rekaman dibatalkan. Isian Anda tetap dipertahankan.",
  PROVIDER_ERROR:
    "Layanan belum berhasil memproses rekaman. Coba lagi atau isi manual.",
  INVALID_OUTPUT:
    "Hasil rekaman tidak memenuhi format tinjauan. Coba lagi atau isi manual.",
  EMPTY_RESULT:
    "Belum ada ucapan yang dapat digunakan. Rekam lebih jelas atau gunakan teks.",
  NETWORK_ERROR:
    "Layanan suara belum dapat dihubungi. Periksa koneksi atau isi manual.",
};
export class VoiceClientError extends Error {
  readonly code: VoiceErrorCode;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
  constructor(
    code: VoiceErrorCode,
    message = messages[code],
    retryable = false,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "VoiceClientError";
    this.code = code;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
function checkCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new VoiceClientError("CANCELLED");
}
export function encodeVoiceWav(samples: Float32Array): Uint8Array {
  const duration = samples.length / VOICE_SAMPLE_RATE;
  if (duration > MAX_VOICE_SECONDS)
    throw new VoiceClientError("AUDIO_TOO_LONG");
  if (duration < MIN_VOICE_SECONDS) throw new VoiceClientError("INVALID_AUDIO");
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      bytes[offset + i] = value.charCodeAt(i);
  };
  text(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, VOICE_SAMPLE_RATE, true);
  view.setUint32(28, VOICE_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index++) {
    if (!Number.isFinite(samples[index]))
      throw new VoiceClientError("INVALID_AUDIO");
    const sample = Math.min(1, Math.max(-1, samples[index]));
    view.setInt16(
      44 + index * 2,
      Math.round(sample * (sample < 0 ? 32768 : 32767)),
      true,
    );
  }
  return bytes;
}
export async function prepareVoiceAudio(
  blob: Blob,
  signal?: AbortSignal,
): Promise<{ audioDataUrl: string; durationSeconds: number }> {
  checkCancelled(signal);
  if (!blob.size) throw new VoiceClientError("INVALID_AUDIO");
  if (blob.size > 8 * 1024 * 1024) throw new VoiceClientError("TOO_LARGE");
  if (typeof window === "undefined")
    throw new VoiceClientError("UNSUPPORTED_AUDIO");
  const browser = window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
  };
  const Decoder = browser.AudioContext || browser.webkitAudioContext;
  const Renderer =
    browser.OfflineAudioContext || browser.webkitOfflineAudioContext;
  if (!Decoder || !Renderer) throw new VoiceClientError("UNSUPPORTED_AUDIO");
  let decoder: AudioContext | undefined;
  try {
    const context = new Decoder();
    decoder = context;
    const sourceBytes = await blob.arrayBuffer();
    checkCancelled(signal);
    const decoded = await context.decodeAudioData(sourceBytes);
    checkCancelled(signal);
    if (
      !Number.isFinite(decoded.duration) ||
      decoded.duration < MIN_VOICE_SECONDS
    )
      throw new VoiceClientError("INVALID_AUDIO");
    if (decoded.duration > MAX_VOICE_SECONDS)
      throw new VoiceClientError("AUDIO_TOO_LONG");
    const renderer = new Renderer(
      1,
      Math.round(decoded.duration * VOICE_SAMPLE_RATE),
      VOICE_SAMPLE_RATE,
    );
    const source = renderer.createBufferSource();
    source.buffer = decoded;
    source.connect(renderer.destination);
    source.start();
    const rendered = await renderer.startRendering();
    checkCancelled(signal);
    const wav = encodeVoiceWav(rendered.getChannelData(0));
    if (wav.length > MAX_VOICE_BYTES) throw new VoiceClientError("TOO_LARGE");
    let binary = "";
    for (let position = 0; position < wav.length; position += 32768)
      binary += String.fromCharCode(
        ...wav.subarray(position, position + 32768),
      );
    checkCancelled(signal);
    return {
      audioDataUrl: `data:audio/wav;base64,${btoa(binary)}`,
      durationSeconds: rendered.length / VOICE_SAMPLE_RATE,
    };
  } catch (error) {
    checkCancelled(signal);
    if (error instanceof VoiceClientError) throw error;
    throw new VoiceClientError("UNSUPPORTED_AUDIO");
  } finally {
    if (decoder && decoder.state !== "closed")
      await decoder.close().catch(() => {});
  }
}
function serverError(body: unknown): VoiceClientError {
  const value =
    body && typeof body === "object" && "error" in body ? body.error : null;
  if (
    !value ||
    typeof value !== "object" ||
    !("code" in value) ||
    typeof value.code !== "string" ||
    !Object.hasOwn(messages, value.code)
  )
    return new VoiceClientError("PROVIDER_ERROR", undefined, true);
  const delay =
    "retryAfterSeconds" in value &&
    Number.isSafeInteger(value.retryAfterSeconds) &&
    Number(value.retryAfterSeconds) >= 0 &&
    Number(value.retryAfterSeconds) <= 86400
      ? Number(value.retryAfterSeconds)
      : undefined;
  return new VoiceClientError(
    value.code as VoiceErrorCode,
    undefined,
    "retryable" in value && value.retryable === true,
    delay,
  );
}
async function voiceRequest(
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
  timeoutMs = 10_000,
): Promise<unknown> {
  checkCancelled(signal);
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(path, {
      ...init,
      signal: controller.signal,
      credentials: "same-origin",
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new VoiceClientError("INVALID_OUTPUT");
    }
    if (!response.ok) throw serverError(body);
    return body;
  } catch (error) {
    if (controller.signal.aborted)
      throw new VoiceClientError(
        timedOut ? "TIMEOUT" : "CANCELLED",
        undefined,
        timedOut,
      );
    if (error instanceof VoiceClientError) throw error;
    throw new VoiceClientError("NETWORK_ERROR", undefined, true);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
export async function getVoiceStatus(
  signal?: AbortSignal,
): Promise<VoiceStatus> {
  const body = (await voiceRequest(
    "/api/voice/status",
    { method: "GET" },
    signal,
  )) as VoiceStatus | null;
  if (
    !body ||
    typeof body.available !== "boolean" ||
    body.provider !== "gemini" ||
    typeof body.model !== "string" ||
    !(body.reason === null || typeof body.reason === "string") ||
    !Array.isArray(body.acceptedMimeTypes) ||
    body.acceptedMimeTypes.length !== 1 ||
    body.acceptedMimeTypes[0] !== "audio/wav" ||
    body.maxAudioBytes !== MAX_VOICE_BYTES ||
    body.maxDurationSeconds !== MAX_VOICE_SECONDS
  )
    throw new VoiceClientError("INVALID_OUTPUT");
  try {
    visionClientTimeout(body.timeoutMs);
  } catch {
    throw new VoiceClientError("INVALID_OUTPUT");
  }
  return body;
}
export async function extractVoice(
  input: VoiceRequest,
  signal?: AbortSignal,
  configuredTimeoutMs?: number,
): Promise<VoiceResult> {
  checkCancelled(signal);
  const timeoutMs =
    configuredTimeoutMs ?? (await getVoiceStatus(signal)).timeoutMs;
  const body = await voiceRequest(
    "/api/voice",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-BuktiLaut-Voice": "1" },
      body: JSON.stringify(input),
    },
    signal,
    visionClientTimeout(timeoutMs),
  );
  try {
    return validateVoiceResult(body, input);
  } catch {
    throw new VoiceClientError("INVALID_OUTPUT");
  }
}
