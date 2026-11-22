import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compareExtraction } from "./compare-live.ts";
import { buildVisionResult } from "../../src/vision/contract.ts";
import { classifiedFixture } from "../../server/test-fixtures.ts";
test("local comparison keeps service failure separate from OCR field quality", async () => {
  const truth = JSON.parse(
    await readFile(new URL("./groundtruth.json", import.meta.url), "utf8"),
  );
  const result = compareExtraction(truth, {
    kind: "receipt",
    status: "service_error",
    response: { error: { code: "TIMEOUT" } },
    retryCount: 0,
  });
  assert.equal(result.status, "service_error");
  assert.equal("alignedFieldCounts" in result, false);
});
test("local mock comparison preserves repeated lots, flags wrong weight and never rewrites reviewed values", async () => {
  const truth = JSON.parse(
    await readFile(new URL("./groundtruth.json", import.meta.url), "utf8"),
  );
  const raw = classifiedFixture("sales_receipt");
  raw.items = truth.receipt.map(
    (row: {
      name: string;
      weightKg: string;
      unitPriceRupiah: string;
      subtotalRupiah: string;
      lot: string;
    }) => ({
      itemName: row.name,
      weightValue: row.weightKg.replace(".", ","),
      weightUnit: "kg",
      unitPrice: `${row.unitPriceRupiah}/kg`,
      subtotal: row.subtotalRupiah,
      discount: null,
      rawText: `${row.lot} ${row.name}`,
      issues: [],
    }),
  );
  raw.documentTotal = truth.documentFinalRupiah;
  raw.deduction = truth.documentDiscountRupiah;
  raw.charges = truth.documentFeeRupiah;
  raw.items[2].weightValue = "5,05";
  const response = buildVisionResult(
    raw,
    {
      documentType: "receipt",
      requestId: "mock-compare",
      sourceId: "mock-source",
      sourceRevision: "1",
      text: "fixture",
    },
    "mock-model",
  );
  const before = structuredClone(response);
  const comparison = compareExtraction(truth, {
    kind: "receipt",
    provider: "LOCAL MOCK",
    response,
  });
  assert.equal(comparison.status, "compared");
  if (comparison.status !== "compared") return;
  assert.deepEqual(comparison.rowCounts, {
    expected: 11,
    returned: 11,
    associated: 11,
  });
  assert.equal(comparison.alignedFieldCounts.incorrect, 1);
  assert.equal(
    comparison.rows[2].fields.find((field) => field.field === "weightKg")
      ?.status,
    "incorrect",
  );
  assert.deepEqual(comparison.associationReviewRequired, []);
  assert.ok(
    comparison.repeatedSpecies.every(
      (group) => group.expectedCount === group.returnedCount,
    ),
  );
  assert.deepEqual(response, before);
});

test("bare printed prices are compared separately from unknown usable per-kg prices", async () => {
  const truth = JSON.parse(
    await readFile(new URL("./groundtruth.json", import.meta.url), "utf8"),
  );
  const raw = classifiedFixture("sales_receipt");
  raw.items = truth.receipt.map(
    (row: {
      name: string;
      weightKg: string;
      unitPriceRupiah: string;
      subtotalRupiah: string;
      lot: string;
    }) => ({
      itemName: row.name,
      weightValue: row.weightKg.replace(".", ","),
      weightUnit: "kg",
      unitPrice: Number(row.unitPriceRupiah).toLocaleString("id-ID"),
      subtotal: row.subtotalRupiah,
      discount: null,
      rawText: row.lot,
      issues: [],
    }),
  );
  const response = buildVisionResult(
    raw,
    {
      documentType: "receipt",
      requestId: "bare-prices",
      sourceId: "mock-source",
      sourceRevision: "1",
      text: "fixture",
    },
    "mock-model",
  );
  const comparison = compareExtraction(truth, {
    kind: "receipt",
    provider: "LOCAL MOCK",
    response,
  });
  if (comparison.status !== "compared") assert.fail("Expected compared result");
  assert.equal(comparison.alignedFieldCounts.unknown, 11);
  assert.equal(comparison.alignedFieldCounts.incorrect, 0);
  assert.ok(
    comparison.rows.every(
      (row) =>
        row.fields.find(
          (field) => field.field === "rawPrintedUnitPriceAmount_not_priceBasis",
        )?.status === "correct",
    ),
  );
});
