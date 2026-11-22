import type { VoiceRequest } from "../voice/contract.ts";
import { getVoiceStatus, VoiceClientError } from "./voice.ts";
import { visionClientTimeout } from "./vision.ts";
export type VoiceQuestionResult = Pick<
  VoiceRequest,
  "requestId" | "sourceId" | "sourceRevision"
> & { transcript: string };
export async function transcribeQuestion(
  input: VoiceRequest,
  signal?: AbortSignal,
  configuredTimeoutMs?: number,
): Promise<VoiceQuestionResult> {
  if (signal?.aborted) throw new VoiceClientError("CANCELLED");
  const timeoutMs =
    configuredTimeoutMs ?? (await getVoiceStatus(signal)).timeoutMs;
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, visionClientTimeout(timeoutMs));
  try {
    const response = await fetch("/api/voice/question", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-BuktiLaut-Voice": "1" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new VoiceClientError("INVALID_OUTPUT");
    }
    if (!response.ok) {
      const error =
        body && typeof body === "object" && "error" in body ? body.error : null;
      const code =
        error && typeof error === "object" && "code" in error
          ? error.code
          : null;
      const allowed = [
        "INVALID_INPUT",
        "INVALID_AUDIO",
        "UNSUPPORTED_AUDIO",
        "AUDIO_TOO_LONG",
        "TOO_LARGE",
        "NOT_CONFIGURED",
        "FORBIDDEN",
        "RATE_LIMITED",
        "BUSY",
        "TIMEOUT",
        "PROVIDER_ERROR",
        "INVALID_OUTPUT",
      ] as const;
      throw new VoiceClientError(
        allowed.find((item) => item === code) ?? "PROVIDER_ERROR",
        undefined,
        response.status === 429 || response.status >= 500,
      );
    }
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length !== 4 ||
      !("requestId" in body) ||
      body.requestId !== input.requestId ||
      !("sourceId" in body) ||
      body.sourceId !== input.sourceId ||
      !("sourceRevision" in body) ||
      body.sourceRevision !== input.sourceRevision ||
      !("transcript" in body) ||
      typeof body.transcript !== "string" ||
      body.transcript.length > 4000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(body.transcript)
    )
      throw new VoiceClientError("INVALID_OUTPUT");
    if (controller.signal.aborted)
      throw new VoiceClientError(timedOut ? "TIMEOUT" : "CANCELLED");
    return body as VoiceQuestionResult;
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
    signal?.removeEventListener("abort", abort);
  }
}
