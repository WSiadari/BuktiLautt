import test from "node:test";
import assert from "node:assert/strict";
import { emptyDraft, row } from "../data/demo.ts";
import { buildVisionResult } from "../vision/contract.ts";
import {
  classifiedFixture,
  requestFixture,
} from "../../server/test-fixtures.ts";
import { compareReceiptDocument } from "./receiptDocument.ts";

function currencyDraft() {
  const draft = emptyDraft();
  draft.receipt = [row("Teri", "2", "25000")];
  draft.deduction = "1000";
  const raw = classifiedFixture("sales_receipt");
  raw.items[0] = {
    ...raw.items[0],
    weightValue: "2",
    subtotal: "Rp50.000",
    discount: null,
  };
  raw.documentTotal = "Rp49.000";
  raw.deduction = "Rp1.000";
  raw.charges = null;
  draft.rawExtractions = {
    receipt: {
      result: buildVisionResult(raw, {
        ...requestFixture(),
        sourceId: `${draft.id}:receipt:${draft.sources.receipt.capturedAt}`,
      }, "mock"),
      receivedAt: "now",
      sourceCapturedAt: draft.sources.receipt.capturedAt,
    },
  };
  return draft;
}

test("dataset05 printed total never infers missing charge zero", () => {
  const draft = currencyDraft();
  draft.receiptConfirmed = true;
  const comparison = compareReceiptDocument(draft);
  assert.equal(comparison.printedTotalRupiah, 49000);
  assert.equal(comparison.calculatedSubtotalRupiah, 50000);
  assert.equal(comparison.calculatedTotalRupiah, null);
  assert.equal(comparison.status, "awaiting_review");
  assert.equal(draft.charges, "");
  assert.equal(
    draft.rawExtractions!.receipt!.result.raw.items[0].subtotal,
    "Rp50.000",
  );
});

test("explicit zero and confirmed inputs compare matching and different final totals without changing evidence", () => {
  const draft = currencyDraft();
  draft.charges = "0";
  assert.equal(compareReceiptDocument(draft).status, "awaiting_review");
  draft.receiptConfirmed = true;
  assert.equal(compareReceiptDocument(draft).status, "match");
  draft.charges = "2000";
  assert.deepEqual(compareReceiptDocument(draft), {
    printedTotalRupiah: 49000,
    calculatedSubtotalRupiah: 50000,
    calculatedTotalRupiah: 51000,
    status: "difference",
    differenceRupiah: 2000,
  });
  assert.equal(
    draft.rawExtractions!.receipt!.result.raw.documentTotal,
    "Rp49.000",
  );
  draft.sources.receipt.capturedAt += "-new";
  assert.equal(compareReceiptDocument(draft).printedTotalRupiah, null);
});

test("foreign or incompatible extraction totals never appear in current receipt comparisons", () => {
  const original = currencyDraft();
  original.charges = "0";
  original.receiptConfirmed = true;
  for (const type of ["foreign", "weighing", "unknown", "unreadable"] as const) {
    const draft = structuredClone(original);
    const extraction = draft.rawExtractions!.receipt!;
    if (type === "foreign") {
      extraction.result.sourceId = "another-examination:receipt:another-source";
    } else {
      const raw = classifiedFixture(type === "unreadable" ? "sales_receipt" : type);
      if (type === "unreadable") raw.readability = "unreadable";
      raw.documentTotal = "Rp999.999";
      extraction.result = buildVisionResult(raw, {
        ...requestFixture(),
        sourceId: `${draft.id}:receipt:${draft.sources.receipt.capturedAt}`,
      }, "mock");
    }
    const comparison = compareReceiptDocument(draft);
    assert.equal(comparison.printedTotalRupiah, null);
    assert.equal(comparison.differenceRupiah, null);
    assert.equal(comparison.status, "unavailable");
    assert.equal(comparison.calculatedSubtotalRupiah, 50_000);
    assert.equal(comparison.calculatedTotalRupiah, 49_000);
  }
});
