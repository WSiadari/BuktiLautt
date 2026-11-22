import test from "node:test";
import assert from "node:assert/strict";
import {
  getAccountSession,
  loginAccount,
  readArchive,
  saveChatHistory,
  AccountError,
} from "./accounts.ts";
import { askArchiveAgent } from "./archiveAgent.ts";
const session = {
  user: { id: "u1", email: "a@example.test", name: "A" },
  workspaces: [{ id: "w1", name: "Pribadi", kind: "personal", role: "owner" }],
  activeWorkspaceId: "w1",
};
test("account requests use real cookie routes and archive/history scope guards", async () => {
  const original = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify(String(url).includes("login") ? session : { ok: true }),
      { status: 200 },
    );
  };
  try {
    await loginAccount({ email: "a@example.test", password: "long-password" });
    await readArchive("tx 1", undefined, 2, "w1");
    await saveChatHistory("inspection:one", [], 3, undefined, "w1");
    assert.equal(calls[0].init?.credentials, "same-origin");
    assert.equal(
      new Headers(calls[0].init?.headers).get("X-BuktiLaut-Account"),
      "1",
    );
    assert.equal(calls[1].url, "/api/archive/tx%201?revision=2");
    assert.equal(
      new Headers(calls[1].init?.headers).get("X-BuktiLaut-Workspace"),
      "w1",
    );
    assert.equal(
      new Headers(calls[2].init?.headers).get("X-BuktiLaut-Workspace"),
      "w1",
    );
    assert.equal(JSON.parse(calls[2].init?.body as string).baseRevision, 3);
  } finally {
    globalThis.fetch = original;
  }
});
test("invalid account session and explicit conflict reject without fallback identity", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ user: { name: "fake" } }), { status: 200 });
    await assert.rejects(
      () => getAccountSession(),
      (error) =>
        error instanceof AccountError && error.code === "INVALID_RESPONSE",
    );
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: { code: "CONFLICT", message: "Revisi berubah" },
        }),
        { status: 409 },
      );
    await assert.rejects(
      () => readArchive("tx"),
      (error) =>
        error instanceof AccountError &&
        error.status === 409 &&
        error.message === "Revisi berubah",
    );
  } finally {
    globalThis.fetch = original;
  }
});
const answer = {
  requestId: "r1",
  workspaceId: "w1",
  timezone: "Asia/Jakarta",
  fromDate: "2026-11-11",
  toDate: "2026-11-11",
  totalRupiah: 2696300,
  transactionCount: 2,
  draftCount: 1,
  transactions: [
    {
      transactionId: "t1",
      revision: 1,
      transactionDate: "2026-11-11",
      totalRupiah: 2206300,
    },
    {
      transactionId: "t2",
      revision: 2,
      transactionDate: "2026-11-11",
      totalRupiah: 490000,
    },
  ],
  answer: "Dua transaksi terkonfirmasi.",
  provider: { name: "basic", model: "deterministic" },
};
test("archive answer keeps server numbers, sends no client workspace in body, rejects other scope", async () => {
  const original = globalThis.fetch;
  let sent: RequestInit | undefined;
  try {
    globalThis.fetch = async (_url, init) => {
      sent = init;
      return new Response(JSON.stringify(answer), { status: 200 });
    };
    const result = await askArchiveAgent(
      { requestId: "r1", question: "Total 11 November 2026?" },
      "w1",
    );
    assert.equal(result.totalRupiah, 2696300);
    assert.equal(result.transactionCount, 2);
    assert.equal(new Headers(sent?.headers).get("X-BuktiLaut-Workspace"), "w1");
    assert.deepEqual(Object.keys(JSON.parse(sent?.body as string)).sort(), [
      "question",
      "requestId",
    ]);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ ...answer, workspaceId: "foreign" }), {
        status: 200,
      });
    await assert.rejects(() =>
      askArchiveAgent({ requestId: "r1", question: "Total?" }, "w1"),
    );
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          ...answer,
          transactions: [
            { ...answer.transactions[0], totalRupiah: "invented" },
          ],
        }),
        { status: 200 },
      );
    await assert.rejects(() =>
      askArchiveAgent({ requestId: "r1", question: "Total?" }, "w1"),
    );
  } finally {
    globalThis.fetch = original;
  }
});
