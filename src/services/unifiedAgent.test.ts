import test from "node:test";
import assert from "node:assert/strict";
import {
  askUnifiedAgent,
  getUnifiedAgentStatus,
  UnifiedAgentError,
} from "./unifiedAgent.ts";
const request = {
  requestId: "unified-test-1",
  question: "Bagaimana memakai BuktiLaut?",
};
const answer = {
  requestId: request.requestId,
  kind: "help",
  answer: "Tinjau sumber lalu konfirmasikan form.",
  workspaceId: "workspace-1",
  workspaceName: "Tim uji",
  inspection: null,
  transactions: [],
  aggregate: null,
  clarification: false,
  provider: { name: "basic", model: "deterministic" },
};
test("one unified client sends minimal validated request with scopeguard and accepts serverbasic", async () => {
  const old = globalThis.fetch;
  let sent: RequestInit | undefined;
  let path = "";
  globalThis.fetch = async (url, init) => {
    path = String(url);
    sent = init;
    return Response.json(answer);
  };
  try {
    const result = await askUnifiedAgent(request, "workspace-1");
    assert.equal(path, "/api/agent");
    assert.equal(result.provider.name, "basic");
    assert.equal(
      new Headers(sent?.headers).get("X-BuktiLaut-Workspace"),
      "workspace-1",
    );
    assert.equal(new Headers(sent?.headers).get("X-BuktiLaut-Agent"), "1");
    assert.equal(sent?.credentials, "same-origin");
    assert.deepEqual(JSON.parse(sent?.body as string), request);
  } finally {
    globalThis.fetch = old;
  }
});
test("unified client rejects staleidentity, foreignworkspace and malformednumeric payload", async () => {
  const old = globalThis.fetch;
  try {
    for (const bad of [
      { ...answer, requestId: "old" },
      { ...answer, workspaceId: "other" },
      { ...answer, aggregate: { totalRupiah: 900000 } },
    ]) {
      globalThis.fetch = async () => Response.json(bad);
      await assert.rejects(
        () => askUnifiedAgent(request, "workspace-1"),
        (error) => error instanceof UnifiedAgentError,
      );
    }
  } finally {
    globalThis.fetch = old;
  }
});
test("disabledGemini status isvalidbasic fallback and cancellation cannot deliver lateJSON", async () => {
  const old = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json({
        available: false,
        provider: "gemini",
        model: "disabled",
        reason: "Belum aktif",
        timeoutMs: 30000,
      });
    assert.equal((await getUnifiedAgentStatus()).available, false);
    const controller = new AbortController();
    globalThis.fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => {
          controller.abort();
          return answer;
        },
      }) as Response;
    await assert.rejects(
      () => askUnifiedAgent(request, "workspace-1", controller.signal),
      (error) => error instanceof UnifiedAgentError && !error.retryable,
    );
  } finally {
    globalThis.fetch = old;
  }
});
