import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rawFixture, requestFixture } from "../../server/test-fixtures.ts";
import { normalizeWeight, normalizeRupiah, validateRawExtraction, buildVisionResult, validateVisionResult } from "./contract.ts";
import { calculateReceiptTotals } from "../lib/examination.ts";

test("raw schema preserves null and rejects missing, extra, wrong-type and excessive fields", () => {
  const raw = rawFixture();
  assert.equal(validateRawExtraction(raw, "receipt").charges, null);
  for (const bad of [{ ...raw, unexpected: "ignore validation" }, { ...raw, documentType: "weighing" }, { ...raw, documentTotal: 0 }, { ...raw, items: [{ ...raw.items[0], weightValue: 12 }] }, { ...raw, items: Array(101).fill(raw.items[0]) }]) {
    assert.throws(() => validateRawExtraction(bad, "receipt"));
  }
  const missing = { ...raw } as Record<string, unknown>;
  delete missing.notes;
  assert.throws(() => validateRawExtraction(missing, "receipt"));
});
test("weights normalize explicit supported units with safe Indonesian separators", () => {
  assert.equal(normalizeWeight("12,5", "kg"), 12.5);
  assert.equal(normalizeWeight("12.5", "kg"), 12.5);
  assert.equal(normalizeWeight("1.250", "gram"), 1.25);
  assert.equal(normalizeWeight("500", "g"), 0.5);
  assert.equal(normalizeWeight("1.250,5", "kg"), 1250.5);
  for (const [value, unit] of [["1.250", "kg"], ["1,250.5", "kg"], ["2", "basket"], ["0", "kg"], ["-1", "kg"], ["1.0001", "kg"], ["0,5", "g"], ["1e3", "kg"], ["2", null]]) {
    assert.equal(normalizeWeight(value, unit), null);
  }
});
test("Rupiah parses printed grouped amounts, preserving unknown and ambiguity", () => {
  assert.equal(normalizeRupiah("Rp 25.000"), 25_000);
  assert.equal(normalizeRupiah("Rp25.000/kg", true), 25_000);
  assert.equal(normalizeRupiah("0"), 0);
  assert.equal(normalizeRupiah("Rp25.000,00"), 25_000);
  for (const amount of [null, "", "Rp25,000", "25.5", "25,50", "-1", "100/100g", "9007199254740992"]) assert.equal(normalizeRupiah(amount), null);
});
test("normalization requires explicit price denominator and does not calculate missing printed values", () => {
  const raw = rawFixture();
  raw.items[0].unitPrice = "25000";
  raw.items[0].subtotal = null;
  const result = buildVisionResult(raw, requestFixture(), "gemini-3.5-flash-lite");
  assert.equal(result.normalized.items[0].unitPriceRupiah, null);
  assert.equal(result.normalized.items[0].subtotalRupiah, null);
  assert.equal(result.normalized.chargesRupiah, null);
  assert.equal(result.normalized.deductionRupiah, 0);
  assert.equal(result.requiresReview, true);
  assert.deepEqual(result.raw, raw);
  assert.ok(result.normalized.items[0].issues.length);
});
test("client boundary rejects stale identity, auto-confirmation and forged normalization", () => {
  const request = requestFixture();
  const result = buildVisionResult(rawFixture(), request, "gemini-3.5-flash-lite");
  assert.deepEqual(validateVisionResult(result, request), result);
  assert.throws(() => validateVisionResult({ ...result, sourceRevision: "2" }, request));
  assert.throws(() => validateVisionResult({ ...result, requiresReview: false }, request));
  assert.throws(() => validateVisionResult({ ...result, normalized: { ...result.normalized, chargesRupiah: 0 } }, request));
});

test("clear associated Harga/kg headers normalize plain prices while preserving literal evidence", () => {
  for (const text of ["Harga/kg", " Harga / KG ", "Harga/kg (Rp)", "Harga satuan/kg", "Rp/kg", "Harga per kilogram"]) {
    const raw = rawFixture();
    raw.items[0].unitPrice = "Rp 25.000";
    raw.items[0].priceBasis = { kind: "column_header", text, columnAssociation: "clear" };
    const before = structuredClone(raw);
    validateRawExtraction(raw, "receipt");
    const result = buildVisionResult(raw, requestFixture(), "test-model");
    assert.equal(result.normalized.items[0].unitPriceRupiah, 25_000);
    assert.equal(result.normalized.items[0].unitPriceBasis, "column_header");
    assert.ok(result.normalized.items[0].unitPriceReason!.includes(text));
    assert.deepEqual(raw, before);
    assert.deepEqual(validateVisionResult(result, requestFixture()), result);
  }
});

test("ambiguous column association and contradictory row or header units stay unknown", () => {
  for (const [header, association, literal] of [
    ["Harga/kg", "uncertain", "25000"],
    ["Harga", "clear", "25000"],
    ["Harga/g", "clear", "Rp25.000/kg"],
    ["Harga per gram", "clear", "Rp25.000/kg"],
    ["Harga/kg atau /g", "clear", "Rp25.000/kg"],
    ["Harga/kg", "clear", "Rp25.000/g"],
    ["Harga/kg", "clear", "Rp25.000/100g"],
  ] as const) {
    const raw = rawFixture();
    raw.items[0].unitPrice = literal;
    raw.items[0].priceBasis = { kind: "column_header", text: header, columnAssociation: association };
    const result = buildVisionResult(raw, requestFixture(), "test-model");
    assert.equal(result.normalized.items[0].unitPriceRupiah, null, header + " " + literal);
    assert.equal(result.normalized.items[0].unitPriceBasis, "unknown");
    assert.equal(result.raw.items[0].unitPrice, literal);
  }
});

test("optional price evidence is strict and absent legacy evidence keeps normalized shape unchanged", () => {
  const raw = rawFixture();
  const legacy = buildVisionResult(raw, requestFixture(), "test-model");
  assert.equal(Object.hasOwn(legacy.normalized.items[0], "unitPriceBasis"), false);
  assert.deepEqual(validateVisionResult(legacy, requestFixture()), legacy);
  for (const priceBasis of [
    { kind: "column_header", text: "Harga/kg", columnAssociation: "clear", extra: true },
    { kind: "column_header", text: "Harga/kg" },
    { kind: "guess", text: "Harga/kg", columnAssociation: "clear" },
    { kind: "column_header", text: "", columnAssociation: "clear" },
    { kind: "column_header", text: "Harga/kg", columnAssociation: "maybe" },
  ]) {
    assert.throws(() => validateRawExtraction({ ...raw, items: [{ ...raw.items[0], priceBasis }] }, "receipt"));
  }
  const noPrice = structuredClone(raw);
  noPrice.items[0].unitPrice = null;
  noPrice.items[0].priceBasis = { kind: "column_header", text: "Harga/kg", columnAssociation: "clear" };
  noPrice.items[0].subtotal = "Rp250.000";
  assert.equal(buildVisionResult(noPrice, requestFixture(), "test-model").normalized.items[0].unitPriceRupiah, null);
});

test("all eleven complex receipt column prices normalize and reproduce independently recorded final total", () => {
  const truth = JSON.parse(readFileSync(new URL("../../evaluation/complex/groundtruth.json", import.meta.url), "utf8"));
  const raw = rawFixture();
  raw.items = truth.receipt.map((item: { name: string; printedWeight: string; unitPriceRupiah: string; subtotalRupiah: string }) => ({
    itemName: item.name, weightValue: item.printedWeight, weightUnit: "kg",
    unitPrice: Number(item.unitPriceRupiah).toLocaleString("id-ID"),
    subtotal: item.subtotalRupiah, discount: null, rawText: "Baris sumber sintetis", issues: [],
    priceBasis: { kind: "column_header" as const, text: "Harga/kg", columnAssociation: "clear" as const },
  }));
  const result = buildVisionResult(raw, requestFixture(), "test-model");
  assert.equal(result.normalized.items.filter(item => item.unitPriceRupiah !== null).length, 11);
  const totals = calculateReceiptTotals(result.normalized.items.map(item => ({ receiptKg: item.weightKg, pricePerKg: item.unitPriceRupiah })), Number(truth.documentDiscountRupiah), Number(truth.documentFeeRupiah));
  assert.equal(totals.totalRupiah, 2_206_300);
});
