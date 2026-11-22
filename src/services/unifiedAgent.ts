import {
  validateUnifiedAgentRequest,
  validateUnifiedAgentResponse,
  type UnifiedAgentRequest,
  type UnifiedAgentResponse,
} from "../agent/unified.ts";
import { visionClientTimeout } from "./vision.ts";
export type UnifiedAgentStatus = {
  available: boolean;
  provider: "gemini";
  model: string;
  reason: string | null;
  timeoutMs: number;
};
export class UnifiedAgentError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.retryable = retryable;
  }
}
async function send(
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
  timeoutMs = 10000,
): Promise<unknown> {
  const abort = new AbortController();
  const cancel = () => abort.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    abort.abort();
  }, timeoutMs);
  try {
    const response = await fetch(path, {
      ...init,
      signal: abort.signal,
      credentials: "same-origin",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON server mentah; divalidasi validateUnifiedAgentResponse.
    let value: any;
    try {
      value = await response.json();
    } catch {
      throw new UnifiedAgentError("Jawaban layanan belum valid. Coba lagi.");
    }
    if (!response.ok)
      throw new UnifiedAgentError(
        value?.error?.message ||
          "Ombak Pintar belum dapat menjawab. Data pemeriksaan tetap utuh.",
        response.status === 429 || response.status >= 500,
      );
    if (abort.signal.aborted)
      throw new UnifiedAgentError("Permintaan dibatalkan.", false);
    return value;
  } catch (error) {
    if (abort.signal.aborted)
      throw new UnifiedAgentError(
        timedOut
          ? "Waktu tunggu jawaban habis. Coba lagi; catatan Anda tidak berubah."
          : "Permintaan dibatalkan.",
        timedOut,
      );
    if (error instanceof UnifiedAgentError) throw error;
    throw new UnifiedAgentError(
      "Layanan belum dapat dihubungi. Panduan dasar tetap tersedia.",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
export async function getUnifiedAgentStatus(
  signal?: AbortSignal,
): Promise<UnifiedAgentStatus> {
  const value = (await send(
    "/api/agent/status",
    {},
    signal,
  )) as UnifiedAgentStatus;
  if (
    !value ||
    typeof value.available !== "boolean" ||
    value.provider !== "gemini" ||
    typeof value.model !== "string" ||
    !(value.reason === null || typeof value.reason === "string")
  )
    throw new UnifiedAgentError("Status layanan belum valid.");
  visionClientTimeout(value.timeoutMs);
  return value;
}
export async function askUnifiedAgent(
  input: UnifiedAgentRequest,
  workspaceId: string | null,
  signal?: AbortSignal,
  configuredTimeoutMs = 60000,
): Promise<UnifiedAgentResponse> {
  let request: UnifiedAgentRequest;
  try {
    request = validateUnifiedAgentRequest(input);
  } catch {
    throw new UnifiedAgentError(
      "Pertanyaan atau konteks belum valid. Tinjau lalu kirim kembali.",
      false,
    );
  }
  const body = await send(
    "/api/agent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BuktiLaut-Agent": "1",
        ...(workspaceId ? { "X-BuktiLaut-Workspace": workspaceId } : {}),
      },
      body: JSON.stringify(request),
    },
    signal,
    visionClientTimeout(configuredTimeoutMs),
  );
  try {
    return validateUnifiedAgentResponse(body, request, workspaceId);
  } catch {
    throw new UnifiedAgentError(
      "Jawaban tidak sesuai dengan ruang kerja atau bukti pemeriksaan saat ini.",
    );
  }
}
