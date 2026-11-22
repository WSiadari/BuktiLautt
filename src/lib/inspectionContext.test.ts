import test from "node:test";
import assert from "node:assert/strict";
import { demoDraft, row } from "../data/demo.ts";
import type { Draft } from "../types.ts";
import { buildInspectionContext } from "./inspectionContext.ts";
import { calculateReceiptTotals } from "./examination.ts";

function fixture(): Draft {
  const draft = demoDraft();
  draft.receipt[0].kg = "10";
  draft.weighingConfirmed = draft.receiptConfirmed = true;
  draft.pairs = draft.weighing.map((item, index) => ({
    weighId: item.id,
    receiptId: draft.receipt[index].id,
    decision: "confirmed" as const,
    adjustment: "",
    explanation: "",
  }));
  return draft;
}

test("read-only projection explains 12/10 before and after a recorded 2 kg adjustment", () => {
  const draft = fixture();
  const original = structuredClone(draft);
  const initial = buildInspectionContext(draft);
  const teri = initial.findings[0];
  assert.equal(initial.draftId, draft.id);
  assert.equal(initial.revision, draft.revision);
  assert.equal(teri.status, "confirmed_open");
  assert.deepEqual(
    [
      teri.weighedKg,
      teri.receiptKg,
      teri.initialKg,
      teri.adjustmentKg,
      teri.remainingKg,
    ],
    [12, 10, 2, 0, 2],
  );
  assert.deepEqual(teri.references.adjustment, {
    weighId: draft.weighing[0].id,
  });
  assert.equal(initial.findings[1].status, "confirmed_equal");
  assert.deepEqual(draft, original);
  const adjusted = structuredClone(draft);
  adjusted.pairs[0].adjustment = "2";
  adjusted.pairs[0].explanation = "Dibawa pulang.";
  adjusted.revision++;
  const resolved = buildInspectionContext(adjusted);
  assert.equal(resolved.findings[0].id, teri.id);
  assert.equal(resolved.findings[0].status, "confirmed_resolved");
  assert.deepEqual(
    [
      resolved.findings[0].weighedKg,
      resolved.findings[0].receiptKg,
      resolved.findings[0].initialKg,
      resolved.findings[0].adjustmentKg,
      resolved.findings[0].remainingKg,
    ],
    [12, 10, 2, 2, 0],
  );
  assert.equal(
    calculateReceiptTotals(
      [
        { receiptKg: 10, pricePerKg: 25_000 },
        { receiptKg: 8, pricePerKg: 30_000 },
      ],
      0,
      0,
    ).totalRupiah,
    490_000,
  );
});

test("unconfirmed and explicitly unmatched rows never acquire definitive discrepancy arithmetic", () => {
  const draft = fixture();
  draft.pairs[0].decision = "pending";
  draft.pairs[0].adjustment = "2";
  draft.pairs[1].decision = "unmatched";
  draft.pairs[1].receiptId = "";
  draft.unmatchedReceipts = [draft.receipt[1].id];
  const context = buildInspectionContext(draft);
  assert.equal(context.findings[0].status, "unconfirmed");
  assert.equal(context.findings[1].status, "unmatched");
  assert.equal(context.findings[2].id, "receipt:" + draft.receipt[1].id);
  assert.equal(context.findings[2].status, "unmatched");
  for (const finding of context.findings) {
    assert.deepEqual(
      [finding.initialKg, finding.adjustmentKg, finding.remainingKg],
      [null, null, null],
    );
    assert.equal(finding.references.adjustment, null);
  }
});

test("incomplete, stale, mismatched and reused pairs cannot present confirmed calculations", () => {
  const incomplete = fixture();
  incomplete.receipt[0].kg = "";
  assert.equal(
    buildInspectionContext(incomplete).findings[0].status,
    "incomplete",
  );
  const edited = fixture();
  edited.weighingConfirmed = false;
  assert.equal(
    buildInspectionContext(edited).findings[0].status,
    "review_required",
  );
  const mismatch = fixture();
  mismatch.pairs[0].receiptId = mismatch.receipt[1].id;
  assert.equal(buildInspectionContext(mismatch).findings[0].remainingKg, null);
  const invalidAdjustment = fixture();
  invalidAdjustment.pairs[0].adjustment = "not-a-number";
  assert.equal(
    buildInspectionContext(invalidAdjustment).findings[0].status,
    "review_required",
  );
  const duplicate = fixture();
  duplicate.pairs.push({ ...duplicate.pairs[0] });
  assert.equal(
    buildInspectionContext(duplicate).findings[0].status,
    "review_required",
  );
});

test("duplicate species and opposite findings remain independent by stable row IDs", () => {
  const draft = fixture();
  draft.weighing[1].name = draft.receipt[1].name = "Teri";
  draft.weighing[1].kg = "8";
  draft.receipt[1].kg = "10";
  const findings = buildInspectionContext(draft).findings;
  assert.equal(findings.length, 2);
  assert.equal(new Set(findings.map((finding) => finding.id)).size, 2);
  assert.deepEqual(
    findings.map((finding) => finding.species),
    ["Teri", "Teri"],
  );
  assert.deepEqual(
    findings.map((finding) => finding.remainingKg),
    [2, -2],
  );
  assert.equal(
    findings.every((finding) => finding.status === "confirmed_open"),
    true,
  );
  assert.equal(findings[1].references.adjustment, null);
});

test("only allowed projection fields leave the draft and returned objects cannot mutate it", () => {
  const draft = fixture();
  draft.sources.weighing.text = "private-transcript-marker";
  draft.sources.receipt.image = "data:image/png;base64,private-photo-marker";
  draft.sources.receipt.filename = "private-filename-marker";
  draft.pairs[0].explanation = "private-note-marker";
  const context = buildInspectionContext(draft);
  const json = JSON.stringify(context);
  for (const marker of [
    "private-transcript-marker",
    "private-photo-marker",
    "private-filename-marker",
    "private-note-marker",
  ])
    assert.equal(json.includes(marker), false);
  context.findings[0].species = "Changed only in projection";
  context.findings[0].references.weighing!.rowId =
    "changed-projection-reference";
  assert.equal(draft.weighing[0].name, "Teri");
  assert.notEqual(draft.weighing[0].id, "changed-projection-reference");
});

test("empty names and receipt-only rows remain explicit and control references are app-owned", () => {
  const draft = fixture();
  draft.weighing.push(row("", ""));
  draft.receipt.push(row("Tuna", "3", "40000"));
  const context = buildInspectionContext(draft);
  const empty = context.findings.find(
    (finding) => finding.weighId === draft.weighing[2].id,
  )!;
  assert.equal(empty.species, "Jenis ikan belum diketahui");
  assert.equal(empty.weighedKg, null);
  assert.equal(empty.remainingKg, null);
  const receiptOnly = context.findings.find(
    (finding) => finding.receiptId === draft.receipt[2].id,
  )!;
  assert.equal(receiptOnly.status, "unconfirmed");
  assert.deepEqual(receiptOnly.references, {
    weighing: null,
    receipt: { kind: "receipt", rowId: draft.receipt[2].id },
    adjustment: null,
  });
});
