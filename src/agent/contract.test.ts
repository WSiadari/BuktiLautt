import test from "node:test";
import assert from "node:assert/strict";
import { demoDraft } from "../data/demo.ts";
import type { Draft } from "../types.ts";
import { buildInspectionContext } from "../lib/inspectionContext.ts";
import {
  validateInspectionAgentRequest,
  renderInspectionAnswer,
  validateInspectionAgentResponse,
  validateAgentToolCall,
  resolveFindingTargets,
  findingTargets,
} from "./contract.ts";
import { runInspectionAgent } from "../../server/inspection-agent.ts";
import { readConfig } from "../../server/config.ts";
function fixture(): Draft {
  const d = demoDraft();
  d.receipt[0].kg = "10";
  d.weighingConfirmed = d.receiptConfirmed = true;
  d.pairs = d.weighing.map((w, i) => ({
    weighId: w.id,
    receiptId: d.receipt[i].id,
    decision: "confirmed" as const,
    adjustment: "",
    explanation: "",
  }));
  return d;
}
test("verified tool answers preserve draft and explain initial and remaining values", () => {
  const d = fixture(),
    before = structuredClone(d);
  const req = {
    requestId: "test",
    question: "Kenapa Teri selisih 2 kg?",
    snapshot: buildInspectionContext(d),
  };
  validateInspectionAgentRequest(req);
  const id = req.snapshot.findings[0].id;
  const answer = renderInspectionAnswer(
    req,
    [{ name: "read_finding", findingId: id }],
    "mock",
  );
  assert.match(answer.answer, /12 kg/);
  assert.match(answer.answer, /10 kg/);
  assert.match(answer.answer, /Sisa selisih 2 kg/);
  assert.deepEqual(d, before);
  assert.throws(() =>
    validateInspectionAgentResponse(
      { ...answer, answer: "Kerugian 999 kg" },
      req,
    ),
  );
  d.pairs[0].adjustment = "2";
  const resolved = { ...req, snapshot: buildInspectionContext(d) };
  assert.match(
    renderInspectionAnswer(
      resolved,
      [{ name: "read_finding", findingId: id }],
      "mock",
    ).answer,
    /Sisa selisih 0 kg/,
  );
  assert.throws(() =>
    validateAgentToolCall(
      { name: "save_adjustment", args: { kg: 2 } },
      req.snapshot,
    ),
  );
  assert.throws(() =>
    validateAgentToolCall(
      { name: "read_finding", args: { id, write: true } },
      req.snapshot,
    ),
  );
  const bad = structuredClone(req);
  bad.snapshot.findings[0].remainingKg = 999;
  assert.throws(() => validateInspectionAgentRequest(bad));
});
test("duplicate species clarify and unconfirmed findings never receive definite arithmetic", () => {
  const d = fixture();
  d.weighing[1].name = "Teri";
  d.receipt[1].name = "Teri";
  const req = {
    requestId: "dup",
    question: "Teri",
    snapshot: buildInspectionContext(d),
  };
  assert.equal(
    renderInspectionAnswer(req, [{ name: "list_findings" }], "mock")
      .clarification,
    true,
  );
  d.pairs[0].decision = "pending";
  const one = {
    ...req,
    snapshot: buildInspectionContext(d),
    findingId: req.snapshot.findings[0].id,
  };
  assert.match(
    renderInspectionAnswer(
      one,
      [{ name: "read_finding", findingId: one.findingId }],
      "mock",
    ).answer,
    /belum dikonfirmasi/,
  );
});
test("mock authenticated Gemini function path reads only the resolved single finding", async () => {
  const d = fixture();
  const req = {
    requestId: "provider",
    question: "Teri",
    snapshot: buildInspectionContext(d),
  };
  let calls = 0;
  const mock = (async (url: any, init: any) => {
    assert.match(String(url), /^https:\/\/generativelanguage.googleapis.com/);
    assert.equal(init.headers["x-goog-api-key"], "test-only");
    const body = JSON.parse(init.body);
    assert.deepEqual(
      body.tools[0].functionDeclarations.map((x: any) => x.name),
      ["read_finding"],
    );
    assert.deepEqual(
      body.tools[0].functionDeclarations[0].parametersJsonSchema.properties.id
        .enum,
      [req.snapshot.findings[0].id],
    );
    calls++;
    return Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: "read_finding",
                  args: { id: req.snapshot.findings[0].id },
                },
              },
            ],
          },
        },
      ],
    });
  }) as typeof fetch;
  const result = await runInspectionAgent(
    req,
    readConfig({ GEMINI_API_KEY: "test-only" }),
    new AbortController().signal,
    mock,
  );
  assert.equal(calls, 1);
  assert.deepEqual(
    result.toolCalls.map((x) => x.name),
    ["read_finding"],
  );
  assert.match(result.answer, /Sisa selisih 2 kg/);
});

function tongkolOnlyRequest(question = "Berapa selisih Teri?") {
  const draft = fixture();
  draft.weighing = draft.weighing.slice(1);
  draft.receipt = draft.receipt.slice(1);
  draft.pairs = draft.pairs.slice(1);
  return {
    requestId: "tongkol-only",
    question,
    snapshot: buildInspectionContext(draft),
  };
}

test("a named absent fish returns exact not-found text with no other finding references or values", () => {
  const request = tongkolOnlyRequest();
  assert.equal(resolveFindingTargets(request).kind, "not_found");
  assert.deepEqual(findingTargets(request), []);
  const answer = renderInspectionAnswer(
    request,
    [{ name: "list_findings" }],
    "mock",
  );
  assert.equal(answer.answer, "Teri tidak ditemukan di pemeriksaan ini.");
  assert.equal(answer.clarification, false);
  assert.deepEqual(answer.referencedFindingIds, []);
  assert.deepEqual(answer.actions, []);
  assert.doesNotMatch(answer.answer, /Tongkol|8|0|kg/);
  assert.deepEqual(validateInspectionAgentResponse(answer, request), answer);
  assert.throws(() =>
    validateInspectionAgentResponse(
      {
        ...answer,
        referencedFindingIds: [request.snapshot.findings[0].id],
      },
      request,
    ),
  );
});

test("a valid named finding and general inspection questions retain their correct targets", () => {
  const request = tongkolOnlyRequest("Apakah ada selisih berat untuk Tongkol?");
  assert.equal(resolveFindingTargets(request).kind, "single");
  const answer = renderInspectionAnswer(
    request,
    [{ name: "read_finding", findingId: request.snapshot.findings[0].id }],
    "mock",
  );
  assert.match(
    answer.answer,
    /Tongkol: Catatan Timbang 8 kg, Nota Penjualan 8 kg/,
  );
  assert.match(answer.answer, /Sisa selisih 0 kg/);
  const general = {
    ...request,
    question: "Apa saja selisih yang masih terbuka?",
    snapshot: buildInspectionContext(fixture()),
  };
  assert.equal(resolveFindingTargets(general).kind, "general");
  assert.deepEqual(findingTargets(general), general.snapshot.findings);
  assert.deepEqual(
    findingTargets({ ...general, findingId: general.snapshot.findings[1].id }),
    general.snapshot.findings,
  );
  assert.equal(
    renderInspectionAnswer(general, [{ name: "list_findings" }], "mock")
      .referencedFindingIds.length,
    2,
  );
});

test("a stale selected ID cannot override a conflicting explicit fish name", () => {
  const missing = tongkolOnlyRequest();
  const staleSelection = {
    ...missing,
    findingId: missing.snapshot.findings[0].id,
  };
  assert.equal(resolveFindingTargets(staleSelection).kind, "not_found");
  assert.deepEqual(
    renderInspectionAnswer(staleSelection, [{ name: "list_findings" }], "mock")
      .actions,
    [],
  );
  const both = { ...missing, snapshot: buildInspectionContext(fixture()) };
  const selectedTongkol = { ...both, findingId: both.snapshot.findings[1].id };
  assert.deepEqual(
    findingTargets(selectedTongkol).map((finding) => finding.species),
    ["Teri"],
  );
  assert.throws(() =>
    renderInspectionAnswer(
      selectedTongkol,
      [{ name: "read_finding", findingId: selectedTongkol.findingId }],
      "mock",
    ),
  );
});

test("duplicate fish names require clarification unless a compatible row is explicitly selected", () => {
  const draft = fixture();
  draft.weighing[1].name = draft.receipt[1].name = "Teri";
  const request = {
    requestId: "duplicate-target",
    question: "Berapa selisih Teri?",
    snapshot: buildInspectionContext(draft),
  };
  assert.equal(resolveFindingTargets(request).kind, "multiple");
  const answer = renderInspectionAnswer(
    request,
    [{ name: "list_findings" }],
    "mock",
  );
  assert.equal(answer.clarification, true);
  assert.equal(answer.actions.length, 2);
  const selected = { ...request, findingId: request.snapshot.findings[1].id };
  assert.equal(resolveFindingTargets(selected).kind, "single");
  assert.equal(findingTargets(selected)[0].id, selected.findingId);
});

test("explicit missing varieties and bounded arbitrary names never fall back to a broader fish", () => {
  const request = {
    requestId: "qualified-target",
    question: "Berapa selisih Teri Nasi?",
    snapshot: buildInspectionContext(fixture()),
  };
  for (const question of [
    "Berapa selisih Teri Nasi?",
    "Kenapa Teri Medan selisih 2 kg?",
    "Berapa selisih ikan Cucut Macan?",
    "Berapa selisih Terii?",
  ]) {
    const resolution = resolveFindingTargets({ ...request, question });
    assert.equal(resolution.kind, "not_found", question);
    assert.deepEqual(resolution.targets, []);
  }
  const partial = resolveFindingTargets({
    ...request,
    question: "Berapa selisih Teri dan Cakalang?",
  });
  assert.equal(partial.kind, "not_found");
  assert.deepEqual(partial.requestedSpecies, ["cakalang"]);
  assert.equal(
    resolveFindingTargets({
      ...request,
      question: "Bandingkan Teri dengan Cucut",
    }).kind,
    "not_found",
  );
});

test("unclear questions and ambiguous spelling request clarification without unrelated cards", () => {
  const request = tongkolOnlyRequest();
  for (const question of [
    "Halo",
    "Bagaimana hasilnya?",
    "Berapa selisih T?ri?",
    "Berapa selisih ikan laut?",
  ]) {
    const unclear = { ...request, question };
    assert.equal(resolveFindingTargets(unclear).kind, "unclear", question);
    const answer = renderInspectionAnswer(
      unclear,
      [{ name: "list_findings" }],
      "mock",
    );
    assert.equal(answer.clarification, true);
    assert.deepEqual(answer.referencedFindingIds, []);
    assert.deepEqual(answer.actions, []);
  }
});

test("one-sided fish findings remain available without inventing discrepancy arithmetic", () => {
  const draft = fixture();
  draft.pairs[0].decision = "unmatched";
  draft.pairs[0].receiptId = "";
  draft.receipt = draft.receipt.slice(1);
  const request = {
    requestId: "one-sided",
    question: "Berapa selisih Teri?",
    snapshot: buildInspectionContext(draft),
  };
  const finding = findingTargets(request)[0];
  const answer = renderInspectionAnswer(
    request,
    [{ name: "read_finding", findingId: finding.id }],
    "mock",
  );
  assert.match(
    answer.answer,
    /Catatan Timbang 12 kg, Nota Penjualan belum diketahui/,
  );
  assert.match(answer.answer, /belum dapat dihitung/);
  assert.doesNotMatch(answer.answer, /Sisa selisih 0 kg/);
});

test("follow-up question renders active engine counts without choosing a species",()=>{
 const d=fixture();d.pairs[0].decision="pending" as any;
 const req={requestId:"followup",question:"Apa yang masih perlu saya cek?",snapshot:buildInspectionContext(d)};
 const answer=renderInspectionAnswer(req,[{name:"list_findings"}],"mock");
 assert.match(answer.answer,/1 pasangan terkonfirmasi/);assert.match(answer.answer,/1 keputusan menunggu/);
 assert.equal(answer.clarification,false);assert.equal(answer.referencedFindingIds.length,1);
});
