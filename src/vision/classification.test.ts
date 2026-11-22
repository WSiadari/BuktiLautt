import test from "node:test";
import assert from "node:assert/strict";
import { classifiedFixture, rawFixture, requestFixture } from "../../server/test-fixtures.ts";
import { buildVisionResult, documentCompatibility, validateClassifiedExtraction, validateVisionResult } from "./contract.ts";

test("actual receipt classification is preserved independently of requested weighing workflow", () => {
  const request = { ...requestFixture(), documentType: "weighing" as const };
  const raw = classifiedFixture("sales_receipt");
  const result = buildVisionResult(validateClassifiedExtraction(raw), request, "mock-model");
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.documentType, "weighing");
  assert.equal(result.raw.documentType, "sales_receipt");
  assert.deepEqual(validateVisionResult(result, request), result);
  assert.equal(documentCompatibility(result, "weighing").reason, "mismatch");
  assert.equal(documentCompatibility(result, "weighing").canImport, false);
  assert.equal(documentCompatibility(result, "receipt").canImport, false);
  assert.match(documentCompatibility(result, "weighing").message, /nota penjualan, bukan catatan timbang/);
  assert.equal(result.raw.items[0].rawText, raw.items[0].rawText);
});
test("compatible document types are accepted and reverse mismatch is blocked", () => {
  for (const documentType of ["weighing", "receipt"] as const) {
    const request = { ...requestFixture(), documentType };
    const raw = classifiedFixture(documentType === "weighing" ? "weighing" : "sales_receipt");
    const result = buildVisionResult(raw, request, "mock-model");
    assert.equal(documentCompatibility(result, documentType).canImport, true);
  }
  const result = buildVisionResult(classifiedFixture("weighing"), requestFixture(), "mock-model");
  assert.equal(documentCompatibility(result, "receipt").reason, "mismatch");
});
test("unknown and uncertain classification cannot become compatible through expected workflow", () => {
  const unknown = buildVisionResult(classifiedFixture("unknown"), requestFixture(), "mock-model");
  assert.equal(documentCompatibility(unknown, "receipt").reason, "unknown");
  const raw = classifiedFixture("sales_receipt");
  raw.classification.certainty = "uncertain";
  assert.equal(documentCompatibility(buildVisionResult(raw, requestFixture(), "mock-model"), "receipt").canImport, false);
});
test("unreadable and partial observations are successful typed data, with no invented empty-row values", () => {
  const raw = classifiedFixture("unknown");
  raw.readability = "unreadable";
  raw.items = [];
  raw.warnings = ["Teks tidak cukup jelas."];
  const result = buildVisionResult(validateClassifiedExtraction(raw), requestFixture(), "mock-model");
  assert.deepEqual(result.normalized.items, []);
  assert.equal(documentCompatibility(result, "receipt").reason, "unreadable");
  assert.deepEqual(validateVisionResult(result, requestFixture()), result);
  const partial = classifiedFixture("sales_receipt");
  partial.readability = "partial";
  partial.items[0].weightValue = null;
  partial.items[0].itemName = "T?ri";
  partial.items.push({ ...partial.items[0] });
  const partialResult = buildVisionResult(partial, requestFixture(), "mock-model");
  assert.equal(documentCompatibility(partialResult, "receipt").canImport, true);
  assert.equal(partialResult.normalized.items[0].weightKg, null);
  assert.equal(partialResult.normalized.items[0].itemName, "T?ri");
  assert.equal(partialResult.normalized.items.length, 2);
});
test("legacy evidence stays structurally recoverable without invented actual classification", () => {
  const old = buildVisionResult(rawFixture(), requestFixture(), "legacy-model");
  const original = structuredClone(old);
  assert.deepEqual(validateVisionResult(old, requestFixture()), old);
  assert.equal(documentCompatibility(old, "receipt").reason, "legacy");
  assert.equal(documentCompatibility(old, "receipt").canImport, false);
  assert.deepEqual(old, original);
  assert.throws(() => validateClassifiedExtraction(rawFixture()));
});
test("classification rejects missing evidence, fake confidence and contradictory unreadable rows", () => {
  const clear = classifiedFixture();
  assert.throws(() => validateClassifiedExtraction({ ...clear, classification: { certainty: "clear", evidence: [] } }));
  assert.throws(() => validateClassifiedExtraction({ ...clear, classification: { ...clear.classification, confidence: 99 } }));
  assert.throws(() => validateClassifiedExtraction({ ...clear, readability: "unreadable" }));
  assert.throws(() => validateClassifiedExtraction({ ...clear, schemaVersion: 3 }));
});
test("currency evaluation printed subtotal, deduction and total never imply an unprinted zero charge", () => {
  const raw = classifiedFixture();
  raw.items[0] = { ...raw.items[0], weightValue: "2", unitPrice: "Rp25.000/kg", subtotal: "Rp50.000" };
  raw.deduction = "Rp1.000";
  raw.documentTotal = "Rp49.000";
  raw.charges = null;
  const result = buildVisionResult(raw, requestFixture(), "mock-model");
  assert.equal(result.normalized.items[0].subtotalRupiah, 50_000);
  assert.equal(result.normalized.documentTotalRupiah, 49_000);
  assert.equal(result.normalized.deductionRupiah, 1000);
  assert.equal(result.normalized.chargesRupiah, null);
});
