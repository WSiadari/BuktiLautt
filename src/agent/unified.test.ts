import test from "node:test";
import assert from "node:assert/strict";
import { demoDraft } from "../data/demo.ts";
import { buildInspectionContext } from "../lib/inspectionContext.ts";
import { queryArchive } from "../lib/archiveDomain.ts";
import { renderInspectionAnswer, isInspectionFollowUp } from "./contract.ts";
import { validateUnifiedAgentRequest, validateUnifiedAgentResponse, type UnifiedAgentResponse } from "./unified.ts";

const request = { requestId: "request:1", question: "Cara menggunakan arsip?" };
function help(): UnifiedAgentResponse { return { requestId: request.requestId, kind: "help", answer: "Buka arsip untuk mencari transaksi.", workspaceId: "private:owner", workspaceName: "Pribadi", inspection: null, transactions: [], aggregate: null, clarification: false, provider: { name: "basic", model: "basic" } }; }

test("unified request permits minimal chat but never accepts workspace/model authority", () => {
  assert.deepEqual(validateUnifiedAgentRequest(request), request);
  for (const extra of [{ workspaceId: "team:foreign" }, { tools: [] }, { findingId: "pair:missing" }, { inspection: null }]) assert.throws(() => validateUnifiedAgentRequest({ ...request, ...extra }));
  const draft = demoDraft();
  const inspection = buildInspectionContext(draft);
  assert.deepEqual(validateUnifiedAgentRequest({ ...request, inspection }).inspection, inspection);
});

test("unified response scope and read-only cards are strict", () => {
  assert.deepEqual(validateUnifiedAgentResponse(help(), request, "private:owner"), help());
  assert.throws(() => validateUnifiedAgentResponse(help(), request, "team:other"));
  assert.throws(() => validateUnifiedAgentResponse({ ...help(), actions: [{ type: "save" }] }, request));
  const aggregate = queryArchive([]).summary;
  const value = { ...help(), kind: "aggregate", aggregate };
  assert.equal(validateUnifiedAgentResponse(value, request).aggregate?.totalRupiah, null);
  assert.throws(() => validateUnifiedAgentResponse({ ...value, aggregate: { ...aggregate, totalRupiah: 0 } }, request));
  assert.throws(() => validateUnifiedAgentResponse({ ...help(), aggregate }, request));
});

test("unified inspection reuses absent-fish and deterministic answer validation", () => {
  const draft = demoDraft(); draft.weighing = draft.weighing.filter(row => row.name === "Tongkol"); draft.receipt = draft.receipt.filter(row => row.name === "Tongkol");
  const inspection = buildInspectionContext(draft);
  const q = { ...request, question: "Berapa selisih Teri?", inspection };
  const nested = renderInspectionAnswer({ requestId: q.requestId, question: q.question, snapshot: inspection }, [{ name: "list_findings" }], "test-model");
  assert.deepEqual(nested.referencedFindingIds, []);
  assert.match(nested.answer, /Teri tidak ditemukan/u);
  const response = { ...help(), kind: "inspection", answer: nested.answer, clarification: nested.clarification, inspection: nested };
  assert.equal(validateUnifiedAgentResponse(response, q).answer, nested.answer);
  assert.throws(() => validateUnifiedAgentResponse({ ...response, answer: "Tongkol selisih 2 kg." }, q));
  assert.throws(() => validateUnifiedAgentResponse({ ...response, inspection: { ...nested, answer: "Teri selisih 0 kg." } }, q));
  assert.equal(isInspectionFollowUp("Apa yang masih perlu diperiksa sebelum laporan?"), true);
});
