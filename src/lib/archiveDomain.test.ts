import test from "node:test";
import assert from "node:assert/strict";
import { demoDraft, row } from "../data/demo.ts";
import { buildInspectionContext } from "./inspectionContext.ts";
import { archiveDateKey, archiveRevisionTotal, buildInspectionFollowUp, isArchiveConfirmationReady, summarizeArchive, validateArchiveRevision, queryArchive, validateArchiveQuery, type ArchiveRevision } from "./archiveDomain.ts";

test("query deduplicates ten transactions, eight confirmed, two drafts, before pagination", () => {
  const records = Array.from({ length: 10 }, (_, index) => ({ ...record(`tx-${index}`, (index + 1) * 100), status: index < 8 ? "confirmed" as const : "draft" as const, reference: `BL-20261111-${String(index + 1).padStart(6, "0")}`, workspaceId: "private:owner", counterpartyName: index < 2 ? "Ibu Sari" : "Pak Budi", receiptNumber: `N-${index}` }));
  const revised = { ...records[0], revision: 2, draft: record("unused", 500).draft };
  const snapshot = structuredClone(records);
  const result = queryArchive([...records, revised, revised], { fromDate: "2026-11-11", toDate: "2026-11-11", limit: 2 });
  assert.equal(result.summary.transactionCount, 8);
  assert.equal(result.summary.confirmedCount, 8);
  assert.equal(result.summary.totalRupiah, 4000);
  assert.equal(result.summary.hasMore, true);
  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[0].latestConfirmedRevision, 2);
  assert.equal(queryArchive(records, { status: "all" }).summary.transactionCount, 10);
  const drafts = queryArchive(records, { status: "draft" });
  assert.equal(drafts.summary.draftCount, 2);
  assert.equal(drafts.summary.totalRupiah, null);
  assert.equal(drafts.summary.status, "incomplete");
  assert.equal(queryArchive(records, { counterpartyName: " IBU   SARI " }).summary.transactionCount, 2);
  assert.equal(queryArchive(records, { reference: "bl-20261111-000001" }).entries[0].transactionId, "tx-0");
  assert.equal(queryArchive(records, { receiptNumber: "n-1" }).entries[0].transactionId, "tx-1");
  assert.deepEqual(records, snapshot);
});

test("query preserves confirmed history, unknown versus zero and forbids scope/query injection", () => {
  const first = record("same", 0);
  const working = { ...record("same", 99, "2026-11-12", 2), status: "draft" as const };
  assert.equal(queryArchive([first, working]).summary.totalRupiah, 0);
  assert.equal(queryArchive([first, working], { status: "all" }).entries[0].latestConfirmedRevision, 1);
  assert.equal(queryArchive([]).summary.totalRupiah, null);
  const unknown = record("unknown", 99); unknown.draft.charges = "";
  assert.equal(queryArchive([unknown]).summary.status, "incomplete");
  assert.throws(() => queryArchive([{ ...first, workspaceId: "one" }, { ...working, workspaceId: "two" }]));
  for (const value of [{ workspaceId: "foreign" }, { limit: 51 }, { offset: -1 }, { fromDate: "2026-02-29" }, { status: "deleted" }, { status: ["confirmed"] }, { reference: "\u0000" }]) assert.throws(() => validateArchiveQuery(value));
  assert.throws(() => queryArchive([{ ...first, reference: "BL-20261111-000001" }, { ...working, reference: "BL-20261111-000002" }]));
  assert.throws(() => queryArchive([{ ...first, reference: "BL-20261111-000001" }, { ...record("different", 10), reference: "BL-20261111-000001" }]));
});

function record(transactionId: string, amount: number, date = "2026-11-11", revision = 1): ArchiveRevision {
  const draft = demoDraft();
  draft.demo = false;
  draft.weighing = [row("Teri", "1")];
  draft.receipt = [row("Teri", "1", String(amount))];
  draft.weighingConfirmed = draft.receiptConfirmed = true;
  draft.pairs = [{ weighId: draft.weighing[0].id, receiptId: draft.receipt[0].id, decision: "confirmed", adjustment: "", explanation: "" }];
  return { transactionId, revision, status: "confirmed", transactionDate: date, transactionDateConfirmed: true, draft };
}

test("daily archive uses each latest confirmed transaction once and keeps drafts separate", () => {
  const complex = record("complex", 2_206_300);
  const demo = record("simple", 490_000);
  const draft = { ...record("work-in-progress", 999_999), status: "draft" as const, transactionDateConfirmed: false };
  const otherDate = record("other", 1_000_000, "2026-11-12");
  const summary = summarizeArchive([complex, demo, draft, otherDate, complex], "2026-11-11");
  assert.equal(summary.totalRupiah, 2_696_300);
  assert.equal(summary.transactionCount, 2);
  assert.equal(summary.draftCount, 1);
  assert.equal(summary.timezone, "Asia/Jakarta");
  assert.deepEqual(summary.references.map(item => item.transactionId), ["complex", "simple"]);
  const revised = record("complex", 2_300_000, "2026-11-11", 2);
  assert.equal(summarizeArchive([revised, complex, demo, draft], "2026-11-11").totalRupiah, 2_790_000);
  assert.equal(summarizeArchive([complex, revised, demo], "2026-11-11").transactionCount, 2);
});

test("date filters follow latest confirmed receipt date rather than extracted date or earlier revisions", () => {
  const first = record("same", 490_000);
  const moved = record("same", 500_000, "2026-11-12", 2);
  assert.equal(summarizeArchive([first, moved], "2026-11-11").transactionCount, 0);
  assert.equal(summarizeArchive([first, moved], "2026-11-11", "2026-11-12").totalRupiah, 500_000);
  assert.equal(validateArchiveRevision({ ...first, transactionDateConfirmed: false }), false);
  assert.equal(validateArchiveRevision({ ...first, transactionDate: null }), false);
  assert.equal(archiveDateKey("2024-02-29"), "2024-02-29");
  for (const date of ["2026-02-29", "11 November 2026", "2026-11-11T00:00:00+07:00", "2026-13-01"]) assert.equal(archiveDateKey(date), null);
  assert.throws(() => summarizeArchive([first], "2026-11-12", "2026-11-11"));
});

test("no transactions, explicit zero and unknown final totals remain different states", () => {
  const none = summarizeArchive([], "2026-11-11");
  assert.equal(none.status, "none");
  assert.equal(none.totalRupiah, null);
  assert.equal(none.transactionCount, 0);
  const zero = summarizeArchive([record("zero", 0)], "2026-11-11");
  assert.equal(zero.status, "known");
  assert.equal(zero.totalRupiah, 0);
  assert.equal(zero.transactionCount, 1);
  const unknown = record("unknown", 490_000);
  unknown.draft.charges = "";
  assert.equal(validateArchiveRevision(unknown), true);
  const incomplete = summarizeArchive([unknown, record("known", 10)], "2026-11-11");
  assert.equal(incomplete.status, "incomplete");
  assert.equal(incomplete.totalRupiah, null);
  assert.equal(incomplete.unknownTotalCount, 1);
});

test("confirmed archive validation preserves review gates, mismatches and original adjustments", () => {
  const value = record("review", 490_000);
  assert.equal(isArchiveConfirmationReady(value.draft), true);
  const original = structuredClone(value);
  value.draft.pairs[0].decision = "pending";
  assert.equal(validateArchiveRevision(value), false);
  value.draft = original.draft;
  value.draft.receipt[0].name = "Tongkol";
  assert.equal(archiveRevisionTotal(value), null);
  const adjusted = record("adjusted", 490_000);
  adjusted.draft.weighing[0].kg = "3";
  adjusted.draft.pairs[0].adjustment = "2";
  adjusted.draft.pairs[0].explanation = "Dibawa pulang.";
  assert.equal(archiveRevisionTotal(adjusted), 490_000);
  assert.equal(adjusted.draft.weighing[0].kg, "3");
  assert.equal(adjusted.draft.receipt[0].kg, "1");
});

test("archive sum overflow and conflicting versions fail without inventing a total", () => {
  const maximum = record("max", Number.MAX_SAFE_INTEGER);
  assert.equal(summarizeArchive([maximum, record("one", 1)], "2026-11-11").status, "overflow");
  assert.equal(summarizeArchive([maximum, record("one", 1)], "2026-11-11").totalRupiah, null);
  assert.throws(() => summarizeArchive([record("same", 10), record("same", 20)], "2026-11-11"));
  const confirmed = record("same-status", 10);
  assert.throws(() => summarizeArchive([confirmed, { ...confirmed, status: "draft" }], "2026-11-11"));
});

test("inspection follow-up counts confirmed, pending, open and unmatched by finding IDs", () => {
  const draft = demoDraft();
  draft.weighingConfirmed = draft.receiptConfirmed = true;
  draft.receipt[0].kg = "10";
  draft.pairs = draft.weighing.map((weighed, index) => ({ weighId: weighed.id, receiptId: draft.receipt[index].id, decision: "confirmed", adjustment: "", explanation: "" }));
  draft.weighing.push(row("Kembung", "5"));
  draft.receipt.push(row("Tuna", "3", "25000"));
  draft.unmatchedReceipts.push(draft.receipt[2].id);
  const context = buildInspectionContext(draft);
  const original = structuredClone(draft);
  const summary = buildInspectionFollowUp(context);
  assert.equal(summary.confirmedPairCount, 2);
  assert.equal(summary.openDifferenceCount, 1);
  assert.equal(summary.pendingDecisionCount, 1);
  assert.equal(summary.unmatchedItemCount, 1);
  assert.equal(summary.followUpFindingIds.length, 3);
  assert.deepEqual(draft, original);
});
