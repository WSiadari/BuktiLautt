import test from "node:test";
import assert from "node:assert/strict";
import {
  basicArchiveDateRange,
  runArchiveAgent,
  validateArchiveAgentRequest,
} from "./archive-agent.ts";
import { readConfig } from "./config.ts";
import {
  summarizeArchive,
  type ArchiveRevision,
} from "../src/lib/archiveDomain.ts";
import { demoDraft, row } from "../src/data/demo.ts";
function record(
  transactionId: string,
  amount: number,
  revision = 1,
): ArchiveRevision {
  const draft = demoDraft();
  draft.demo = false;
  draft.weighing = [row("Teri", "1")];
  draft.receipt = [row("Teri", "1", String(amount))];
  draft.weighingConfirmed = draft.receiptConfirmed = true;
  draft.pairs = [
    {
      weighId: draft.weighing[0].id,
      receiptId: draft.receipt[0].id,
      decision: "confirmed",
      adjustment: "",
      explanation: "",
    },
  ];
  return {
    transactionId,
    revision,
    status: "confirmed",
    transactionDate: "2026-11-11",
    transactionDateConfirmed: true,
    draft,
  };
}
const request = {
  requestId: "archive-test",
  question: "Berapa total 11 November 2026?",
};
const enabled = readConfig({
  VISION_ENABLED: "true",
  VISION_DATA_PROCESSING_ACKNOWLEDGED: "true",
  GEMINI_API_KEY: "MOCK_ONLY",
});
const call = (name: string, args: unknown) =>
  Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ functionCall: { name, args } }] },
      },
    ],
  });
test("basic archive reads server summary and latest confirmed transactions once without provider calls", async () => {
  const records = [
    record("complex", 2206300),
    record("simple", 490000),
    { ...record("draft", 123), status: "draft" as const },
  ];
  const access = {
    workspaceId: "session-workspace",
    readSummary: (from: string, to: string) =>
      summarizeArchive(records, from, to),
  };
  const result = await runArchiveAgent(
    request,
    readConfig({}),
    new AbortController().signal,
    access,
    (async () => assert.fail("No external call")) as typeof fetch,
  );
  assert.equal(result.totalRupiah, 2696300);
  assert.equal(result.transactionCount, 2);
  assert.equal(result.draftCount, 1);
  assert.equal(result.provider.name, "basic");
  assert.match(result.answer, /Panduan dasar/);
  records.push(record("complex", 2300000, 2));
  const revised = await runArchiveAgent(
    request,
    readConfig({}),
    new AbortController().signal,
    access,
  );
  assert.equal(revised.totalRupiah, 2790000);
  assert.equal(revised.transactionCount, 2);
  assert.equal(
    revised.transactions.find((item) => item.transactionId === "complex")
      ?.revision,
    2,
  );
});
test("Gemini selects one read-only date tool; server provides all amounts and workspace", async () => {
  const output = await runArchiveAgent(
    request,
    enabled,
    new AbortController().signal,
    {
      workspaceId: "session-only",
      readSummary: (from, to) =>
        summarizeArchive([record("a", 490000)], from, to),
    },
    (async (url, init) => {
      assert.match(
        String(url),
        /^https:\/\/generativelanguage.googleapis.com\/v1beta\/models\/gemini-/u,
      );
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(
        body.toolConfig.functionCallingConfig.allowedFunctionNames,
        ["summarize_archive", "request_date_clarification"],
      );
      assert.doesNotMatch(String(init?.body), /session-only|490000|MOCK_ONLY/);
      return call("summarize_archive", {
        fromDate: "2026-11-11",
        toDate: "2026-11-11",
      });
    }) as typeof fetch,
  );
  assert.equal(output.workspaceId, "session-only");
  assert.equal(output.provider.name, "gemini");
  assert.match(output.answer, /Rp490\.000/);
});
test("archive tool denies injected workspace, writes, malformed dates and multiple calls before lookup", async () => {
  const access = {
    workspaceId: "safe",
    readSummary: () => assert.fail("Unauthorized lookup"),
  };
  for (const [name, args] of [
    ["write_archive", {}],
    [
      "summarize_archive",
      { fromDate: "2026-11-11", toDate: "2026-11-11", workspaceId: "other" },
    ],
    ["summarize_archive", { fromDate: ["2026-11-11"], toDate: "2026-11-11" }],
    ["summarize_archive", { fromDate: "2026-11-12", toDate: "2026-11-11" }],
  ] as const) {
    await assert.rejects(
      runArchiveAgent(
        request,
        enabled,
        new AbortController().signal,
        access,
        (async () => call(name, args)) as typeof fetch,
      ),
    );
  }
  await assert.rejects(
    runArchiveAgent(
      request,
      enabled,
      new AbortController().signal,
      access,
      (async () =>
        Response.json({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  { functionCall: { name: "summarize_archive", args: {} } },
                  { functionCall: { name: "summarize_archive", args: {} } },
                ],
              },
            },
          ],
        })) as typeof fetch,
    ),
    { code: "INVALID_OUTPUT" },
  );
  assert.throws(
    () => validateArchiveAgentRequest({ ...request, workspaceId: "other" }),
    { code: "INVALID_INPUT" },
  );
});
test("archive distinguishes no transactions, zero total, unknown total and WIB dates", async () => {
  for (const [records, pattern] of [
    [[], /Tidak ada transaksi/],
    [[record("zero", 0)], /Rp0 dari 1/],
    [
      [
        {
          ...record("unknown", 490000),
          draft: { ...record("unknown", 490000).draft, charges: "" },
        },
      ],
      /total belum diketahui/,
    ],
  ] as const) {
    const result = await runArchiveAgent(
      request,
      readConfig({}),
      new AbortController().signal,
      {
        workspaceId: "w",
        readSummary: (from, to) => summarizeArchive([...records], from, to),
      },
    );
    assert.match(result.answer, pattern);
  }
  assert.equal(
    basicArchiveDateRange("hari ini", new Date("2026-11-10T20:00:00Z"))
      .fromDate,
    "2026-11-11",
  );
  assert.deepEqual(basicArchiveDateRange("2026-11-11 sampai 2026-11-12"), {
    fromDate: "2026-11-11",
    toDate: "2026-11-12",
  });
  for (const question of [
    "besok",
    "31 Februari 2026",
    "2026-11-12 sampai 2026-11-11",
    "berapa total?",
  ])
    assert.throws(() => basicArchiveDateRange(question));
});
test("archive failure output is bounded and never substitutes basic after provider error", async () => {
  const access = {
    workspaceId: "w",
    readSummary: () => assert.fail("No query after provider failure"),
  };
  await assert.rejects(
    runArchiveAgent(
      request,
      enabled,
      new AbortController().signal,
      access,
      (async () => new Response("SECRET", { status: 429 })) as typeof fetch,
    ),
    (error) => {
      assert.equal((error as { code: string }).code, "RATE_LIMITED");
      assert.doesNotMatch(String(error), /SECRET/);
      return true;
    },
  );
  await assert.rejects(
    runArchiveAgent(
      request,
      enabled,
      new AbortController().signal,
      access,
      (async () => new Response("x".repeat(32769))) as typeof fetch,
    ),
    { code: "INVALID_OUTPUT" },
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    runArchiveAgent(request, enabled, controller.signal, access),
  );
});
