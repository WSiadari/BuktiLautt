import test from "node:test";
import assert from "node:assert/strict";
import { emptyDraft, row } from "../data/demo.ts";
import type { Draft } from "../types.ts";
import {
  buildVisionResult,
  type ClassifiedRawExtraction,
} from "../vision/contract.ts";
import { applyVoiceProposal, voiceProposalIsCurrent } from "./voiceReview.ts";
import {
  calculateAdjustmentPreview,
  calculatePair,
  calculateReceiptTotals,
} from "./examination.ts";
import { confirmPair } from "./matching.ts";
import { sourceDocumentGate } from "./documentValidation.ts";

function fixture(): Draft {
  const draft = emptyDraft();
  const transcript =
    "Teri dua belas kilo, Tongkol delapan kilo. Teri lima kilo lagi.";
  draft.sources.weighing = {
    text: transcript,
    filename: "Rekaman suara",
    capturedAt: "recording-one",
  };
  const raw: ClassifiedRawExtraction = {
    schemaVersion: 2,
    documentType: "weighing",
    classification: {
      certainty: "clear",
      evidence: [
        "Pernyataan hasil timbang dengan jenis ikan dan satuan berat.",
      ],
    },
    readability: "readable",
    extractedDate: null,
    documentTotal: null,
    deduction: null,
    charges: null,
    notes: null,
    warnings: [],
    items: [
      {
        itemName: "Teri",
        weightValue: "12",
        weightUnit: "kg",
        unitPrice: null,
        subtotal: null,
        discount: null,
        rawText: "Teri dua belas kilo",
        issues: [],
      },
      {
        itemName: "Tongkol",
        weightValue: "8",
        weightUnit: "kg",
        unitPrice: null,
        subtotal: null,
        discount: null,
        rawText: "Tongkol delapan kilo",
        issues: [],
      },
      {
        itemName: "Teri",
        weightValue: "5",
        weightUnit: "kg",
        unitPrice: null,
        subtotal: null,
        discount: null,
        rawText: "Teri lima kilo lagi",
        issues: [],
      },
    ],
  };
  const vision = buildVisionResult(
    raw,
    {
      documentType: "weighing",
      requestId: "voice-one",
      sourceId: `${draft.id}:weighing:recording-one`,
      sourceRevision: "1",
    },
    "test-model",
  );
  draft.voiceExtraction = {
    result: { transcript, vision, unresolvedFields: [] },
    receivedAt: "now",
    sourceCapturedAt: "recording-one",
  };
  draft.rawExtractions = {
    weighing: {
      result: vision,
      receivedAt: "now",
      sourceCapturedAt: "recording-one",
    },
  };
  return draft;
}

test("voice rows require explicit selected import and preserve distinct mentions through repeat and refresh", () => {
  const draft = fixture();
  const original = structuredClone(draft);
  assert.equal(voiceProposalIsCurrent(draft), true);
  assert.equal(applyVoiceProposal(draft, []), draft);
  const first = applyVoiceProposal(draft, [0, 0, -1, 100]);
  assert.equal(first.weighing.length, 1);
  assert.equal(first.weighing[0].kg, "12");
  assert.equal(first.weighingConfirmed, false);
  first.weighing[0].kg = "11";
  const rest = applyVoiceProposal(first, [1, 2]);
  assert.deepEqual(
    rest.weighing.map((row) => row.kg),
    ["11", "8", "5"],
  );
  assert.equal(rest.weighing.filter((row) => row.name === "Teri").length, 2);
  const restored = structuredClone(rest);
  assert.equal(applyVoiceProposal(restored, [0, 1, 2]), restored);
  assert.equal(applyVoiceProposal(restored, [2]), restored);
  assert.deepEqual(draft, original);
  assert.equal(
    rest.voiceExtraction!.result.transcript,
    original.voiceExtraction!.result.transcript,
  );
});

test("voice imports keep manual corrections, invalidate confirmation and archive saved adjustments", () => {
  const draft = fixture();
  draft.weighing = [row("Kembung", "7")];
  draft.receipt = [row("Kembung", "5", "25000")];
  draft.weighingConfirmed = true;
  draft.receiptConfirmed = true;
  draft.confirmedSnapshots = {
    weighing: {
      revision: draft.revision,
      confirmedAt: "before-voice-import",
      sourceCapturedAt: draft.sources.weighing.capturedAt,
      rows: structuredClone(draft.weighing),
      deduction: "",
      charges: "",
    },
  };
  draft.pairs = [
    {
      weighId: draft.weighing[0].id,
      receiptId: draft.receipt[0].id,
      decision: "confirmed",
      adjustment: "2",
      explanation: "  Dibawa pulang.\nTeks asli.  ",
    },
  ];
  const next = applyVoiceProposal(draft, [0]);
  assert.deepEqual(next.weighing[0], draft.weighing[0]);
  assert.equal(next.weighingConfirmed, false);
  assert.equal(next.receiptConfirmed, true);
  assert.deepEqual(next.confirmedSnapshots, draft.confirmedSnapshots);
  assert.deepEqual(next.pairs, []);
  assert.equal(next.previousReview!.rows[0].adjustment, "2");
  assert.equal(
    next.previousReview!.rows[0].explanation,
    draft.pairs[0].explanation,
  );
  assert.equal(draft.pairs[0].decision, "confirmed");
  assert.deepEqual(next.sources, draft.sources);
});

test("matching request IDs cannot bind altered voice proposal values to different stored evidence", () => {
  const draft = fixture();
  draft.voiceExtraction = structuredClone(draft.voiceExtraction!);
  draft.voiceExtraction.result.vision.normalized.items[0].weightKg = 99;
  draft.voiceExtraction.result.vision.raw.items[0].weightValue = "99";
  assert.equal(voiceProposalIsCurrent(draft), false);
  assert.equal(applyVoiceProposal(draft, [0]), draft);
});

test("stale recording, transcript edits, foreign results and replaced request cannot be imported", () => {
  const draft = fixture();
  for (const changed of [
    {
      ...draft,
      sources: {
        ...draft.sources,
        weighing: { ...draft.sources.weighing, capturedAt: "new-recording" },
      },
    },
    {
      ...draft,
      sources: {
        ...draft.sources,
        weighing: { ...draft.sources.weighing, text: "Newer source text" },
      },
    },
    {
      ...draft,
      voiceExtraction: {
        ...draft.voiceExtraction!,
        result: {
          ...draft.voiceExtraction!.result,
          vision: {
            ...draft.voiceExtraction!.result.vision,
            sourceId: "another:weighing:source",
          },
        },
      },
    },
    {
      ...draft,
      rawExtractions: {
        weighing: {
          ...draft.rawExtractions!.weighing!,
          result: {
            ...draft.rawExtractions!.weighing!.result,
            requestId: "new-request",
          },
        },
      },
    },
  ]) {
    assert.equal(voiceProposalIsCurrent(changed), false);
    assert.equal(applyVoiceProposal(changed, [0]), changed);
  }
});

test("retry cannot duplicate surviving rows and manual deletion allows deliberate reimport", () => {
  let draft = applyVoiceProposal(fixture(), [0]);
  const retry = structuredClone(draft);
  retry.voiceExtraction!.result.vision.requestId = "voice-retry";
  retry.rawExtractions!.weighing!.result.requestId = "voice-retry";
  assert.equal(voiceProposalIsCurrent(retry), true);
  assert.equal(applyVoiceProposal(retry, [0, 1]), retry);
  draft = { ...draft, weighing: [] };
  const reimported = applyVoiceProposal(draft, [0]);
  assert.equal(reimported.weighing.length, 1);
  assert.equal(reimported.weighing[0].extractionItemIndex, 0);
});

test("unresolved names, weights and units remain empty until the user corrects them", () => {
  const draft = fixture();
  draft.voiceExtraction!.result.unresolvedFields = [
    { itemIndex: 0, field: "name", reason: "Jenis ikan belum jelas." },
    { itemIndex: 1, field: "weight", reason: "Angka belum jelas." },
    { itemIndex: 2, field: "unit", reason: "Satuan belum jelas." },
  ];
  const next = applyVoiceProposal(draft, [0, 1, 2]);
  assert.equal(next.weighing[0].name, "");
  assert.equal(next.weighing[1].kg, "");
  assert.equal(next.weighing[2].kg, "");
  assert.equal(next.weighingConfirmed, false);
  assert.equal(next.weighing[2].rawWeight, "5");
  assert.ok(next.weighing[2].extractionIssues!.includes("Satuan belum jelas."));
  const ambiguous = fixture();
  ambiguous.voiceExtraction!.result.vision.normalized.items[0].itemName =
    "T?ri";
  assert.equal(applyVoiceProposal(ambiguous, [0]).weighing[0].name, "");
});

test("voice cannot bypass the independent document classification gate", () => {
  const draft = fixture();
  const vision = draft.voiceExtraction!.result.vision;
  vision.raw = {
    ...vision.raw,
    schemaVersion: 2,
    documentType: "unknown",
    classification: { certainty: "uncertain", evidence: [] },
    readability: "partial",
  };
  assert.equal(sourceDocumentGate(draft, "weighing").canConfirm, false);
  assert.equal(applyVoiceProposal(draft, [0]), draft);
  assert.equal(
    applyVoiceProposal(emptyDraft(), [0]).voiceExtraction,
    undefined,
  );
});

test("imported voice uses the existing confirmed pair and exact 12/10/2 arithmetic", () => {
  let draft = applyVoiceProposal(fixture(), [0, 1]);
  draft.weighingConfirmed = true;
  draft.receiptConfirmed = true;
  draft.receipt = [row("Teri", "10", "25000"), row("Tongkol", "8", "30000")];
  draft.pairs = draft.weighing.map((row, index) => ({
    weighId: row.id,
    receiptId: draft.receipt[index].id,
    decision: "pending",
    adjustment: "",
    explanation: "",
  }));
  assert.equal(
    calculatePair({
      weighedName: "Teri",
      receiptName: "Tongkol",
      weighedKg: 12,
      receiptKg: 8,
      confirmed: true,
      savedAdjustmentKg: null,
    }).status,
    "invalid",
  );
  for (const pair of draft.pairs)
    draft = confirmPair(draft, pair.weighId, pair.receiptId).draft;
  assert.equal(
    draft.pairs.every((pair) => pair.decision === "confirmed"),
    true,
  );
  const input = {
    weighedName: draft.weighing[0].name,
    receiptName: draft.receipt[0].name,
    weighedKg: 12,
    receiptKg: 10,
    confirmed: true,
    savedAdjustmentKg: null,
  };
  assert.equal(calculatePair(input).remainingKg, 2);
  assert.equal(calculateAdjustmentPreview(input, 2).remainingKg, 0);
  assert.equal(calculatePair(input).remainingKg, 2);
  assert.equal(
    calculatePair({ ...input, savedAdjustmentKg: 2 }).remainingKg,
    0,
  );
  assert.equal(draft.weighing[0].kg, "12");
  assert.equal(draft.receipt[0].kg, "10");
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
