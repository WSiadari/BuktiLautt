import type { VoiceErrorCode } from "../src/voice/contract.ts";

export class VisionError extends Error {
  readonly code: VoiceErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
  constructor(
    code: VoiceErrorCode,
    status: number,
    message: string,
    retryable = false,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
export function safeFailure(error: unknown): VisionError {
  return error instanceof VisionError
    ? error
    : new VisionError(
        "PROVIDER_ERROR",
        502,
        "Layanan AI gagal memproses sumber. Coba lagi atau isi manual.",
        true,
      );
}
