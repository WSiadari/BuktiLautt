import test from "node:test";
import assert from "node:assert/strict";
import { demoDraft } from "../data/demo.ts";
import { buildVisionResult } from "../vision/contract.ts";
import {
  classifiedFixture,
  rawFixture,
  requestFixture,
} from "../../server/test-fixtures.ts";
import {
  sourceDocumentGate,
  sanitizeDocumentConfirmations,
  extractionBelongsToSource,
} from "./documentValidation.ts";
import { confirmPair, sanitizeMatches } from "./matching.ts";
import { isDraft, isDraftStructure } from "../services/storage.ts";

function fixture() {
  const draft = demoDraft();
  draft.receipt[0].kg = "10";
  draft.weighingConfirmed = draft.receiptConfirmed = true;
  draft.pairs = [
    {
      weighId: draft.weighing[0].id,
      receiptId: draft.receipt[0].id,
      decision: "confirmed" as const,
      adjustment: "2",
      explanation: "Tidak terjual",
    },
  ];
  return draft;
}

test("domain and save boundaries block either opposite document while preserving evidence and adjustments", () => {
  for (const kind of ["weighing", "receipt"] as const) {
    const draft = fixture();
    const raw = classifiedFixture(
      kind === "weighing" ? "sales_receipt" : "weighing",
    );
    draft.rawExtractions = {
      [kind]: {
        result: buildVisionResult(
          raw,
          {
            ...requestFixture(), documentType: kind,
            sourceId: `${draft.id}:${kind}:${draft.sources[kind].capturedAt}`,
          },
          "mock",
        ),
        receivedAt: "now",
        sourceCapturedAt: draft.sources[kind].capturedAt,
      },
    };
    const before = structuredClone(draft);
    assert.equal(sourceDocumentGate(draft, kind).canConfirm, false);
    assert.equal(isDraftStructure(draft), true);
    assert.equal(isDraft(draft), false);
    assert.equal(
      confirmPair(draft, draft.pairs[0].weighId, draft.pairs[0].receiptId).ok,
      false,
    );
    assert.deepEqual(draft, before);
    const recovered = sanitizeDocumentConfirmations(draft);
    const matches = sanitizeMatches(recovered.draft);
    assert.equal(matches.draft[`${kind}Confirmed`], false);
    assert.equal(matches.draft.pairs[0].decision, "pending");
    assert.equal(matches.draft.pairs[0].adjustment, "2");
    assert.deepEqual(matches.draft.sources, before.sources);
    assert.deepEqual(matches.draft.rawExtractions, before.rawExtractions);
    assert.equal(isDraft(matches.draft), true);
  }
});

test("unknown and legacy extraction need replacement or re-read; stale AI rows cannot regain confirmation", () => {
  for (const raw of [classifiedFixture("unknown"), rawFixture("receipt")]) {
    const draft = fixture();
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
    assert.equal(sourceDocumentGate(draft, "receipt").canConfirm, false);
    draft.receipt[0].extractionRequestId = "old-ai";
    draft.sources.receipt.capturedAt += "-new";
    assert.equal(sourceDocumentGate(draft, "receipt").canConfirm, false);
    assert.equal(
      sanitizeDocumentConfirmations(draft).draft.receiptConfirmed,
      false,
    );
  }
  assert.equal(sourceDocumentGate(fixture(), "receipt").canConfirm, true);
});

test("foreign extraction IDs cannot confirm or save even when the outer capture time matches", () => {
  const draft = fixture();
  const raw = classifiedFixture("sales_receipt");
  draft.rawExtractions = {
    receipt: {
      result: buildVisionResult(raw, {
        ...requestFixture(), sourceId: "another-examination:receipt:another-source",
      }, "mock"),
      receivedAt: "now",
      sourceCapturedAt: draft.sources.receipt.capturedAt,
    },
  };
  const original = structuredClone(draft);
  assert.equal(extractionBelongsToSource(draft, "receipt"), false);
  assert.equal(sourceDocumentGate(draft, "receipt").canConfirm, false);
  assert.equal(isDraftStructure(draft), true);
  assert.equal(isDraft(draft), false);
  const recovered = sanitizeDocumentConfirmations(draft);
  assert.equal(recovered.draft.receiptConfirmed, false);
  assert.deepEqual(recovered.draft.rawExtractions, original.rawExtractions);
  assert.deepEqual(recovered.draft.sources, original.sources);
  assert.equal(recovered.draft.pairs[0].adjustment, "2");
  assert.deepEqual(draft, original);
});

test("source binding checks examination, document kind and capture identity but permits form revision changes", () => {
  const draft = fixture();
  draft.rawExtractions = {
    receipt: {
      result: buildVisionResult(classifiedFixture("sales_receipt"), {
        ...requestFixture(),
        sourceId: `${draft.id}:receipt:${draft.sources.receipt.capturedAt}`,
      }, "mock"),
      receivedAt: "now",
      sourceCapturedAt: draft.sources.receipt.capturedAt,
    },
  };
  assert.equal(extractionBelongsToSource(draft, "receipt"), true);
  assert.equal(sourceDocumentGate(draft, "receipt").canConfirm, true);
  draft.revision += 1;
  assert.equal(extractionBelongsToSource(draft, "receipt"), true);
  for (const sourceId of [
    `other:receipt:${draft.sources.receipt.capturedAt}`,
    `${draft.id}:weighing:${draft.sources.receipt.capturedAt}`,
    `${draft.id}:receipt:old-capture`,
  ]) {
    draft.rawExtractions.receipt!.result.sourceId = sourceId;
    assert.equal(extractionBelongsToSource(draft, "receipt"), false);
  }
});
