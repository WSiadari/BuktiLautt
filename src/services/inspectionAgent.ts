import {
  validateInspectionAgentRequest,
  validateInspectionAgentResponse,
  type InspectionAgentRequest,
  type InspectionAgentStatus,
} from "../agent/contract.ts";
import { visionClientTimeout } from "./vision.ts";
export class InspectionAgentError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
  ) {
    super(message);
  }
}
async function send(
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
  timeout = 10000,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON server mentah; pemanggil memvalidasi dengan kontrak agent.
): Promise<any> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, timeout);
  try {
    const response = await fetch(path, {
      ...init,
      signal: controller.signal,
      credentials: "same-origin",
    });
    const body = await response.json();
    if (!response.ok)
      throw new InspectionAgentError(
        response.status === 429
          ? "Batas pertanyaan tercapai. Tunggu atau gunakan Panduan dasar."
          : "Layanan penjelasan belum tersedia. Coba lagi atau gunakan Panduan dasar.",
      );
    return body;
  } catch (error) {
    if (error instanceof InspectionAgentError) throw error;
    throw new InspectionAgentError(
      controller.signal.aborted
        ? "Permintaan dibatalkan atau waktu tunggu habis. Draf tetap utuh."
        : "Layanan belum dapat dihubungi. Panduan dasar tetap tersedia.",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
export async function getInspectionAgentStatus(
  signal?: AbortSignal,
): Promise<InspectionAgentStatus> {
  const status = await send("/api/inspection-agent/status", {}, signal);
  if (
    typeof status.available !== "boolean" ||
    status.provider !== "gemini" ||
    typeof status.model !== "string" ||
    !(status.reason === null || typeof status.reason === "string")
  )
    throw new InspectionAgentError("Status layanan belum valid.");
  visionClientTimeout(status.timeoutMs);
  return status;
}
export async function askInspectionAgent(
  input: InspectionAgentRequest,
  signal?: AbortSignal,
  timeoutMs?: number,
) {
  const request = validateInspectionAgentRequest(input);
  const timeout =
    timeoutMs ?? (await getInspectionAgentStatus(signal)).timeoutMs;
  const body = await send(
    "/api/inspection-agent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-BuktiLaut-Agent": "1" },
      body: JSON.stringify(request),
    },
    signal,
    visionClientTimeout(timeout),
  );
  try {
    return validateInspectionAgentResponse(body, request);
  } catch {
    throw new InspectionAgentError(
      "Jawaban tidak sesuai bukti atau revisi pemeriksaan. Coba lagi.",
    );
  }
}
