import test from "node:test";
import assert from "node:assert/strict";
import { runInspectionAgent } from "./inspection-agent.ts";
import { readConfig } from "./config.ts";
import { demoDraft } from "../src/data/demo.ts";
import { buildInspectionContext } from "../src/lib/inspectionContext.ts";
import { validateInspectionAgentRequest } from "../src/agent/contract.ts";
const config = readConfig({ GEMINI_API_KEY: "mock-key" });
function request(question: string, onlyTongkol = false) {
  const draft = demoDraft();
  draft.receipt[0].kg = "10";
  if (onlyTongkol) {
    draft.weighing = [draft.weighing[1]];
    draft.receipt = [draft.receipt[1]];
  }
  draft.weighingConfirmed = draft.receiptConfirmed = true;
  draft.pairs = draft.weighing.map((row, index) => ({
    weighId: row.id,
    receiptId: draft.receipt[index].id,
    decision: "confirmed",
    adjustment: "",
    explanation: "",
  }));
  return validateInspectionAgentRequest({
    requestId: "provider-test",
    question,
    snapshot: buildInspectionContext(draft),
  });
}
const modelCall = (name: string, args: unknown, count = 1) =>
  Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: {
          role: "model",
          parts: Array.from({ length: count }, () => ({
            functionCall: { name, args },
          })),
        },
      },
    ],
  });
test("absent fish asks only list tool and returns no unrelated facts or actions", async () => {
  const input = request("Berapa selisih Teri?", true);
  let count = 0;
  const output = await runInspectionAgent(
    input,
    config,
    new AbortController().signal,
    (async (_url, init) => {
      count++;
      const sent = JSON.parse(String(init?.body));
      assert.deepEqual(
        sent.toolConfig.functionCallingConfig.allowedFunctionNames,
        ["list_findings"],
      );
      assert.deepEqual(
        sent.tools[0].functionDeclarations.map(
          (tool: { name: string }) => tool.name,
        ),
        ["list_findings"],
      );
      assert.doesNotMatch(
        String(init?.body),
        /weighedKg|receiptKg|remainingKg/,
      );
      return modelCall("list_findings", {});
    }) as typeof fetch,
  );
  assert.equal(count, 1);
  assert.equal(output.answer, "Teri tidak ditemukan di pemeriksaan ini.");
  assert.deepEqual(output.referencedFindingIds, []);
  assert.deepEqual(output.actions, []);
  assert.doesNotMatch(output.answer, /Tongkol|8 kg/);
});
test("known single fish exposes exact ID enum and reads the verified active finding", async () => {
  const input = request("Apakah ada selisih berat untuk Tongkol?", true);
  const target = input.snapshot.findings[0];
  const output = await runInspectionAgent(
    input,
    config,
    new AbortController().signal,
    (async (_url, init) => {
      const sent = JSON.parse(String(init?.body));
      assert.deepEqual(
        sent.toolConfig.functionCallingConfig.allowedFunctionNames,
        ["read_finding"],
      );
      assert.deepEqual(
        sent.tools[0].functionDeclarations[0].parametersJsonSchema.properties.id
          .enum,
        [target.id],
      );
      assert.equal(
        JSON.parse(sent.contents[0].parts[0].text).allowedFindingId,
        target.id,
      );
      return modelCall("read_finding", { id: target.id });
    }) as typeof fetch,
  );
  assert.match(output.answer, /Catatan Timbang 8 kg, Nota Penjualan 8 kg/);
  assert.match(output.answer, /Sisa selisih 0 kg/);
  assert.deepEqual(output.referencedFindingIds, [target.id]);
});
test("unclear intent and duplicate species list choices without reading a random row", async () => {
  const unclear = request("Bagaimana ini?", true);
  const output = await runInspectionAgent(
    unclear,
    config,
    new AbortController().signal,
    (async () => modelCall("list_findings", {})) as typeof fetch,
  );
  assert.equal(output.clarification, true);
  assert.deepEqual(output.actions, []);
  assert.deepEqual(output.referencedFindingIds, []);
  const duplicate = request("Jelaskan selisih Teri");
  const original = duplicate.snapshot.findings[0];
  duplicate.snapshot.findings.push({
    ...structuredClone(original),
    id: "pair:duplicate",
    weighId: "duplicate",
    receiptId: "receipt-duplicate",
    references: {
      weighing: { kind: "weighing", rowId: "duplicate" },
      receipt: { kind: "receipt", rowId: "receipt-duplicate" },
      adjustment: { weighId: "duplicate" },
    },
  });
  const choices = await runInspectionAgent(
    duplicate,
    config,
    new AbortController().signal,
    (async () => modelCall("list_findings", {})) as typeof fetch,
  );
  assert.equal(choices.clarification, true);
  assert.equal(choices.referencedFindingIds.length, 2);
  assert.ok(choices.actions.every((action) => action.type === "view_finding"));
});
test("forged writes, extra arguments, coerced IDs and unrelated reads are rejected before execution", async () => {
  const input = request("Berapa selisih Teri?", true);
  for (const [name, args] of [
    ["save_adjustment", { kg: 2 }],
    ["list_findings", { write: true }],
    ["read_finding", { id: [input.snapshot.findings[0].id] }],
    ["read_finding", { id: input.snapshot.findings[0].id }],
  ] as const) {
    await assert.rejects(
      runInspectionAgent(
        input,
        config,
        new AbortController().signal,
        (async () => modelCall(name, args)) as typeof fetch,
      ),
      { code: "INVALID_OUTPUT" },
    );
  }
  const single = request("Berapa selisih Teri?");
  const other = single.snapshot.findings.find(
    (finding) => finding.species === "Tongkol",
  )!;
  await assert.rejects(
    runInspectionAgent(
      single,
      config,
      new AbortController().signal,
      (async () => modelCall("read_finding", { id: other.id })) as typeof fetch,
    ),
    { code: "INVALID_OUTPUT" },
  );
});
test("provider response bytes, tool count and error details remain bounded", async () => {
  const input = request("Apa saja selisih yang masih terbuka?");
  await assert.rejects(
    runInspectionAgent(input, config, new AbortController().signal, (async () =>
      modelCall("list_findings", {}, 5)) as typeof fetch),
    { code: "INVALID_OUTPUT" },
  );
  await assert.rejects(
    runInspectionAgent(
      input,
      config,
      new AbortController().signal,
      (async () => new Response("x".repeat(131073))) as typeof fetch,
    ),
    { code: "INVALID_OUTPUT" },
  );
  await assert.rejects(
    runInspectionAgent(
      input,
      config,
      new AbortController().signal,
      (async () => new Response("SECRET", { status: 429 })) as typeof fetch,
    ),
    (error) => {
      assert.equal((error as { code: string }).code, "RATE_LIMITED");
      assert.doesNotMatch(String(error), /SECRET/);
      return true;
    },
  );
});
