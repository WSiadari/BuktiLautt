import assert from "node:assert/strict";
import test from "node:test";
import { demoDraft } from "../data/demo.ts";
import { calculatePair } from "./examination.ts";
import {
  buildMatchReviewSnapshot,
  confirmPair,
  confirmedPairsAreValid,
  normalizeFishName,
  sanitizeMatches,
  validatePair,
} from "./matching.ts";
import type { Draft } from "../types.ts";

function fixture(): Draft {
  const draft = demoDraft();
  draft.receipt[0].kg = "10";
  draft.pairs = draft.weighing.map((row, index) => ({
    weighId: row.id,
    receiptId: draft.receipt[index].id,
    decision: "pending",
    adjustment: "",
    explanation: "",
  }));
  return draft;
}

test("normalization accepts clear exact labels and harmless typography without aliases", () => {
  for (const name of [
    "Teri",
    " teri ",
    "TERI",
    "ikan   Teri",
    "ＩＫＡＮ　ＴＥＲＩ",
  ])
    assert.equal(normalizeFishName(name), "teri");
  assert.equal(normalizeFishName("ikan\tTONGKOL"), "tongkol");
  assert.equal(normalizeFishName("Kembung"), "kembung");
  for (const name of [
    "",
    "ikan",
    "campuran",
    "T?ri",
    "unknown",
    "ikan laut",
    "ikan air tawar",
    "ikan ikan teri",
    "Teri/Tongkol",
    "teri atau tongkol",
    "teri tongkol",
    "teri-tongkol",
    "tidak diketahui",
    "belum terbaca",
    "teri\u200btongkol",
    null,
    undefined,
    12,
  ])
    assert.equal(normalizeFishName(name), null);
  assert.equal(normalizeFishName("Tuna"), "tuna");
  assert.equal(normalizeFishName("Teri Medan"), "teri medan");
  assert.notEqual(normalizeFishName("Teri Medan"), normalizeFishName("Teri"));
  assert.equal(normalizeFishName("Layang-Layang"), "layang-layang");
  assert.notEqual(normalizeFishName("Anchovy"), normalizeFishName("Teri"));
  assert.notEqual(normalizeFishName("tеri"), normalizeFishName("teri"));
});

test("central confirmation rejects cross-species, absent and ambiguous rows without mutation", () => {
  const draft = fixture();
  const original = structuredClone(draft);
  const first = draft.weighing[0].id;
  assert.equal(
    confirmPair(draft, first, draft.receipt[1].id).validation.code,
    "different-name",
  );
  assert.equal(
    confirmPair(draft, "missing", draft.receipt[0].id).validation.code,
    "missing-row",
  );
  draft.receipt[0].name = "campuran";
  assert.equal(
    confirmPair(draft, first, draft.receipt[0].id).validation.code,
    "ambiguous-name",
  );
  draft.receipt[0].name = original.receipt[0].name;
  assert.deepEqual(draft, original);
  const confirmed = confirmPair(draft, first, draft.receipt[0].id);
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.draft.pairs[0].decision, "confirmed");
  assert.equal(draft.pairs[0].decision, "pending");
  draft.weighing[0].name = "Tuna";
  draft.receipt[0].name = " ikan TUNA ";
  assert.equal(confirmPair(draft, first, draft.receipt[0].id).ok, true);
});

test("duplicate fish names remain separate rows and a receipt row cannot be reused", () => {
  const draft = fixture();
  draft.weighing[1].name = "Teri";
  draft.receipt[1].name = "ikan teri";
  const first = confirmPair(
    draft,
    draft.weighing[0].id,
    draft.receipt[0].id,
  ).draft;
  const second = confirmPair(first, draft.weighing[1].id, draft.receipt[1].id);
  assert.equal(second.ok, true);
  assert.equal(confirmedPairsAreValid(second.draft), true);
  assert.equal(
    confirmPair(first, draft.weighing[1].id, draft.receipt[0].id).validation
      .code,
    "row-reused",
  );
  const duplicate = {
    ...first,
    pairs: [...first.pairs, { ...first.pairs[0] }],
  };
  assert.equal(
    validatePair(duplicate, draft.weighing[0].id, draft.receipt[0].id).code,
    "row-reused",
  );
});

test("recovery demotes old mismatches and preserves sources, explanation and adjustment as inactive history", () => {
  const draft = fixture();
  draft.pairs[0] = {
    ...draft.pairs[0],
    receiptId: draft.receipt[1].id,
    decision: "confirmed",
    adjustment: "2",
    explanation: "  Dibawa pulang.\nKeterangan asli.  ",
  };
  const original = structuredClone(draft);
  assert.equal(confirmedPairsAreValid(draft), false);
  const recovered = sanitizeMatches(draft);
  assert.equal(recovered.changed, true);
  assert.equal(recovered.draft.pairs[0].decision, "pending");
  assert.equal(recovered.draft.pairs[0].adjustment, "2");
  assert.equal(
    recovered.draft.pairs[0].explanation,
    original.pairs[0].explanation,
  );
  assert.equal(
    recovered.draft.previousReview?.rows[0].explanation,
    original.pairs[0].explanation,
  );
  assert.equal(recovered.draft.previousReview?.rows[0].decision, "pending");
  assert.equal(
    recovered.draft.previousReview?.rows[0].reviewIssue,
    recovered.issues[0].message,
  );
  assert.equal(
    recovered.draft.previousReview?.rows[0].receiptId,
    original.receipt[1].id,
  );
  assert.equal(recovered.draft.previousReview?.rows[0].receiptName, "Tongkol");
  assert.equal(recovered.draft.previousReview?.revision, original.revision);
  assert.deepEqual(recovered.draft.sources, original.sources);
  assert.deepEqual(draft, original);
  assert.equal(
    calculatePair({
      weighedName: "Teri",
      receiptName: "Tongkol",
      weighedKg: 12,
      receiptKg: 8,
      confirmed: false,
      savedAdjustmentKg: 2,
    }).remainingKg,
    null,
  );
  const again = sanitizeMatches(recovered.draft);
  assert.equal(again.changed, false);
  assert.equal(again.draft, recovered.draft);
  assert.equal(again.issues.length, 1);
});

test("recovery rejects every conflicting confirmation and leaves valid records untouched", () => {
  const draft = fixture();
  draft.weighing[1].name = "Teri";
  draft.pairs = draft.pairs.map((pair) => ({
    ...pair,
    receiptId: draft.receipt[0].id,
    decision: "confirmed",
  }));
  const recovered = sanitizeMatches(draft);
  assert.equal(recovered.issues.length, 2);
  assert.equal(
    recovered.draft.pairs.every((pair) => pair.decision === "pending"),
    true,
  );
  const valid = fixture();
  valid.pairs[0].decision = "confirmed";
  assert.equal(sanitizeMatches(valid).draft, valid);
  assert.equal(confirmedPairsAreValid(valid), true);
});

test("name edits invalidate report eligibility and reconfirmation cannot reactivate an old adjustment", () => {
  const draft = fixture();
  draft.pairs[0] = {
    ...draft.pairs[0],
    decision: "confirmed",
    adjustment: "2",
    explanation: "Dibawa pulang.",
  };
  const secondConfirm = confirmPair(
    draft,
    draft.weighing[0].id,
    draft.receipt[0].id,
  );
  assert.equal(secondConfirm.draft, draft);
  draft.receipt[0].name = "Kembung";
  assert.equal(confirmedPairsAreValid(draft), false);
  const recovered = sanitizeMatches(draft).draft;
  recovered.receipt[0].name = "Teri";
  const confirmed = confirmPair(
    recovered,
    recovered.weighing[0].id,
    recovered.receipt[0].id,
  );
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.draft.pairs[0].adjustment, "");
  assert.equal(confirmed.draft.pairs[0].explanation, "");
  assert.equal(
    confirmed.draft.previousReview?.rows[0].explanation,
    "Dibawa pulang.",
  );
});

test("invalidated adjustments survive multiple later choices and source review snapshots", () => {
  const old = fixture();
  old.pairs = old.weighing.map((weighing, index) => ({
    weighId: weighing.id,
    receiptId: old.receipt[1 - index].id,
    decision: "confirmed",
    adjustment: String(index + 1),
    explanation: `Alasan lama ${index}.`,
  }));
  let current = sanitizeMatches(old).draft;
  assert.equal(
    current.previousReview?.rows.filter((row) => row.reviewIssue).length,
    2,
  );
  const beforeChoice = buildMatchReviewSnapshot(current);
  current = {
    ...current,
    previousReview: beforeChoice,
    pairs: current.pairs.map((pair, index) =>
      index === 0
        ? {
            ...pair,
            decision: "unmatched",
            receiptId: "",
            adjustment: "",
            explanation: "",
            reviewIssue: undefined,
          }
        : pair,
    ),
  };
  const result = confirmPair(
    current,
    current.weighing[1].id,
    current.receipt[1].id,
  );
  assert.equal(result.ok, true);
  current = result.draft;
  const history = current.previousReview!.rows.filter((row) => row.reviewIssue);
  assert.equal(history.length, 2);
  assert.deepEqual(history.map((row) => row.adjustment).sort(), ["1", "2"]);
  assert.ok(history.some((row) => row.explanation === "Alasan lama 0."));
  assert.ok(history.some((row) => row.explanation === "Alasan lama 1."));
  const snapshot = buildMatchReviewSnapshot({
    ...current,
    revision: current.revision + 1,
    sources: {
      ...current.sources,
      weighing: { ...current.sources.weighing, capturedAt: "new-source" },
    },
  });
  assert.equal(snapshot.rows.filter((row) => row.reviewIssue).length, 2);
  assert.equal(
    snapshot.rows.find((row) => row.explanation === "Alasan lama 0.")
      ?.sourceWeighing,
    beforeChoice.sources.weighing,
  );
});
