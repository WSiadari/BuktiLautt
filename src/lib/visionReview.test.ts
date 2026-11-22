import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVisionResult,
  type RawExtraction,
  type VisionResult,
} from "../vision/contract.ts";
import { emptyDraft } from "../data/demo.ts";
import {
  proposalIsCurrent,
  proposalRows,
  applyEligibleProposalRows,
  proposalImportState,
  withProposalAssociations,
  rowWeightProvenance,
  sourceDocumentGate,
} from "./visionReview.ts";

function result() {
  const raw: RawExtraction = {
    schemaVersion: 2,
    documentType: "sales_receipt",
    classification: {
      certainty: "clear",
      evidence: ["Teks nota penjualan dan kolom subtotal terbaca."],
    },
    readability: "partial",
    items: [
      {
        itemName: "Teri",
        weightValue: "500",
        weightUnit: "g",
        unitPrice: null,
        subtotal: "Rp 12.500",
        discount: null,
        rawText: "Teri 500 g Rp 12.500",
        issues: ["Harga per kg tidak tertulis"],
      },
    ],
    extractedDate: null,
    documentTotal: "Rp 12.500",
    deduction: null,
    charges: null,
    notes: null,
    warnings: [],
  };
  return buildVisionResult(
    raw,
    {
      documentType: "receipt",
      requestId: "req-1",
      sourceId: "source-1",
      sourceRevision: "1",
      text: "fixture",
    },
    "test-model",
  );
}
function boundResult(
  extraction: VisionResult,
  draft: ReturnType<typeof emptyDraft>,
  kind: "weighing" | "receipt" = "receipt",
): VisionResult {
  return {
    ...extraction,
    sourceId: draft.id + ":" + kind + ":" + draft.sources[kind].capturedAt,
  };
}
test("review keeps a known subtotal and raw grams without manufacturing a unit price", () => {
  const extraction = result();
  const original = structuredClone(extraction);
  const rows = proposalRows(extraction, [0, 0, -1, 20]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kg, "0.5");
  assert.equal(rows[0].price, "");
  assert.equal(rows[0].sourceSubtotal, "12500");
  assert.equal(rows[0].rawWeight, "500");
  assert.equal(rows[0].rawUnit, "g");
  assert.equal(rows[0].provenance, "Hasil AI");
  rows[0].kg = "0.6";
  assert.deepEqual(extraction, original);
});
test("a proposal follows source identity rather than form or examination revision", () => {
  const draft = emptyDraft();
  draft.rawExtractions = {
    receipt: {
      result: boundResult(result(), draft),
      receivedAt: "now",
      sourceCapturedAt: draft.sources.receipt.capturedAt,
    },
  };
  assert.equal(proposalIsCurrent(draft, "receipt"), true);
  assert.equal(proposalIsCurrent(draft, "weighing"), false);
  assert.equal(
    proposalIsCurrent(
      {
        ...draft,
        rawExtractions: {
          receipt: {
            ...draft.rawExtractions.receipt!,
            result: {
              ...draft.rawExtractions.receipt!.result,
              sourceId: "another-examination:receipt:another-source",
            },
          },
        },
      },
      "receipt",
    ),
    false,
  );
  assert.equal(proposalIsCurrent({ ...draft, revision: 2 }, "receipt"), true);
  assert.equal(
    proposalIsCurrent(
      {
        ...draft,
        sources: {
          ...draft.sources,
          receipt: { ...draft.sources.receipt, capturedAt: "replacement" },
        },
      },
      "receipt",
    ),
    false,
  );
});

function threeItems(kind: "weighing" | "receipt" = "receipt") {
  const base = result();
  const raw = {
    ...base.raw,
    documentType:
      kind === "receipt" ? ("sales_receipt" as const) : ("weighing" as const),
    classification: {
      certainty: "clear" as const,
      evidence: [
        kind === "receipt"
          ? "Nota penjualan dengan subtotal."
          : "Catatan timbang berisi daftar berat.",
      ],
    },
    items: [
      {
        ...base.raw.items[0],
        itemName: "Teri",
        weightValue: "12",
        weightUnit: "kg",
        rawText: "Teri 12 kg",
      },
      {
        ...base.raw.items[0],
        itemName: "Teri",
        weightValue: "8",
        weightUnit: "kg",
        rawText: "Teri 8 kg",
      },
      {
        ...base.raw.items[0],
        itemName: "Kembung",
        weightValue: "5,5",
        weightUnit: "kg",
        rawText: "Kembung 5,5 kg",
      },
    ],
  };
  return buildVisionResult(
    raw,
    {
      documentType: kind,
      requestId: "request-three",
      sourceId: "source-three",
      sourceRevision: "1",
      text: "fixture",
    },
    "test-model",
  );
}
for (const kind of ["weighing", "receipt"] as const)
  test(
    kind +
      " partial imports are idempotent, preserve repeated fish names, survive refresh and allow deliberate deleted-item reimport",
    () => {
      const extraction = threeItems(kind);
      let rows = applyEligibleProposalRows([], extraction, [0]);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].extractionItemIndex, 0);
      rows[0].kg = "11";
      rows = applyEligibleProposalRows(rows, extraction, [1]);
      assert.equal(rows.length, 2);
      assert.deepEqual(
        proposalImportState(rows, extraction).eligibleIndices,
        [2],
      );
      rows = applyEligibleProposalRows(rows, extraction, [0, 0, 1]);
      assert.equal(rows.length, 2);
      assert.equal(rows[0].kg, "11");
      rows = applyEligibleProposalRows(rows, extraction, [0, 1, 2]);
      assert.equal(rows.length, 3);
      rows = structuredClone(rows);
      assert.deepEqual(
        proposalImportState(rows, extraction).eligibleIndices,
        [],
      );
      assert.equal(
        applyEligibleProposalRows(rows, extraction, [0, 1, 2]).length,
        3,
      );
      rows = rows.filter((row) => row.extractionItemIndex !== 1);
      assert.deepEqual(
        proposalImportState(rows, extraction).eligibleIndices,
        [1],
      );
      rows = applyEligibleProposalRows(rows, extraction, [1, 1]);
      assert.equal(rows.length, 3);
      assert.equal(
        rows.filter((row) => row.extractionItemIndex === 1).length,
        1,
      );
    },
  );
test("legacy partial rows associate only unique preserved raw metadata and backfill during normal writes", () => {
  const extraction = threeItems();
  const legacy = proposalRows(extraction, [0, 1]).map((row) => {
    const copy = { ...row, kg: "99", name: "Nama dikoreksi" };
    delete copy.extractionItemIndex;
    return copy;
  });
  const state = proposalImportState(legacy, extraction);
  assert.deepEqual(state.appliedIndices, [0, 1]);
  assert.deepEqual(state.eligibleIndices, [2]);
  const draft = emptyDraft();
  draft.receipt = legacy;
  draft.rawExtractions = {
    receipt: {
      result: boundResult(extraction, draft),
      receivedAt: "now",
      sourceCapturedAt: draft.sources.receipt.capturedAt,
    },
  };
  const updated = withProposalAssociations(draft);
  assert.equal(updated.receipt[0].extractionItemIndex, 0);
  assert.equal(updated.receipt[0].kg, "99");
  assert.equal(draft.receipt[0].extractionItemIndex, undefined);
  assert.equal(
    applyEligibleProposalRows(updated.receipt, extraction, [0, 1, 2]).length,
    3,
  );
});
test("ambiguous legacy raw duplicates block only their source candidates, while unrelated unique item remains selectable", () => {
  const extraction = threeItems();
  extraction.raw.items[1] = { ...extraction.raw.items[0] };
  const legacy = proposalRows(extraction, [0])[0];
  delete legacy.extractionItemIndex;
  const state = proposalImportState([legacy], extraction);
  assert.deepEqual(state.blockedIndices, [0, 1]);
  assert.deepEqual(state.eligibleIndices, [2]);
  assert.equal(state.legacyWarning, true);
  assert.equal(
    applyEligibleProposalRows([legacy], extraction, [0, 1, 2]).length,
    2,
  );
});
test("unknown legacy metadata never guesses from name or corrected weight", () => {
  const extraction = threeItems();
  const legacy = proposalRows(extraction, [0])[0];
  delete legacy.extractionItemIndex;
  delete legacy.rawText;
  const state = proposalImportState([legacy], extraction);
  assert.deepEqual(state.eligibleIndices, []);
  assert.equal(state.legacyWarning, true);
});
test("legacy duplicate associations remain visible for manual review without deletion or reimport", () => {
  const extraction = threeItems();
  const indexed = proposalRows(extraction, [0])[0];
  const legacy = { ...indexed, id: crypto.randomUUID() };
  delete legacy.extractionItemIndex;
  const state = proposalImportState([indexed, legacy], extraction);
  assert.equal(state.duplicateAssociations, true);
  assert.equal(state.legacyWarning, true);
  assert.deepEqual(state.appliedIndices, [0]);
  assert.deepEqual(state.eligibleIndices, [1, 2]);
  assert.equal(
    applyEligibleProposalRows([indexed, legacy], extraction, [0]).length,
    2,
  );
});
test("static provenance separates unchanged AI value, actual numeric correction and filling an unknown", () => {
  const row = proposalRows(result(), [0])[0];
  assert.equal(rowWeightProvenance(row).status, "same");
  assert.equal(
    rowWeightProvenance({ ...row, kg: "0,5", name: "Nama dikoreksi" }).status,
    "same",
  );
  assert.equal(rowWeightProvenance({ ...row, kg: "0.6" }).status, "changed");
  assert.equal(
    rowWeightProvenance({ ...row, rawWeight: "", kg: "1" }).status,
    "filled",
  );
});
import {
  isClassifiedExtraction,
  type ActualDocumentType,
  type DocumentType,
} from "../vision/contract.ts";
function classifiedResult(
  expected: DocumentType,
  actual: ActualDocumentType,
  readability: "readable" | "partial" | "unreadable" = "readable",
) {
  const original = result();
  const raw = {
    ...original.raw,
    schemaVersion: 2 as const,
    documentType: actual,
    classification: {
      certainty:
        actual === "unknown" ? ("uncertain" as const) : ("clear" as const),
      evidence: [
        actual === "sales_receipt"
          ? "Nota penjualan dan kolom harga terbaca."
          : actual === "weighing"
            ? "Daftar hasil timbang terbaca."
            : "Jenis sumber belum jelas.",
      ],
    },
    readability,
    items: readability === "unreadable" ? [] : original.raw.items,
  };
  return buildVisionResult(
    raw,
    {
      documentType: expected,
      requestId: "classified-request",
      sourceId: "source-current",
      sourceRevision: "1",
      text: "fixture",
    },
    "test-model",
  );
}
test("direct import and source confirmation both reject wrong-type, unknown and successfully unreadable evidence", () => {
  for (const extraction of [
    classifiedResult("weighing", "sales_receipt"),
    classifiedResult("receipt", "weighing"),
    classifiedResult("receipt", "unknown"),
    classifiedResult("receipt", "sales_receipt", "unreadable"),
  ]) {
    const kind = extraction.documentType;
    const draft = emptyDraft();
    draft.rawExtractions = {
      [kind]: {
        result: boundResult(extraction, draft, kind),
        receivedAt: "now",
        sourceCapturedAt: draft.sources[kind].capturedAt,
      },
    };
    assert.equal(sourceDocumentGate(draft, kind).canConfirm, false);
    assert.deepEqual(proposalRows(extraction, [0]), []);
    const previous = [{ ...draft[kind][0], name: "Teri", kg: "8" }];
    assert.deepEqual(
      applyEligibleProposalRows(previous, extraction, [0]),
      previous,
    );
    assert.deepEqual(
      extraction.raw.items.length === 0 ? extraction.normalized.items : [],
      [],
    );
  }
});
test("old unclassified extraction remains read-only, and choosing manual entries cannot remove its document gate", () => {
  const original = result();
  assert.equal(isClassifiedExtraction(original.raw), true);
  if (!isClassifiedExtraction(original.raw)) throw Error("fixture");
  const { schemaVersion, classification, readability, ...fields } =
    original.raw;
  const legacy = buildVisionResult(
    { ...fields, documentType: "receipt" },
    {
      documentType: "receipt",
      requestId: original.requestId,
      sourceId: original.sourceId,
      sourceRevision: original.sourceRevision,
      text: "fixture",
    },
    "old-model",
  );
  const draft = emptyDraft();
  draft.rawExtractions = {
    receipt: {
      result: boundResult(legacy, draft),
      receivedAt: "old",
      sourceCapturedAt: draft.sources.receipt.capturedAt,
    },
  };
  draft.receipt = [
    {
      ...draft.receipt[0],
      name: "Teri",
      kg: "2",
      price: "25000",
      provenance: "Diisi pengguna",
    },
  ];
  const preserved = structuredClone(draft);
  assert.equal(sourceDocumentGate(draft, "receipt").canConfirm, false);
  assert.deepEqual(proposalRows(legacy, [0]), []);
  assert.deepEqual(
    applyEligibleProposalRows(draft.receipt, legacy, [0]),
    draft.receipt,
  );
  assert.deepEqual(draft, preserved);
});
test("a compatible partial result permits reviewed proposals without inventing missing price", () => {
  const extraction = classifiedResult("receipt", "sales_receipt", "partial");
  const draft = emptyDraft();
  draft.rawExtractions = {
    receipt: {
      result: boundResult(extraction, draft),
      receivedAt: "now",
      sourceCapturedAt: draft.sources.receipt.capturedAt,
    },
  };
  assert.equal(sourceDocumentGate(draft, "receipt").canConfirm, true);
  assert.equal(proposalRows(extraction, [0]).length, 1);
  assert.equal(proposalRows(extraction, [0])[0].price, "");
});
test("new request after retry cannot duplicate surviving prior AI rows or overwrite corrections", () => {
  const first = threeItems();
  const rows = applyEligibleProposalRows([], first, [0, 1]);
  rows[0].kg = "11";
  const next = buildVisionResult(
    first.raw,
    {
      documentType: first.documentType,
      requestId: "retry-new-request",
      sourceId: first.sourceId,
      sourceRevision: first.sourceRevision,
      text: "fixture",
    },
    "test-model",
  );
  const snapshot = structuredClone(rows);
  assert.equal(proposalImportState(rows, next).previousExtractionRows, 2);
  assert.deepEqual(proposalImportState(rows, next).eligibleIndices, []);
  assert.deepEqual(applyEligibleProposalRows(rows, next, [0, 1, 2]), snapshot);
  assert.equal(rows[0].kg, "11");
  assert.equal(applyEligibleProposalRows([], next, [0, 1, 2]).length, 3);
});
