import test from "node:test";
import assert from "node:assert/strict";
import { createVisionServer } from "./app.ts";
import { readConfig } from "./config.ts";
import { runUnifiedAgent } from "./unified-agent.ts";
import { emptyDraft, row } from "../src/data/demo.ts";
import { buildInspectionContext } from "../src/lib/inspectionContext.ts";

test("real archive HTTP and mocked Gemini tools preserve ten identities and eight latest-confirmed totals in one inspection chat", async () => {
  process.env.BUKTILAUT_ACCOUNT_DB_PATH = ":memory:";
  let providerCalls = 0;
  const mockProvider: typeof fetch = async (_url, init) => {
    providerCalls++;
    const input = JSON.parse(JSON.parse(String(init?.body)).contents[0].parts[0].text);
    const call = input.question.includes("selisih")
      ? { name: "get_inspection_finding", args: { id: input.allowedFindingId } }
      : input.question.includes("Pabrik Mina Jaya")
        ? { name: "search_archived_transactions", args: { fromDate: "2026-11-20", toDate: "2026-11-20", counterpartyName: "Pabrik Mina Jaya" } }
        : { name: "calculate_transaction_totals", args: { fromDate: "2026-11-20", toDate: "2026-11-20" } };
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ functionCall: call }] } }] });
  };
  const server = createVisionServer({ config: readConfig({ VISION_ENABLED: "true", VISION_DATA_PROCESSING_ACKNOWLEDGED: "true", GEMINI_API_KEY: "synthetic-only", VISION_REQUESTS_PER_MINUTE: "30" }),
    runUnified: (request, config, signal, access) => runUnifiedAgent(request, config, signal, access, mockProvider),
    extract: async () => { throw Error("No Vision provider permitted in this test"); },
    extractVoice: async () => { throw Error("No Voice provider permitted in this test"); },
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let cookie = "";
  const post = (path: string, body: unknown, workspace?: string) => fetch(base + path, { method: "POST", headers: { Origin: "http://127.0.0.1:5173", "Content-Type": "application/json", "X-BuktiLaut-Account": "1", "X-BuktiLaut-Agent": "1", Cookie: cookie, ...(workspace ? { "X-BuktiLaut-Workspace": workspace } : {}) }, body: JSON.stringify(body) });
  const fixture = (amount: number) => {
    const draft = emptyDraft(); draft.transactionKey = crypto.randomUUID();
    draft.weighing = [row("Teri", "1")]; draft.receipt = [row("Teri", "1", String(amount))];
    draft.sources.weighing.text = "SINTETIS timbang20November2026 Teri1kg";
    draft.sources.receipt.text = `SINTETIS nota20November2026 Teri1kg hargaRp${amount}/kg`;
    draft.weighingConfirmed = draft.receiptConfirmed = true; draft.deduction = draft.charges = "0";
    draft.pairs = [{ weighId: draft.weighing[0].id, receiptId: draft.receipt[0].id, decision: "confirmed", adjustment: "", explanation: "" }];
    return draft;
  };
  try {
    const registered = await post("/api/account/register", { email: "unified-data@example.invalid", name: "Uji Sintetis", password: "synthetic-test-only" });
    assert.equal(registered.status, 200); cookie = registered.headers.get("set-cookie")!.split(";")[0];
    const team = await post("/api/workspaces", { name: "yumi" }); const workspace = (await team.json()).activeWorkspaceId;
    const drafts = Array.from({ length: 10 }, (_, index) => fixture((index + 1) * 1000));
    const references = [];
    for (const [index, draft] of drafts.entries()) {
      const response = await post("/api/archive", { transactionId: draft.transactionKey, baseRevision: 0, status: index < 8 ? "confirmed" : "draft", transactionDate: "2026-11-20", transactionDateConfirmed: true, counterpartyName: index < 2 ? "Pabrik Mina Jaya" : `Mitra ${index}`, receiptNumber: `NT-${208 + index}`, draft }, workspace);
      assert.equal(response.status, 200); references.push((await response.json()).entry.reference);
    }
    assert.equal(new Set(references).size, 10);
    const revised = structuredClone(drafts[0]); revised.receipt[0].price = "3100";
    assert.equal((await post("/api/archive", { transactionId: revised.transactionKey, baseRevision: 1, status: "confirmed", transactionDate: "2026-11-20", transactionDateConfirmed: true, draft: revised }, workspace)).status, 200);
    const active = fixture(1000); active.weighing[0].kg = "12"; active.receipt[0].kg = "10";
    const inspection = buildInspectionContext(active);
    const ask = async (question: string) => {
      const response = await post("/api/agent", { requestId: crypto.randomUUID(), question, inspection }, workspace);
      const answer = await response.json(); assert.equal(response.status, 200, JSON.stringify(answer)); return answer;
    };
    const finding = await ask("Kenapa Teri selisih 2 kg?"); assert.equal(finding.kind, "inspection"); assert.match(finding.answer, /Selisih awal 2 kg/);
    const total = await ask("Berapa total transaksi tim yumi tanggal 20 November 2026?");
    assert.equal(total.kind, "aggregate"); assert.equal(total.aggregate.transactionCount, 8); assert.equal(total.aggregate.totalRupiah, 38100);
    assert.equal(total.transactions.length, 8); assert.ok(total.transactions.every((card: any) => references.includes(card.reference)));
    const found = await ask("Tampilkan transaksi tanggal 20 November 2026 dengan Pabrik Mina Jaya.");
    assert.equal(found.transactions.length, 2); assert.ok(found.transactions.every((card: any) => card.counterpartyName === "Pabrik Mina Jaya"));
    const all = await (await fetch(base + "/api/archive?status=all", { headers: { Cookie: cookie } })).json(); assert.equal(all.entries.length, 10);
    assert.equal(providerCalls, 3);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
