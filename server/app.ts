import { handleAccountRoute, getAuthenticatedWorkspace, readAuthorizedArchive } from "./account-routes.ts";
import { AccountFailure } from "./accounts/store.ts";
import { queryAuthorizedArchive, readAuthorizedInspection, getAuthorizedWorkspace, analyzeAuthorizedArchive } from "./account-routes.ts";
import { runUnifiedAgent } from "./unified-agent.ts";
import { validateUnifiedAgentRequest } from "../src/agent/unified.ts";
import { runArchiveAgent, validateArchiveAgentRequest } from "./archive-agent.ts";
import { transcribeQuestionWithGemini } from "./question-transcription.ts";
import { runInspectionAgent } from "./inspection-agent.ts";
import {
  validateInspectionAgentRequest,
  MAX_AGENT_BODY_BYTES,
} from "../src/agent/contract.ts";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { buildVisionResult } from "../src/vision/contract.ts";
import { readConfig, requestHostname, unavailableReason, type VisionConfig } from "./config.ts";
import { createFrontendHandler } from "./frontend.ts";
import { safeFailure, VisionError } from "./errors.ts";
import { extractWithGemini } from "./gemini.ts";
import {
  MAX_BODY_BYTES,
  MAX_IMAGE_BYTES,
  MAX_TEXT_CHARACTERS,
  validateInput,
  type ValidInput,
} from "./input.ts";
import {
  buildVoiceResult,
  MAX_VOICE_BYTES,
  MAX_VOICE_SECONDS,
} from "../src/voice/contract.ts";
import { validateVoiceInput, type ValidVoiceInput } from "./voice-input.ts";
import { extractVoiceWithGemini } from "./voice-gemini.ts";

type Extract = (
  input: ValidInput,
  config: VisionConfig,
  signal: AbortSignal,
) => ReturnType<typeof extractWithGemini>;
type ExtractVoice = (
  input: ValidVoiceInput,
  config: VisionConfig,
  signal: AbortSignal,
) => ReturnType<typeof extractVoiceWithGemini>;
function json(response: ServerResponse, status: number, value: unknown) {
  if (response.destroyed) return;
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}
async function readJson(
  request: IncomingMessage,
  limit = MAX_BODY_BYTES,
): Promise<unknown> {
  if (
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      request.headers["content-type"] || "",
    )
  )
    throw new VisionError(
      "INVALID_INPUT",
      415,
      "Permintaan harus berupa JSON.",
    );
  if (
    request.headers["content-encoding"] &&
    request.headers["content-encoding"] !== "identity"
  )
    throw new VisionError(
      "INVALID_INPUT",
      415,
      "Encoding permintaan tidak didukung.",
    );
  const declaredLength = Number(request.headers["content-length"] || 0);
  if (declaredLength > limit) {
    request.resume();
    throw new VisionError(
      "TOO_LARGE",
      413,
      "Ukuran permintaan melebihi batas.",
    );
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > limit)
      throw new VisionError(
        "TOO_LARGE",
        413,
        "Ukuran permintaan melebihi batas.",
      );
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new VisionError("INVALID_INPUT", 400, "JSON permintaan tidak valid.");
  }
}
export function createVisionServer({
  config = readConfig(),
  extract = extractWithGemini,
  extractVoice = extractVoiceWithGemini,
  runAgent = runInspectionAgent,
  runUnified = runUnifiedAgent,
  frontendRoot,
}: {
  config?: VisionConfig;
  extract?: Extract;
  extractVoice?: ExtractVoice;
  runAgent?: typeof runInspectionAgent;
  runUnified?: typeof runUnifiedAgent;
  /** Folder hasil build Vite (dist/). Bila diisi, halaman dan API dilayani dari satu alamat. */
  frontendRoot?: string;
} = {}) {
  const serveFrontend = frontendRoot ? createFrontendHandler(frontendRoot) : null;
  const inFlight = new Set<string>();
  const recent: number[] = [];
  let day = "";
  let dailyRequests = 0;
  let active = 0;
  const server = createServer(async (request, response) => {
    const controller = new AbortController();
    const cancelOnDisconnect = () => {
      if (!response.writableEnded) controller.abort();
    };
    response.once("close", cancelOnDisconnect);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let accepted = false;
    let requestIdentity: string | undefined;
    let ownsIdentity = false;
    try {
      const hostname = requestHostname(request.headers.host || "");
      if (!hostname || !config.allowedHosts.includes(hostname))
        throw new VisionError(
          "FORBIDDEN",
          403,
          "Host layanan tidak diizinkan.",
        );
      // Halaman statis hanya dilayani setelah host lolos; rute /api tetap ke bawah.
      if (serveFrontend && await serveFrontend(request, response)) return;
      if (/^\/api\/(?:account(?:\/|$)|workspaces(?:\/|$)|team(?:\/|$)|archive(?:\/|$)|chats(?:\/|$))/.test((request.url || "").split("?")[0])) {
        if (await handleAccountRoute(request, response, config)) return;
      }
      if (request.url === "/api/vision/status" && request.method === "GET") {
        const reason = unavailableReason(config);
        json(response, 200, {
          available: reason === null,
          provider: "gemini",
          model: config.model,
          reason,
          maxImageBytes: MAX_IMAGE_BYTES,
          maxTextCharacters: MAX_TEXT_CHARACTERS,
          timeoutMs: config.timeoutMs,
        });
        return;
      }
      if (request.url === "/api/voice/status" && request.method === "GET") {
        const reason = unavailableReason(config);
        json(response, 200, {
          available: reason === null,
          provider: "gemini",
          model: config.model,
          reason,
          timeoutMs: config.timeoutMs,
          acceptedMimeTypes: ["audio/wav"],
          maxAudioBytes: MAX_VOICE_BYTES,
          maxDurationSeconds: MAX_VOICE_SECONDS,
        });
        return;
      }
      if (
        (request.url === "/api/inspection-agent/status" || request.url === "/api/agent/status") &&
        request.method === "GET"
      ) {
        const reason = unavailableReason(config);
        json(response, 200, {
          available: reason === null,
          provider: "gemini",
          model: config.model,
          reason,
          timeoutMs: config.timeoutMs,
        });
        return;
      }
      const isArchiveAgent = request.url === "/api/archive-agent";
      const isUnified = request.url === "/api/agent";
      const isQuestion = request.url === "/api/voice/question";
      const isAgent = request.url === "/api/inspection-agent";
      const isVoice = request.url === "/api/voice";
      if (
        (!isUnified && !isArchiveAgent && !isQuestion && !isAgent && !isVoice && request.url !== "/api/vision") ||
        request.method !== "POST"
      ) {
        json(response, 404, {
          error: {
            code: "INVALID_INPUT",
            message: "Rute tidak tersedia.",
            retryable: false,
          },
        });
        return;
      }
      if (
        !config.allowedOrigins.includes(request.headers.origin || "") ||
        request.headers[
          (isUnified || isAgent || isArchiveAgent)
            ? "x-buktilaut-agent"
            : (isVoice || isQuestion)
              ? "x-buktilaut-voice"
              : "x-buktilaut-vision"
        ] !== "1" ||
        request.headers["sec-fetch-site"] === "cross-site"
      )
        throw new VisionError(
          "FORBIDDEN",
          403,
          "Asal permintaan tidak diizinkan.",
        );
      const unavailable = unavailableReason(config);
      if (unavailable && !isArchiveAgent && !isUnified)
        throw new VisionError("NOT_CONFIGURED", 503, unavailable);
      const archiveIdentity = isArchiveAgent ? getAuthenticatedWorkspace(request) : null;
      let unifiedIdentity: ReturnType<typeof getAuthenticatedWorkspace> | null = null;
      if (isUnified) {
        try { unifiedIdentity = getAuthenticatedWorkspace(request); }
        catch (error) {
          if (!(error instanceof AccountFailure) || error.status !== 401 || request.headers["x-buktilaut-workspace"]) throw error;
        }
      }
      if (archiveIdentity && request.headers["x-buktilaut-workspace"] && request.headers["x-buktilaut-workspace"] !== archiveIdentity.workspaceId) throw new AccountFailure(409,"WORKSPACE_CHANGED","Ruang kerja berubah. Tanyakan kembali pada ruang kerja aktif.");
      const current = Date.now();
      const today = new Date(current).toISOString().slice(0, 10);
      if (day !== today) {
        day = today;
        dailyRequests = 0;
      }
      while (recent.length && recent[0] <= current - 60_000) recent.shift();
      if (dailyRequests >= config.requestsPerDay)
        throw new VisionError(
          "RATE_LIMITED",
          429,
          "Batas pemakaian harian layanan tercapai. Gunakan isi manual.",
          false,
          86400,
        );
      if (recent.length >= config.requestsPerMinute)
        throw new VisionError(
          "RATE_LIMITED",
          429,
          "Terlalu banyak permintaan. Tunggu sebelum mencoba lagi.",
          true,
          Math.ceil((recent[0] + 60_000 - current) / 1000),
        );
      if (active >= config.maxConcurrency)
        throw new VisionError(
          "BUSY",
          503,
          "Layanan sedang memproses dokumen lain. Coba lagi sebentar.",
          true,
          5,
        );
      // Bound all decodes and provider calls together; malformed calls consume the minute budget too.
      active++;
      accepted = true;
      recent.push(current);
      timeout = setTimeout(
        () => controller.abort(new Error("timeout")),
        config.timeoutMs,
      );
      if (
        (isUnified || isAgent || isArchiveAgent) &&
        Number(request.headers["content-length"] || 0) > MAX_AGENT_BODY_BYTES
      )
        throw new VisionError(
          "TOO_LARGE",
          413,
          "Konteks pemeriksaan terlalu besar.",
        );
      const body = await readJson(
        request,
        (isUnified || isAgent || isArchiveAgent) ? MAX_AGENT_BODY_BYTES : MAX_BODY_BYTES,
      );
      if (
        (isUnified || isAgent || isArchiveAgent) &&
        Buffer.byteLength(JSON.stringify(body)) > MAX_AGENT_BODY_BYTES
      )
        throw new VisionError(
          "TOO_LARGE",
          413,
          "Konteks pemeriksaan terlalu besar.",
        );
      let agentInput;
      let archiveInput;
      let unifiedInput;
      try {
        agentInput = isAgent ? validateInspectionAgentRequest(body) : null;
        archiveInput = isArchiveAgent ? validateArchiveAgentRequest(body) : null;
        unifiedInput = isUnified ? validateUnifiedAgentRequest(body) : null;
      } catch {
        throw new VisionError(
          "INVALID_INPUT",
          400,
          "Konteks pemeriksaan atau pertanyaan belum valid.",
        );
      }
      const voiceInput = isVoice || isQuestion ? validateVoiceInput(body) : null;
      const visionInput = isVoice || isQuestion || isUnified || isAgent || isArchiveAgent ? null : await validateInput(body);
      if (controller.signal.aborted)
        throw new VisionError("CANCELLED", 499, "Permintaan dibatalkan.");
      requestIdentity =
        unifiedInput?.requestId ?? archiveInput?.requestId ?? agentInput?.requestId ?? (voiceInput || visionInput)!.request.requestId;
      if (inFlight.has(requestIdentity))
        throw new VisionError("BUSY", 409, "Permintaan ini sedang diproses.");
      inFlight.add(requestIdentity);
      ownsIdentity = true;
      if (!unavailable) dailyRequests++;
      let result: unknown;
      if (unifiedInput) {
        const scope = unifiedIdentity;
        const checkScope = () => {
          const current = getAuthenticatedWorkspace(request);
          if (!scope || current.userId !== scope.userId || current.workspaceId !== scope.workspaceId)
            throw new AccountFailure(409, "WORKSPACE_CHANGED", "Ruang kerja berubah. Tanyakan kembali pada ruang kerja aktif.");
        };
        result = await runUnified(unifiedInput, config, controller.signal, {
          workspace: scope ? getAuthorizedWorkspace(request) : null,
          queryArchive: query => { checkScope(); return queryAuthorizedArchive(request, query); },
          readInspection: reference => { checkScope(); return readAuthorizedInspection(request, reference); },
          analyzeArchive: range => { checkScope(); return analyzeAuthorizedArchive(request, range); },
        });
        if (scope) checkScope();
      } else if (archiveInput && archiveIdentity) {
        result = await runArchiveAgent(archiveInput,config,controller.signal,{workspaceId:archiveIdentity.workspaceId,readSummary:(from,to)=>{
          const fresh=getAuthenticatedWorkspace(request);
          if(fresh.workspaceId!==archiveIdentity.workspaceId || fresh.userId!==archiveIdentity.userId) throw new AccountFailure(409,"WORKSPACE_CHANGED","Ruang kerja berubah sebelum jawaban selesai.");
          return readAuthorizedArchive(request,from,to);
        }});
      } else if (isQuestion && voiceInput) {
        result = await transcribeQuestionWithGemini(voiceInput,config,controller.signal);
      } else if (agentInput) {
        result = await runAgent(agentInput, config, controller.signal);
      } else if (voiceInput) {
        const output = await extractVoice(
          voiceInput,
          config,
          controller.signal,
        );
        result = buildVoiceResult(output.raw, voiceInput.request, output.model);
      } else {
        const output = await extract(visionInput!, config, controller.signal);
        result = buildVisionResult(
          output.raw,
          visionInput!.request,
          output.model,
        );
      }
      if (controller.signal.aborted)
        throw new VisionError("CANCELLED", 499, "Permintaan dibatalkan.");
      json(response, 200, result);
    } catch (error) {
      if (error instanceof AccountFailure) {json(response,error.status,{error:{code:error.code,message:error.message,retryable:false}});return;}
      const failure = controller.signal.aborted
        ? new VisionError(
            controller.signal.reason?.message === "timeout"
              ? "TIMEOUT"
              : "CANCELLED",
            504,
            "Layanan AI belum menyelesaikan pembacaan. Sumber dan isian tetap tersedia. Coba lagi atau isi manual.",
            true,
          )
        : safeFailure(error);
      if (failure.retryAfterSeconds)
        response.setHeader("Retry-After", String(failure.retryAfterSeconds));
      json(response, failure.status, {
        error: {
          code: failure.code,
          message: failure.message,
          retryable: failure.retryable,
          ...(failure.retryAfterSeconds
            ? { retryAfterSeconds: failure.retryAfterSeconds }
            : {}),
        },
      });
    } finally {
      if (timeout) clearTimeout(timeout);
      if (accepted) active--;
      if (requestIdentity && ownsIdentity) inFlight.delete(requestIdentity);
      response.removeListener("close", cancelOnDisconnect);
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5000;
  return server;
}
