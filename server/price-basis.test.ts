import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractWithGemini, extractionPrompt } from "./gemini.ts";
import { buildVisionResult } from "../src/vision/contract.ts";
import { classifiedFixture, requestFixture } from "./test-fixtures.ts";
import { readConfig } from "./config.ts";
test("mock structured Vision preserves linked header evidence and proposes all eleven complex per-kg prices", async () => {
  const truth = JSON.parse(
    await readFile(
      new URL("../evaluation/complex/groundtruth.json", import.meta.url),
      "utf8",
    ),
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
      subtotal: Number(row.subtotalRupiah).toLocaleString("id-ID"),
      discount: null,
      rawText: row.lot,
      issues: [],
      priceBasis: {
        kind: "column_header",
        text: "Harga/kg (Rp)",
        columnAssociation: "clear",
      },
    }),
  );
  raw.documentTotal = truth.documentFinalRupiah;
  raw.deduction = truth.documentDiscountRupiah;
  raw.charges = truth.documentFeeRupiah;
  const request = requestFixture();
  const output = await extractWithGemini(
    { request, text: request.text },
    readConfig({ GEMINI_API_KEY: "MOCK_ONLY" }),
    new AbortController().signal,
    (async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.ok(
        body.generationConfig.responseJsonSchema.properties.items.items
          .properties.priceBasis,
      );
      assert.match(body.systemInstruction.parts[0].text, /columnAssociation/);
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(raw) }] },
          },
        ],
      });
    }) as typeof fetch,
  );
  const result = buildVisionResult(output.raw, request, output.model);
  assert.deepEqual(
    result.normalized.items.map((item) => item.unitPriceRupiah),
    truth.receipt.map((row: { unitPriceRupiah: string }) =>
      Number(row.unitPriceRupiah),
    ),
  );
  assert.ok(
    result.normalized.items.every(
      (item) => item.unitPriceBasis === "column_header",
    ),
  );
  const independentTotal =
    result.normalized.items.reduce(
      (sum, item) => sum + BigInt(item.subtotalRupiah!),
      0n,
    ) -
    BigInt(result.normalized.deductionRupiah!) +
    BigInt(result.normalized.chargesRupiah!);
  assert.equal(independentTotal.toString(), "2206300");
  assert.match(
    extractionPrompt("receipt"),
    /Never derive a price or basis from subtotal divided by weight/,
  );
});
