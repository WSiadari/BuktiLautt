import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVoiceResult,
  validateRawVoiceOutput,
  validateVoiceResult,
} from "./contract.ts";
import {
  voiceRawFixture,
  voiceRequestFixture,
} from "../../server/voice-fixtures.ts";

test("voice keeps transcript, separate repeated rows and explicit source identity without retaining the clip", () => {
  const raw = voiceRawFixture();
  raw.extraction.items.push({
    ...raw.extraction.items[0],
    weightValue: "2",
    rawText: "Teri dua kilo",
  });
  const result = buildVoiceResult(
    validateRawVoiceOutput(raw),
    voiceRequestFixture(),
    "mock-model",
  );
  assert.equal(result.transcript, raw.transcript);
  assert.deepEqual(
    result.vision.normalized.items.map((item) => item.weightKg),
    [12, 8, 2],
  );
  assert.equal(result.vision.sourceId, voiceRequestFixture().sourceId);
  assert.equal(result.vision.requiresReview, true);
  assert.equal(JSON.stringify(result).includes("audioDataUrl"), false);
  assert.deepEqual(validateVoiceResult(result, voiceRequestFixture()), result);
  assert.throws(() =>
    validateVoiceResult(result, {
      ...voiceRequestFixture(),
      requestId: "late-response",
    }),
  );
});
test("unintelligible speech returns empty typed observations and unresolved weights stay null", () => {
  const raw = voiceRawFixture();
  raw.transcript = "";
  raw.extraction.documentType = "unknown";
  raw.extraction.classification = { certainty: "uncertain", evidence: [] };
  raw.extraction.readability = "unreadable";
  raw.extraction.items = [];
  const empty = buildVoiceResult(
    validateRawVoiceOutput(raw),
    voiceRequestFixture(),
    "mock-model",
  );
  assert.deepEqual(empty.vision.normalized.items, []);
  const partial = voiceRawFixture();
  partial.extraction.items[0].weightValue = null;
  partial.extraction.items[0].itemName = "T?ri";
  partial.extraction.readability = "partial";
  partial.unresolvedFields = [
    { itemIndex: 0, field: "name", reason: "Nama belum jelas." },
    { itemIndex: 0, field: "weight", reason: "Angka belum jelas." },
  ];
  const result = buildVoiceResult(
    validateRawVoiceOutput(partial),
    voiceRequestFixture(),
    "mock-model",
  );
  assert.equal(result.vision.normalized.items[0].weightKg, null);
  assert.equal(result.vision.normalized.items[0].itemName, "T?ri");
  assert.ok(
    result.unresolvedFields.some(
      (issue) => issue.itemIndex === 0 && issue.field === "weight",
    ),
  );
});
test("voice schema rejects forged unresolved enums, contradictory numeric certainty and clip persistence", () => {
  const raw = voiceRawFixture();
  for (const issue of [
    { itemIndex: 0, field: ["name"], reason: "bad enum" },
    { itemIndex: 2, field: "name", reason: "wrong index" },
    {
      itemIndex: 0,
      field: "weight",
      reason: "uncertain despite non-null weight",
    },
  ]) {
    assert.throws(() =>
      validateRawVoiceOutput({ ...raw, unresolvedFields: [issue] }),
    );
  }
  assert.throws(() => validateRawVoiceOutput({ ...raw, transcript: "" }));
  const result = buildVoiceResult(raw, voiceRequestFixture(), "mock-model");
  assert.throws(() =>
    validateVoiceResult(
      { ...result, audioDataUrl: "should-not-persist" },
      voiceRequestFixture(),
    ),
  );
});
