import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAdjustmentPreview,
  calculatePair,
  calculateReceiptTotals,
  parseKilograms,
} from "./examination.ts";
import type { PairInput } from "./examination.ts";

const teri: PairInput = {
  weighedName: "Teri",
  receiptName: "Teri",
  weighedKg: 12,
  receiptKg: 10,
  confirmed: true,
  savedAdjustmentKg: null,
};
const receipt = [
  { receiptKg: 10, pricePerKg: 25_000 },
  { receiptKg: 8, pricePerKg: 30_000 },
];

test("reference case preserves original sources and keeps pending adjustment out of saved results", () => {
  const input = Object.freeze({ ...teri });
  assert.equal(calculatePair(input).remainingKg, 2);
  assert.equal(calculateAdjustmentPreview(input, 2).remainingKg, 0);
  assert.equal(calculatePair(input).remainingKg, 2);
  assert.equal(
    calculatePair({ ...input, savedAdjustmentKg: 2 }).remainingKg,
    0,
  );
  assert.deepEqual(input, teri);
  assert.equal(calculateReceiptTotals(receipt).totalRupiah, 490_000);
});

test("unknown and unconfirmed source weights never yield a definitive difference", () => {
  assert.equal(calculatePair({ ...teri, confirmed: false }).remainingKg, null);
  assert.equal(
    calculateAdjustmentPreview({ ...teri, confirmed: false }, 2).remainingKg,
    null,
  );
  assert.equal(calculatePair({ ...teri, receiptKg: null }).status, "unknown");
  assert.equal(calculatePair({ ...teri, receiptKg: 0 }).status, "invalid");
});

test("confirmed arithmetic refuses different, ambiguous or omitted fish identities", () => {
  for (const receiptName of [
    "Tongkol",
    "Kembung",
    "ikan",
    "campuran",
    "T?ri",
    "unknown",
    "ikan laut",
    null,
  ]) {
    const result = calculatePair({ ...teri, receiptName });
    assert.equal(result.status, "invalid");
    assert.equal(result.remainingKg, null);
    assert.equal(
      calculateAdjustmentPreview({ ...teri, receiptName }, 2).status,
      "invalid",
    );
  }
  const legacyInput = {
    weighedKg: 12,
    receiptKg: 10,
    confirmed: true,
    savedAdjustmentKg: 2,
  };
  assert.equal(calculatePair(legacyInput as PairInput).status, "invalid");
  assert.equal(
    calculatePair({
      ...teri,
      weighedName: " ＩＫＡＮ　ＴＥＲＩ ",
      receiptName: "teri",
    }).remainingKg,
    2,
  );
});

test("exact gram arithmetic accepts comma or dot and rejects unsupported input", () => {
  assert.equal(parseKilograms("1,125"), 1.125);
  assert.equal(parseKilograms("1.125"), 1.125);
  assert.equal(parseKilograms("0"), 0);
  for (const value of [
    "",
    "1,000.5",
    "-2",
    "1.0001",
    "Infinity",
    "NaN",
    "1e3",
  ]) {
    assert.equal(parseKilograms(value), null);
  }
  assert.equal(
    calculatePair({
      ...teri,
      weighedKg: 0.3,
      receiptKg: 0.1,
      savedAdjustmentKg: 0.2,
    }).remainingKg,
    0,
  );
  assert.equal(calculatePair({ ...teri, weighedKg: 1.0001 }).status, "invalid");
});

test("partial, replacement, and deleted adjustments recompute from original weights", () => {
  assert.equal(calculatePair({ ...teri, savedAdjustmentKg: 1 }).remainingKg, 1);
  assert.equal(
    calculateAdjustmentPreview({ ...teri, savedAdjustmentKg: 1 }, 2)
      .remainingKg,
    0,
  );
  assert.equal(
    calculatePair({ ...teri, savedAdjustmentKg: null }).remainingKg,
    2,
  );
  assert.equal(calculateAdjustmentPreview(teri, 3).status, "invalid");
  assert.equal(calculateAdjustmentPreview(teri, 0).status, "invalid");
  assert.equal(
    calculatePair({ ...teri, savedAdjustmentKg: -1 }).status,
    "invalid",
  );
});

test("opposite differences remain individual findings and cannot use not-sold adjustment", () => {
  const positive = calculatePair(teri);
  const negativeInput = { ...teri, weighedKg: 10, receiptKg: 12 };
  const negative = calculatePair(negativeInput);
  assert.equal(negative.direction, "receipt-more");
  assert.equal(negative.remainingKg, -2);
  assert.equal(
    [positive, negative].filter((result) => result.remainingKg !== 0).length,
    2,
  );
  assert.equal(calculateAdjustmentPreview(negativeInput, 2).status, "invalid");
});

test("receipt arithmetic is independent of pair matching and weight adjustments", () => {
  const before = calculateReceiptTotals(receipt, 0, 0);
  calculatePair({ ...teri, savedAdjustmentKg: 2 });
  assert.deepEqual(calculateReceiptTotals(receipt, 0, 0), before);
  assert.equal(
    calculateReceiptTotals(receipt, 10_000, 5_000).totalRupiah,
    485_000,
  );
  assert.equal(
    calculateReceiptTotals([{ receiptKg: 0.001, pricePerKg: 500 }]).totalRupiah,
    1,
  );
  assert.equal(
    calculateReceiptTotals([{ receiptKg: 0.001, pricePerKg: 499 }]).totalRupiah,
    0,
  );
});

test("unknown amounts preserve known lines and never silently become zero", () => {
  const unknown = calculateReceiptTotals([
    { receiptKg: 10, pricePerKg: null },
    receipt[1]!,
  ]);
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.totalRupiah, null);
  assert.deepEqual(unknown.lineTotalsRupiah, [null, 240_000]);
  assert.equal(calculateReceiptTotals(receipt, null, 0).totalRupiah, null);
  assert.equal(calculateReceiptTotals(receipt, 0, null).totalRupiah, null);
  assert.equal(
    calculateReceiptTotals([{ receiptKg: null, pricePerKg: 25_000 }]).status,
    "unknown",
  );
  assert.equal(
    calculateReceiptTotals([{ receiptKg: 1, pricePerKg: 0 }]).totalRupiah,
    0,
  );
  assert.equal(calculateReceiptTotals([]).status, "unknown");
});

test("unsafe, non-finite, fractional or negative monetary inputs fail visibly", () => {
  for (const price of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(
      calculateReceiptTotals([{ receiptKg: 1, pricePerKg: price }]).status,
      "invalid",
    );
  }
  assert.equal(
    calculateReceiptTotals([
      { receiptKg: 2, pricePerKg: Number.MAX_SAFE_INTEGER },
    ]).status,
    "invalid",
  );
  assert.equal(calculateReceiptTotals(receipt, 500_000).status, "invalid");
});

test("known item subtotal remains available while final deductions or charges are unknown", () => {
  for (const [deduction, charges] of [
    [null, null],
    [null, 0],
    [0, null],
  ]) {
    const result = calculateReceiptTotals(receipt, deduction, charges);
    assert.equal(result.subtotalRupiah, 490_000);
    assert.equal(result.totalRupiah, null);
    assert.equal(result.status, "unknown");
    assert.equal(result.error, null);
  }
});

test("explicit zero and positive fees change final total independently of item subtotal", () => {
  for (const [deduction, charges, expected] of [
    [0, 0, 490_000],
    [10_000, 0, 480_000],
    [0, 5_000, 495_000],
    [10_000, 5_000, 485_000],
  ]) {
    const result = calculateReceiptTotals(receipt, deduction, charges);
    assert.equal(result.subtotalRupiah, 490_000);
    assert.equal(result.totalRupiah, expected);
    assert.equal(result.status, "ready");
  }
  assert.equal(
    calculateReceiptTotals([{ receiptKg: 1, pricePerKg: 0 }], null, null)
      .subtotalRupiah,
    0,
  );
});

test("missing or invalid item values never produce a partial subtotal", () => {
  for (const line of [
    { receiptKg: 10, pricePerKg: null },
    { receiptKg: null, pricePerKg: 25_000 },
    { receiptKg: 10, pricePerKg: -1 },
    { receiptKg: 1.0001, pricePerKg: 25_000 },
  ]) {
    const result = calculateReceiptTotals([line, receipt[1]!], 0, 0);
    assert.equal(result.subtotalRupiah, null);
    assert.equal(result.totalRupiah, null);
  }
  assert.equal(calculateReceiptTotals([]).subtotalRupiah, null);
});

test("invalid fee inputs preserve known item subtotal and keep final total invalid", () => {
  for (const [deduction, charges] of [
    [-1, 0],
    [0, 0.5],
    [Infinity, 0],
  ]) {
    const result = calculateReceiptTotals(receipt, deduction, charges);
    assert.equal(result.subtotalRupiah, 490_000);
    assert.equal(result.totalRupiah, null);
    assert.equal(result.status, "invalid");
    assert.equal(result.error, "Berat atau nominal nota tidak valid.");
  }
});

test("subtotal uses the same per-line gram precision and half-up Rupiah rounding", () => {
  const result = calculateReceiptTotals(
    [
      { receiptKg: 1.125, pricePerKg: 25_000 },
      { receiptKg: 0.001, pricePerKg: 500 },
      { receiptKg: 0.001, pricePerKg: 499 },
    ],
    null,
    null,
  );
  assert.deepEqual(result.lineTotalsRupiah, [28_125, 1, 0]);
  assert.equal(result.subtotalRupiah, 28_126);
  assert.equal(result.totalRupiah, null);
});

test("large valid subtotals remain exact and item or aggregate overflow stays unknown", () => {
  const maximum = Number.MAX_SAFE_INTEGER;
  const boundary = calculateReceiptTotals(
    [{ receiptKg: 1, pricePerKg: maximum }],
    0,
    0,
  );
  assert.equal(boundary.subtotalRupiah, maximum);
  assert.equal(boundary.totalRupiah, maximum);
  const aggregateOverflow = calculateReceiptTotals(
    [
      { receiptKg: 1, pricePerKg: maximum },
      { receiptKg: 1, pricePerKg: 1 },
    ],
    0,
    0,
  );
  assert.equal(aggregateOverflow.subtotalRupiah, null);
  assert.equal(aggregateOverflow.totalRupiah, null);
  assert.equal(aggregateOverflow.status, "invalid");
  const lineOverflow = calculateReceiptTotals(
    [{ receiptKg: 2, pricePerKg: maximum }],
    null,
    null,
  );
  assert.equal(lineOverflow.subtotalRupiah, null);
  assert.equal(lineOverflow.status, "invalid");
  const finalOverflow = calculateReceiptTotals(
    [{ receiptKg: 1, pricePerKg: maximum }],
    0,
    1,
  );
  assert.equal(finalOverflow.subtotalRupiah, maximum);
  assert.equal(finalOverflow.totalRupiah, null);
  assert.equal(finalOverflow.status, "invalid");
});
