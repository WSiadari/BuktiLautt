import test from "node:test";
import assert from "node:assert/strict";
import { createVisionServer } from "./app.ts";
import { readConfig } from "./config.ts";
import type { UnifiedAgentResponse } from "../src/agent/unified.ts";

test("unified HTTP boundary binds tools to session, rejects forged scope and cancels stale workspace access", async () => {
  process.env.BUKTILAUT_ACCOUNT_DB_PATH = ":memory:";
  let calls = 0;
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const start = new Promise<void>(resolve => { started = resolve; });
  const server = createVisionServer({ config: readConfig({ VISION_ENABLED: "false", VISION_REQUESTS_PER_MINUTE: "30" }),
    runUnified: async (request, _config, _signal, access) => {
      calls++;
      if (request.question === "hold") { started(); await waiting; await access.queryArchive({}); }
      return { requestId: request.requestId, kind: "help", answer: "Petunjuk sintetis HTTP", workspaceId: access.workspace?.id ?? null,
        workspaceName: access.workspace?.name ?? null, inspection: null, transactions: [], aggregate: null,
        clarification: false, provider: { name: "basic", model: "test-only" } } satisfies UnifiedAgentResponse;
    },
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = (path: string, body: unknown, cookie = "", extra: Record<string, string> = {}) => fetch(base + path, {
    method: "POST", headers: { Origin: "http://127.0.0.1:5173", "Content-Type": "application/json", "X-BuktiLaut-Agent": "1", "X-BuktiLaut-Account": "1", Cookie: cookie, ...extra }, body: JSON.stringify(body),
  });
  try {
    const question = { requestId: "unified-http", question: "Bagaimana mengunggah nota?" };
    const guest = await post("/api/agent", question);
    assert.equal(guest.status, 200); assert.equal((await guest.json()).workspaceId, null);
    assert.equal((await post("/api/agent", { ...question, workspaceId: "forged" })).status, 400);
    assert.equal((await post("/api/agent", question, "", { Origin: "https://outsider.invalid" })).status, 403);
    assert.equal((await post("/api/agent", question, "", { "X-BuktiLaut-Agent": "" })).status, 403);
    assert.equal(calls, 1);
    const registered = await post("/api/account/register", { email: "unified-route@example.invalid", name: "Uji Sintetis", password: "synthetic-password-only" });
    assert.equal(registered.status, 200);
    const cookie = registered.headers.get("set-cookie")!.split(";")[0];
    const session = await registered.json();
    const auth = await post("/api/agent", question, cookie, { "X-BuktiLaut-Workspace": session.activeWorkspaceId });
    assert.equal(auth.status, 200); assert.equal((await auth.json()).workspaceId, session.activeWorkspaceId);
    assert.equal((await post("/api/agent", question, cookie, { "X-BuktiLaut-Workspace": "outside" })).status, 409);
    const pending = post("/api/agent", { requestId: "hold-query", question: "hold" }, cookie, { "X-BuktiLaut-Workspace": session.activeWorkspaceId });
    await start;
    assert.equal((await post("/api/workspaces", { name: "Tim Sintetis" }, cookie)).status, 200);
    release(); assert.equal((await pending).status, 409);
    assert.equal((await post("/api/account/logout", {}, cookie)).status, 200);
    assert.equal((await post("/api/agent", question, cookie, { "X-BuktiLaut-Workspace": session.activeWorkspaceId })).status, 401);
  } finally {
    release(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
