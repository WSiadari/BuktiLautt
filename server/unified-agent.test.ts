import test from "node:test";
import assert from "node:assert/strict";
import {
  runUnifiedAgent,
  selectBasicUnifiedTool,
  UNIFIED_READ_TOOLS,
  UNIFIED_UTILITY_TOOLS,
  type UnifiedAgentAccess,
} from "./unified-agent.ts";
import { readConfig } from "./config.ts";
import {
  queryArchive,
  type ArchiveRevision,
} from "../src/lib/archiveDomain.ts";
import { demoDraft, row } from "../src/data/demo.ts";
import { buildInspectionContext } from "../src/lib/inspectionContext.ts";
import {
  validateUnifiedAgentResponse,
  type UnifiedAgentRequest,
} from "../src/agent/unified.ts";
const config = readConfig({
  VISION_ENABLED: "true",
  VISION_DATA_PROCESSING_ACKNOWLEDGED: "true",
  GEMINI_API_KEY: "MOCK_ONLY",
});

test("explicit counterparty is preserved for basic totals/counts and Gemini cannot omit or replace it", async () => {
  const f = fixture();
  f.records.forEach((item) => {
    item.transactionDate = "2026-11-19";
    if (["transaction-1", "transaction-2"].includes(item.transactionId))
      item.counterpartyName = "Ibu Sari";
  });
  const questions = [
    "Berapa total transaksi dengan Ibu Sari tanggal 19 November 2026?",
    "Ada berapa transaksi dengan Ibu Sari tanggal 19 November 2026?",
  ];
  for (const question of questions) {
    const request = { ...f.request, question };
    assert.equal(
      (selectBasicUnifiedTool(request).args as { counterpartyName: string })
        .counterpartyName,
      "Ibu Sari",
    );
    for (const counterpartyName of [undefined, "Pihak"]) {
      const tool = question.startsWith("Ada")
        ? "count_transactions"
        : "calculate_transaction_totals";
      const answer = await runUnifiedAgent(
        request,
        config,
        signal(),
        f.access,
        model(tool, {
          fromDate: "2026-11-19",
          toDate: "2026-11-19",
          ...(counterpartyName ? { counterpartyName } : {}),
        }),
      );
      assert.equal(answer.aggregate?.transactionCount, 2);
      assert.equal(answer.aggregate?.totalRupiah, 4000);
      assert.ok(
        answer.transactions.every(
          (item) => item.counterpartyName === "Ibu Sari",
        ),
      );
    }
    const basic = await runUnifiedAgent(
      request,
      readConfig({}),
      signal(),
      f.access,
    );
    assert.equal(basic.aggregate?.transactionCount, 2);
    assert.equal(basic.aggregate?.totalRupiah, 4000);
  }
  const ambiguous = await runUnifiedAgent(
    {
      ...f.request,
      question:
        "Berapa total transaksi dengan Ibu Sari atau Ibu Rini tanggal 19 November 2026?",
    },
    config,
    signal(),
    {
      ...f.access,
      queryArchive: () => assert.fail("Ambiguous party must not broaden query"),
    },
    model("calculate_transaction_totals", {
      fromDate: "2026-11-19",
      toDate: "2026-11-19",
    }),
  );
  assert.equal(ambiguous.kind, "clarification");
});

test("dated basic search and Gemini search honor explicit confirmed/draft status", async () => {
  const f = fixture();
  const confirmed = {
    ...f.request,
    question: "Tampilkan transaksi terkonfirmasi tanggal 20 November 2026",
  };
  assert.equal(
    (selectBasicUnifiedTool(confirmed).args as { status: string }).status,
    "confirmed",
  );
  for (const activeConfig of [readConfig({}), config]) {
    const answer = await runUnifiedAgent(
      confirmed,
      activeConfig,
      signal(),
      f.access,
      model("search_archived_transactions", {
        fromDate: "2026-11-20",
        toDate: "2026-11-20",
        status: "all",
      }),
    );
    assert.equal(answer.aggregate?.statusFilter, "confirmed");
    assert.equal(answer.aggregate?.transactionCount, 8);
    assert.ok(answer.transactions.every((item) => item.status === "confirmed"));
    const draftAnswer = await runUnifiedAgent(
      {
        ...f.request,
        question: "Tampilkan transaksi draf tanggal 20 November 2026",
      },
      activeConfig,
      signal(),
      f.access,
      model("search_archived_transactions", {
        fromDate: "2026-11-20",
        toDate: "2026-11-20",
        status: "confirmed",
      }),
    );
    assert.equal(draftAnswer.aggregate?.statusFilter, "draft");
    assert.equal(draftAnswer.aggregate?.transactionCount, 2);
    assert.ok(
      draftAnswer.transactions.every((item) => item.status === "draft"),
    );
  }
  const dottedName = selectBasicUnifiedTool({
    ...f.request,
    question:
      "Tampilkan transaksi dengan PT. Mina Jaya tanggal 20 November 2026",
  });
  assert.equal(
    (dottedName.args as { counterpartyName: string }).counterpartyName,
    "PT. Mina Jaya",
  );
});
function record(index: number, amount: number, revision = 1): ArchiveRevision {
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
    transactionId: `transaction-${index}`,
    reference: `BL-20261120-${String(index).padStart(6, "0")}`,
    revision,
    status: "confirmed",
    transactionDate: "2026-11-20",
    transactionDateConfirmed: true,
    workspaceId: "team-yumi",
    counterpartyName: index <= 2 ? "Pabrik Mina Jaya" : `Pihak ${index}`,
    receiptNumber: `NT-${200 + index}`,
    createdAt: "2026-11-20T01:00:00Z",
    updatedAt: "2026-11-20T01:00:00Z",
    draft,
  };
}
function fixture() {
  const records = Array.from({ length: 10 }, (_, i) =>
    record(i + 1, (i + 1) * 1000),
  );
  records[8].status = records[9].status = "draft";
  records.push(record(1, 2000, 2));
  const reads: unknown[] = [];
  const access: UnifiedAgentAccess = {
    workspace: { id: "team-yumi", name: "yumi", kind: "team" },
    queryArchive(query) {
      reads.push(query);
      return queryArchive(records, query);
    },
    readInspection(reference) {
      reads.push(reference);
      const matches = queryArchive(records, { reference, status: "all" });
      const card = matches.entries[0];
      if (!card) throw Object.assign(new Error("Missing"), { status: 404 });
      const stored = records.find(
        (item) =>
          item.transactionId === card.transactionId &&
          item.revision === card.revision,
      )!;
      return {
        transaction: card,
        inspection: buildInspectionContext(stored.draft),
      };
    },
  };
  const draft = demoDraft();
  draft.receipt[0].kg = "10";
  draft.weighingConfirmed = draft.receiptConfirmed = true;
  draft.pairs = draft.weighing.map((item, index) => ({
    weighId: item.id,
    receiptId: draft.receipt[index].id,
    decision: "confirmed",
    adjustment: "",
    explanation: "",
  }));
  const request: UnifiedAgentRequest = {
    requestId: "unified-test",
    question: "Kenapa Teri selisih 2 kg?",
    inspection: buildInspectionContext(draft),
  };
  return { records, reads, access, request };
}
const response = (name: string, args: unknown) =>
  Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ functionCall: { name, args } }] },
      },
    ],
  });
const model = (name: string, args: unknown) =>
  (async () => response(name, args)) as typeof fetch;
const signal = () => new AbortController().signal;
test("one unified request handles inspection then archive aggregate without separate modes", async () => {
  const f = fixture(),
    finding = f.request.inspection!.findings.find(
      (item) => item.species === "Teri",
    )!;
  const first = await runUnifiedAgent(
    f.request,
    config,
    signal(),
    f.access,
    model("get_inspection_finding", { id: finding.id }),
  );
  assert.equal(first.kind, "inspection");
  assert.match(first.answer, /Selisih awal 2 kg/);
  assert.doesNotMatch(first.answer, /pencurian|kerugian|dibayar/);
  assert.equal(f.reads.length, 0);
  const next = {
    ...f.request,
    question: "Berapa total transaksi tim yumi tanggal 20 November 2026?",
  };
  const second = await runUnifiedAgent(
    next,
    config,
    signal(),
    f.access,
    model("calculate_transaction_totals", {
      fromDate: "2026-11-20",
      toDate: "2026-11-20",
    }),
  );
  assert.equal(second.kind, "aggregate");
  assert.equal(second.aggregate?.transactionCount, 8);
  assert.equal(second.aggregate?.totalRupiah, 37000);
  assert.equal(second.transactions.length, 8);
  assert.equal(
    second.transactions.find((item) => item.transactionId === "transaction-1")
      ?.revision,
    2,
  );
  assert.equal(
    new Set(second.transactions.map((item) => item.reference)).size,
    8,
  );
  assert.deepEqual(
    validateUnifiedAgentResponse(second, next, "team-yumi"),
    second,
  );
});
test("archive search/count preserve ten identities, filters and bounded source pages", async () => {
  const f = fixture();
  const all = await runUnifiedAgent(
    {
      ...f.request,
      question: "Ada berapa transaksi termasuk draf tanggal 20 November 2026?",
    },
    config,
    signal(),
    f.access,
    model("count_transactions", {
      fromDate: "2026-11-20",
      toDate: "2026-11-20",
      status: "all",
      limit: 5,
    }),
  );
  assert.equal(all.aggregate?.transactionCount, 10);
  assert.equal(all.aggregate?.confirmedCount, 8);
  assert.equal(all.aggregate?.draftCount, 2);
  assert.equal(all.aggregate?.hasMore, true);
  assert.equal(all.transactions.length, 5);
  assert.equal(all.aggregate?.totalRupiah, null);
  const search = await runUnifiedAgent(
    { ...f.request, question: "Tampilkan transaksi dengan Pabrik Mina Jaya." },
    config,
    signal(),
    f.access,
    model("search_archived_transactions", {
      counterpartyName: "Pabrik Mina Jaya",
      status: "all",
    }),
  );
  assert.equal(search.transactions.length, 2);
  assert.equal(search.clarification, true);
  assert.ok(
    search.transactions.every(
      (item) => item.counterpartyName === "Pabrik Mina Jaya",
    ),
  );
  const exact = await runUnifiedAgent(
    { ...f.request, question: "Cari transaksi nomor nota NT-208" },
    config,
    signal(),
    f.access,
    model("search_archived_transactions", { receiptNumber: "NT-208" }),
  );
  assert.equal(exact.transactions.length, 1);
  assert.equal(exact.transactions[0].receiptNumber, "NT-208");
});
test("exact archived reference resolves authorized metadata; missing and unauthorized disclose no existence", async () => {
  const f = fixture();
  const result = await runUnifiedAgent(
    { ...f.request, question: "Buka BL-20261120-000002" },
    config,
    signal(),
    f.access,
    model("get_archived_transaction", { reference: "BL-20261120-000002" }),
  );
  assert.equal(result.transactions[0].transactionId, "transaction-2");
  assert.match(result.answer, /BL-20261120-000002/);
  const none = await runUnifiedAgent(
    { ...f.request, question: "Buka BL-20261120-999999" },
    config,
    signal(),
    f.access,
    model("get_archived_transaction", { reference: "BL-20261120-999999" }),
  );
  assert.deepEqual(none.transactions, []);
  assert.match(none.answer, /tidak ditemukan atau belum dapat diakses/);
  const denied = await runUnifiedAgent(
    f.request,
    config,
    signal(),
    {
      ...f.access,
      readInspection: () => {
        throw Object.assign(new Error("SECRET"), { status: 403 });
      },
    },
    model("get_archived_transaction", { reference: "BL-20261120-999999" }),
  );
  assert.equal(denied.answer, none.answer);
});
test("absent fish never substitutes another; duplicates require choice even if model lists findings", async () => {
  const f = fixture();
  f.request.inspection!.findings = f.request.inspection!.findings.filter(
    (item) => item.species === "Tongkol",
  );
  const absent = await runUnifiedAgent(
    { ...f.request, question: "Berapa selisih Teri?" },
    config,
    signal(),
    f.access,
    model("list_inspection_findings", {}),
  );
  assert.equal(absent.answer, "Teri tidak ditemukan di pemeriksaan ini.");
  assert.deepEqual(absent.inspection?.actions, []);
  assert.deepEqual(absent.inspection?.referencedFindingIds, []);
  const duplicate = fixture();
  const original = duplicate.request.inspection!.findings[0];
  duplicate.request.inspection!.findings.push({
    ...structuredClone(original),
    id: "pair:duplicate",
    weighId: "duplicate",
    receiptId: "r-duplicate",
    references: {
      weighing: { kind: "weighing", rowId: "duplicate" },
      receipt: { kind: "receipt", rowId: "r-duplicate" },
      adjustment: { weighId: "duplicate" },
    },
  });
  const answer = await runUnifiedAgent(
    duplicate.request,
    config,
    signal(),
    duplicate.access,
    model("list_inspection_findings", {}),
  );
  assert.equal(answer.clarification, true);
  assert.equal(answer.inspection?.referencedFindingIds.length, 2);
});
test("active pending tasks include verified links; missing active inspection asks clarification", async () => {
  const f = fixture(),
    request = {
      ...f.request,
      question: "Apa yang masih perlu diperiksa sebelum laporan?",
    };
  const answer = await runUnifiedAgent(
    request,
    config,
    signal(),
    f.access,
    model("get_pending_inspection_tasks", { scope: "active" }),
  );
  assert.equal(answer.kind, "inspection");
  assert.match(answer.answer, /selisih terbuka/);
  assert.ok(answer.inspection?.actions.length);
  const none = await runUnifiedAgent(
    { requestId: "no-inspection", question: request.question },
    config,
    signal(),
    f.access,
    model("get_pending_inspection_tasks", { scope: "active" }),
  );
  assert.equal(none.kind, "clarification");
  assert.equal(none.inspection, null);
  const archive = await runUnifiedAgent(
    { ...f.request, question: "Tampilkan draf yang belum selesai" },
    config,
    signal(),
    f.access,
    model("get_pending_inspection_tasks", { scope: "archive" }),
  );
  assert.equal(archive.transactions.length, 2);
  assert.ok(
    archive.transactions.every(
      (item) => item.status === "draft" && item.totalRupiah === null,
    ),
  );
});
test("workspace name mismatch requires explicit switch before provider or archive access", async () => {
  const f = fixture();
  for (const question of [
    "Berapa total transaksi tim lain pada 20 November 2026?",
    "Tampilkan arsip pribadi",
  ]) {
    const answer = await runUnifiedAgent(
      { ...f.request, question },
      config,
      signal(),
      f.access,
      (async () =>
        assert.fail("No provider for foreign scope")) as typeof fetch,
    );
    assert.equal(answer.kind, "switch_workspace");
    assert.deepEqual(answer.transactions, []);
  }
  assert.equal(f.reads.length, 0);
});
test("guest can receive help but archive data require authenticated workspace", async () => {
  const f = fixture(),
    guest = { ...f.access, workspace: null };
  const help = await runUnifiedAgent(
    { requestId: "help", question: "Bagaimana cara mengunggah nota?" },
    config,
    signal(),
    guest,
    model("get_general_help", { topic: "upload_receipt" }),
  );
  assert.equal(help.kind, "help");
  assert.match(help.answer, /persetujuan/);
  assert.equal(f.reads.length, 0);
  const denied = await runUnifiedAgent(
    { requestId: "archive", question: "Total transaksi 20 November 2026?" },
    config,
    signal(),
    guest,
    model("calculate_transaction_totals", {
      fromDate: "2026-11-20",
      toDate: "2026-11-20",
    }),
  );
  assert.equal(denied.kind, "clarification");
  assert.match(denied.answer, /Masuk/);
  assert.equal(f.reads.length, 0);
});
test("tool arguments reject writes, SQL, arbitrary IDs, array coercion, unknown fields and excessive ranges", async () => {
  const f = fixture();
  for (const [name, args] of [
    ["save_transaction", {}],
    ["search_archived_transactions", { workspaceId: "other" }],
    ["search_archived_transactions", { transactionId: "hidden" }],
    ["search_archived_transactions", { sql: "SELECT *" }],
    ["search_archived_transactions", { status: ["confirmed"] }],
    ["search_archived_transactions", { limit: 51 }],
    [
      "search_archived_transactions",
      { fromDate: "2020-01-01", toDate: "2026-01-01" },
    ],
    ["get_inspection_finding", { id: [f.request.inspection!.findings[0].id] }],
    ["get_inspection_finding", { id: f.request.inspection!.findings[1].id }],
    ["get_archived_transaction", { reference: "transaction-1" }],
    ["get_general_help", { topic: "free invented answer" }],
  ] as const)
    await assert.rejects(
      runUnifiedAgent(f.request, config, signal(), f.access, model(name, args)),
      { code: "INVALID_OUTPUT" },
    );
  assert.equal(f.reads.length, 0);
});
test("provider receives only routing metadata; function response bytes/count are bounded and model prose unused", async () => {
  const f = fixture();
  await runUnifiedAgent(f.request, config, signal(), f.access, (async (
    url,
    init,
  ) => {
    assert.match(
      String(url),
      /^https:\/\/generativelanguage.googleapis.com\/v1beta\/models\//u,
    );
    assert.equal(init?.redirect, "error");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.tools[0].functionDeclarations.length, 11);
    assert.equal(UNIFIED_READ_TOOLS.length, 9);
    assert.equal(UNIFIED_UTILITY_TOOLS.length, 2);
    assert.doesNotMatch(
      String(init?.body),
      /weighedKg|receiptKg|remainingKg|data:image|data:audio|source\.image|sessionHash|MOCK_ONLY/,
    );
    return response("get_general_help", { topic: "general" });
  }) as typeof fetch);
  await assert.rejects(
    runUnifiedAgent(
      f.request,
      config,
      signal(),
      f.access,
      (async () => new Response("x".repeat(32769))) as typeof fetch,
    ),
    { code: "INVALID_OUTPUT" },
  );
  await assert.rejects(
    runUnifiedAgent(f.request, config, signal(), f.access, (async () =>
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                { functionCall: { name: "get_active_inspection", args: {} } },
                {
                  functionCall: {
                    name: "get_general_help",
                    args: { topic: "general" },
                  },
                },
              ],
            },
          },
        ],
      })) as typeof fetch),
    { code: "INVALID_OUTPUT" },
  );
  await assert.rejects(
    runUnifiedAgent(f.request, config, signal(), f.access, (async () =>
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: "Invented total Rp999999" }] },
          },
        ],
      })) as typeof fetch),
    { code: "INVALID_OUTPUT" },
  );
});
test("temporary failure retries at most three total with1s/2s waits, 429 and long Retry-After never retry", async () => {
  const f = fixture(),
    waits: number[] = [];
  let calls = 0;
  const fetchMock = (async () => {
    calls++;
    return calls < 3
      ? new Response("SECRET", { status: 503 })
      : response("get_general_help", { topic: "general" });
  }) as typeof fetch;
  await runUnifiedAgent(f.request, config, signal(), f.access, fetchMock, {
    wait: async (ms) => {
      waits.push(ms);
    },
  });
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1000, 2000]);
  calls = 0;
  await assert.rejects(
    runUnifiedAgent(
      f.request,
      config,
      signal(),
      f.access,
      (async () => {
        calls++;
        throw new Error("SECRET network");
      }) as typeof fetch,
      { wait: async () => {} },
    ),
    (error) => {
      assert.doesNotMatch(String(error), /SECRET/);
      return true;
    },
  );
  assert.equal(calls, 3);
  for (const [status, retryAfter] of [
    [429, "1"],
    [503, "4"],
    [403, "1"],
  ] as const) {
    calls = 0;
    await assert.rejects(
      runUnifiedAgent(
        f.request,
        config,
        signal(),
        f.access,
        (async () => {
          calls++;
          return new Response("SECRET", {
            status,
            headers: { "retry-after": retryAfter },
          });
        }) as typeof fetch,
        { wait: async () => assert.fail("No retry") },
      ),
    );
    assert.equal(calls, 1);
  }
});
test("cancellation and stale workspace callbacks prevent late result presentation", async () => {
  const f = fixture(),
    controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    runUnifiedAgent(
      f.request,
      config,
      controller.signal,
      f.access,
      (async () => {
        calls++;
        return new Response("busy", { status: 503 });
      }) as typeof fetch,
      { wait: async () => controller.abort() },
    ),
  );
  assert.equal(calls, 1);
  await assert.rejects(
    runUnifiedAgent(
      f.request,
      config,
      signal(),
      {
        ...f.access,
        queryArchive: () => {
          throw Object.assign(new Error("Workspace changed"), {
            status: 409,
            code: "WORKSPACE_CHANGED",
          });
        },
      },
      model("search_archived_transactions", {}),
    ),
    { code: "WORKSPACE_CHANGED" },
  );
  await assert.rejects(
    runUnifiedAgent(
      f.request,
      config,
      signal(),
      {
        ...f.access,
        queryArchive: (query) => {
          const result = queryArchive(f.records, query);
          result.entries[0].workspaceId = "other";
          return result;
        },
      },
      model("search_archived_transactions", {}),
    ),
    { code: "FORBIDDEN" },
  );
});
test("disabled provider uses explicitly labeled basic guidance and verified queries, ambiguous requests clarify", async () => {
  const f = fixture(),
    disabled = readConfig({});
  const never = (async () =>
    assert.fail("Disabled provider must not be called")) as typeof fetch;
  const answer = await runUnifiedAgent(
    f.request,
    disabled,
    signal(),
    f.access,
    never,
  );
  assert.equal(answer.provider.name, "basic");
  assert.match(answer.answer, /Selisih awal 2 kg/);
  const archive = await runUnifiedAgent(
    { ...f.request, question: "Berapa total 20 November 2026?" },
    disabled,
    signal(),
    f.access,
    never,
  );
  assert.equal(archive.aggregate?.totalRupiah, 37000);
  assert.match(archive.answer, /Panduan dasar/);
  const ambiguous = await runUnifiedAgent(
    { ...f.request, question: "Bagaimana ini?" },
    disabled,
    signal(),
    f.access,
    never,
  );
  assert.equal(ambiguous.kind, "clarification");
  const unclear = await runUnifiedAgent(
    { requestId: "unclear", question: "Yang itu tadi bagaimana?" },
    disabled,
    signal(),
    f.access,
    never,
  );
  assert.equal(unclear.kind, "clarification");
  const missingYear = await runUnifiedAgent(
    {
      ...f.request,
      question:
        "Tampilkan transaksi tanggal 20 November dengan Pabrik Mina Jaya.",
    },
    disabled,
    signal(),
    f.access,
    never,
  );
  assert.equal(missingYear.kind, "clarification");
  assert.match(missingYear.answer, /tanggal lengkap/);
  const missingLiveYear = await runUnifiedAgent(
    {
      ...f.request,
      question:
        "Tampilkan transaksi tanggal 20 November dengan Pabrik Mina Jaya.",
    },
    config,
    signal(),
    f.access,
    never,
  );
  assert.equal(missingLiveYear.kind, "clarification");
  const search = await runUnifiedAgent(
    {
      ...f.request,
      question:
        "Tampilkan transaksi tanggal 20 November 2026 dengan Pabrik Mina Jaya.",
    },
    disabled,
    signal(),
    f.access,
    never,
  );
  assert.equal(search.transactions.length, 2);
  assert.ok(
    search.transactions.every(
      (item) => item.counterpartyName === "Pabrik Mina Jaya",
    ),
  );
  const week = await runUnifiedAgent(
    { ...f.request, question: "Ada berapa transaksi minggu ini?" },
    disabled,
    signal(),
    f.access,
    never,
    { now: new Date("2026-11-19T04:00:00Z") },
  );
  assert.equal(week.kind, "aggregate");
  assert.equal(week.aggregate?.fromDate, "2026-11-16");
  assert.equal(week.aggregate?.toDate, "2026-11-22");
  assert.equal(week.aggregate?.transactionCount, 8);
});
test("model cannot widen aggregate status unless user explicitly requests drafts or all statuses", async () => {
  const f = fixture();
  const args = { fromDate: "2026-11-20", toDate: "2026-11-20", status: "all" };
  for (const question of [
    "Berapa total transaksi 20 November 2026?",
    "Berapa total transaksi tidak termasuk draf 20 November 2026?",
  ]) {
    const answer = await runUnifiedAgent(
      { ...f.request, question },
      config,
      signal(),
      f.access,
      model("calculate_transaction_totals", args),
    );
    assert.equal(answer.aggregate?.statusFilter, "confirmed");
    assert.equal(answer.aggregate?.transactionCount, 8);
    assert.equal(answer.aggregate?.totalRupiah, 37000);
  }
  const drafts = await runUnifiedAgent(
    { ...f.request, question: "Ada berapa transaksi draf 20 November 2026?" },
    config,
    signal(),
    f.access,
    model("count_transactions", { ...args, status: "confirmed" }),
  );
  assert.equal(drafts.aggregate?.statusFilter, "draft");
  assert.equal(drafts.aggregate?.transactionCount, 2);
  assert.equal(drafts.aggregate?.totalRupiah, null);
});
test("archive replies distinguish no results, explicit zero, unknown and numeric overflow", async () => {
  const f = fixture();
  const unknown = record(2, 1000);
  unknown.draft.charges = "";
  const cases = [
    { records: [], status: "none", amount: null, match: /Tidak ada transaksi/ },
    { records: [record(1, 0)], status: "known", amount: 0, match: /Rp0/ },
    {
      records: [unknown],
      status: "incomplete",
      amount: null,
      match: /Total belum diketahui/,
    },
    {
      records: [record(1, Number.MAX_SAFE_INTEGER), record(2, 1)],
      status: "overflow",
      amount: null,
      match: /melampaui batas perhitungan aman/,
    },
  ];
  for (const item of cases) {
    const answer = await runUnifiedAgent(
      { ...f.request, question: "Berapa total transaksi 20 November 2026?" },
      config,
      signal(),
      {
        ...f.access,
        queryArchive: (query) => queryArchive(item.records, query),
      },
      model("calculate_transaction_totals", {
        fromDate: "2026-11-20",
        toDate: "2026-11-20",
      }),
    );
    assert.equal(answer.aggregate?.status, item.status);
    assert.equal(answer.aggregate?.totalRupiah, item.amount);
    assert.match(answer.answer, item.match);
  }
});
