import {
  validateVisionResult,
  isClassifiedExtraction,
  type VisionRequest, type VisionResult, type VisionStatus, type VisionErrorCode,
} from "../vision/contract.ts";

export class VisionClientError extends Error {
  readonly code: VisionErrorCode;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
  constructor(code: VisionErrorCode, message: string, retryable = false, retryAfterSeconds?: number) {
    super(message);
    this.name = "VisionClientError";
    this.code = code;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
const messages: Record<VisionErrorCode, string> = {
  INVALID_INPUT: "Sumber belum valid. Periksa foto atau teks, lalu coba lagi.",
  INVALID_IMAGE: "Foto tidak dapat dibaca sebagai JPG, PNG, atau WebP. Pilih foto lain atau isi manual.",
  TOO_LARGE: "Sumber terlalu besar. Pilih foto hingga 4 MB atau teks hingga 20.000 karakter.",
  NOT_CONFIGURED: "Layanan AI belum dikonfigurasi. Sumber dan isian tetap tersedia untuk pengisian manual.",
  FORBIDDEN: "Akses layanan AI ditolak. Gunakan alamat aplikasi lokal yang dikonfigurasi.",
  RATE_LIMITED: "Batas pembacaan tercapai. Tunggu sebelum mencoba lagi atau lanjutkan manual.",
  BUSY: "Layanan sedang memproses dokumen lain. Coba lagi sebentar atau isi manual.",
  TIMEOUT: "Layanan AI belum menyelesaikan pembacaan. Sumber dan isian tetap ada. Coba lagi atau isi manual.",
  CANCELLED: "Pembacaan dibatalkan. Sumber dan koreksi Anda tetap dipertahankan.",
  PROVIDER_ERROR: "Gemini sedang tidak tersedia atau gagal memproses sumber. Coba beberapa saat lagi atau isi manual.",
  INVALID_OUTPUT: "Hasil AI tidak memenuhi format pemeriksaan. Isian Anda tetap ada. Coba lagi atau isi manual.",
  EMPTY_RESULT: "Tidak ditemukan baris ikan yang dapat diekstrak. Periksa sumber atau isi manual.",
  NETWORK_ERROR: "Layanan pembacaan belum dapat dihubungi. Periksa koneksi atau isi manual.",
};
function safeError(body: unknown): VisionClientError {
  const error = body && typeof body === "object" && "error" in body ? body.error : null;
  if (!error || typeof error !== "object" || !("code" in error) || typeof error.code !== "string" ||
      !Object.hasOwn(messages, error.code)) {
    return new VisionClientError("PROVIDER_ERROR", messages.PROVIDER_ERROR, true);
  }
  const code = error.code as VisionErrorCode;
  const retryable = "retryable" in error && error.retryable === true;
  const delay = "retryAfterSeconds" in error && typeof error.retryAfterSeconds === "number" &&
    Number.isSafeInteger(error.retryAfterSeconds) && error.retryAfterSeconds >= 0 && error.retryAfterSeconds <= 86400
    ? error.retryAfterSeconds : undefined;
  return new VisionClientError(code, messages[code], retryable, delay);
}

const STATUS_TIMEOUT_MS = 10_000;
const CLIENT_GRACE_MS = 10_000;
export function visionClientTimeout(timeoutMs: number): number {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 180_000) throw new VisionClientError("INVALID_OUTPUT", messages.INVALID_OUTPUT);
  return timeoutMs + CLIENT_GRACE_MS;
}
async function apiRequest(path: string, init: RequestInit, externalSignal?: AbortSignal, timeoutMs = STATUS_TIMEOUT_MS): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (externalSignal?.aborted) cancel();
  externalSignal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(path, { ...init, credentials: "same-origin", signal: controller.signal });
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new VisionClientError("INVALID_OUTPUT", messages.INVALID_OUTPUT); }
    if (!response.ok) throw safeError(body);
    return body;
  } catch (error) {
    if (controller.signal.aborted) {
      const code = timedOut ? "TIMEOUT" : "CANCELLED";
      throw new VisionClientError(code, messages[code], timedOut);
    }
    if (error instanceof VisionClientError) throw error;
    throw new VisionClientError("NETWORK_ERROR", messages.NETWORK_ERROR, true);
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", cancel);
  }
}
export async function extractVision(input: VisionRequest, signal?: AbortSignal, configuredTimeoutMs?: number): Promise<VisionResult> {
  if (signal?.aborted) throw new VisionClientError("CANCELLED", messages.CANCELLED);
  const timeoutMs = configuredTimeoutMs ?? (await getVisionStatus(signal)).timeoutMs;
  const body = await apiRequest("/api/vision", {
    method: "POST", headers: { "Content-Type": "application/json", "X-BuktiLaut-Vision": "1" },
    body: JSON.stringify(input),
  }, signal, visionClientTimeout(timeoutMs));
  try {
    const result = validateVisionResult(body, input);
    if (result.schemaVersion !== 2 || !isClassifiedExtraction(result.raw)) throw new Error("INVALID_OUTPUT");
    return result;
  }
  catch { throw new VisionClientError("INVALID_OUTPUT", messages.INVALID_OUTPUT); }
}
export async function getVisionStatus(signal?: AbortSignal): Promise<VisionStatus> {
  const body = await apiRequest("/api/vision/status", { method: "GET" }, signal);
  if (!body || typeof body !== "object") throw new VisionClientError("INVALID_OUTPUT", messages.INVALID_OUTPUT);
  const value = body as VisionStatus;
  if (typeof value.available !== "boolean" || value.provider !== "gemini" || typeof value.model !== "string" ||
      !(value.reason === null || typeof value.reason === "string") || value.maxImageBytes !== 4 * 1024 * 1024 ||
      value.maxTextCharacters !== 20_000) throw new VisionClientError("INVALID_OUTPUT", messages.INVALID_OUTPUT);
  visionClientTimeout(value.timeoutMs);
  return value;
}
