import test from "node:test";
import assert from "node:assert/strict";
import { isDraft, readDraft, DRAFT_KEY, DEMO_KEY } from "./storage.ts";
import { emptyDraft } from "../data/demo.ts";
import { buildVisionResult } from "../vision/contract.ts";
import {
  classifiedFixture,
  rawFixture,
  requestFixture,
} from "../../server/test-fixtures.ts";
import { sourceDocumentGate } from "../lib/documentValidation.ts";
import { buildVoiceResult } from "../voice/contract.ts";

const fixture = () => ({
  version: 1,
  id: "BL-TEST",
  demo: false,
  revision: 1,
  weighing: [
    {
      id: "w1",
      name: "Teri",
      kg: "12",
      price: "",
      provenance: "Diisi pengguna",
    },
  ],
  receipt: [
    {
      id: "r1",
      name: "Teri",
      kg: "10",
      price: "25000",
      provenance: "Diisi pengguna",
    },
  ],
  sources: {
    weighing: { text: "Teri12", filename: "w", capturedAt: "" },
    receipt: { text: "Teri10", filename: "r", capturedAt: "" },
  },
  weighingConfirmed: true,
  receiptConfirmed: true,
  pairs: [
    {
      weighId: "w1",
      receiptId: "r1",
      decision: "confirmed",
      adjustment: "",
      explanation: "",
    },
  ],
  unmatchedReceipts: [],
  deduction: "",
  charges: "0",
  savedAt: "",
});
test("complete draft validates; unknown money remains blank", () => {
  assert.equal(isDraft(fixture()), true);
});
test("incomplete nested draft is rejected before UI can render it", () => {
  assert.equal(
    isDraft({ version: 1, weighing: [], receipt: [], sources: {}, pairs: [] }),
    false,
  );
  const d = fixture();
  delete (d.sources as Partial<typeof d.sources>).receipt;
  assert.equal(isDraft(d), false);
});
test("missing references, duplicate rows and invalid confirmation reject", () => {
  const missing = fixture();
  missing.pairs[0].receiptId = "missing";
  assert.equal(isDraft(missing), false);
  const duplicate = fixture();
  duplicate.weighing.push(duplicate.weighing[0]);
  assert.equal(isDraft(duplicate), false);
  const unassigned = fixture();
  unassigned.pairs[0].receiptId = "";
  assert.equal(isDraft(unassigned), false);
});
test("read failure returns warning and never writes or removes user data", () => {
  let writes = 0;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => "{bad-json",
      setItem: () => writes++,
      removeItem: () => writes++,
    },
  });
  const loaded = readDraft();
  assert.equal(loaded.value, null);
  assert.equal(loaded.exists, true);
  assert.ok(loaded.warning);
  assert.equal(writes, 0);
});
test("demo and user drafts use different storage keys", () => {
  assert.notEqual(DRAFT_KEY, DEMO_KEY);
});
test("last previous review is optional, validated and non-active", () => {
  const d = {
    ...fixture(),
    previousReview: {
      revision: 1,
      sources: { weighing: "w", receipt: "r" },
      rows: [
        {
          name: "Teri",
          weighedKg: "12",
          receiptKg: "10",
          decision: "confirmed",
          adjustment: "2",
          explanation: "Dibawa pulang.",
        },
      ],
    },
  };
  assert.equal(isDraft(d), true);
  assert.equal(
    isDraft({
      ...d,
      previousReview: {
        ...d.previousReview,
        rows: [{ explanation: "Incomplete" }],
      },
    }),
    false,
  );
  assert.equal(d.pairs[0].adjustment, "");
});
test("saved demo recovery reads only the requested demo key", () => {
  const keys: string[] = [];
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => {
        keys.push(key);
        return JSON.stringify({ ...fixture(), demo: true });
      },
    },
  });
  assert.equal(readDraft(DEMO_KEY).value?.demo, true);
  assert.deepEqual(keys, [DEMO_KEY]);
});

test("Phase 4 raw extraction and confirmed values validate as separate optional snapshots", () => {
  const draft = emptyDraft();
  draft.receipt[0] = {
    ...draft.receipt[0],
    provenance: "Hasil AI",
    sourceSubtotal: "250000",
    sourceDiscount: "0",
    extractionRequestId: "request",
    rawText: "Teri 10kg",
    rawWeight: "10",
    rawUnit: "kg",
    extractionIssues: ["Periksa sumber"],
  };
  const result = buildVisionResult(
    classifiedFixture("sales_receipt"),
    requestFixture(),
    "test-model",
  );
  draft.rawExtractions = {
    receipt: { result, receivedAt: "now", sourceCapturedAt: "source-time" },
  };
  draft.confirmedSnapshots = {
    receipt: {
      revision: 1,
      confirmedAt: "now",
      sourceCapturedAt: "source-time",
      rows: structuredClone(draft.receipt),
      deduction: "0",
      charges: "",
    },
  };
  assert.equal(isDraft(draft), true);
  draft.receipt[0].kg = "12";
  assert.equal(draft.confirmedSnapshots.receipt!.rows[0].kg, "");
  assert.equal(isDraft(draft), true);
  const forged = structuredClone(draft);
  forged.rawExtractions!.receipt!.result.normalized.chargesRupiah = 123;
  assert.equal(isDraft(forged), false);
  assert.equal(
    isDraft({
      ...draft,
      rawExtractions: { weighing: draft.rawExtractions.receipt },
    }),
    false,
  );
  assert.equal(
    isDraft({
      ...draft,
      confirmedSnapshots: {
        receipt: {
          ...draft.confirmedSnapshots.receipt,
          rows: [{ id: "partial" }],
        },
      },
    }),
    false,
  );
  assert.equal(
    isDraft({
      ...draft,
      receipt: [{ ...draft.receipt[0], extractionIssues: [1] }],
    }),
    false,
  );
  assert.equal(
    isDraft({
      ...draft,
      receipt: [{ ...draft.receipt[0], sourceSubtotal: 250000 }],
    }),
    false,
  );
});

test("enum values require strings instead of accepting coerced arrays", () => {
  const draft = fixture();
  assert.equal(
    isDraft({
      ...draft,
      weighing: [{ ...draft.weighing[0], provenance: ["Diisi pengguna"] }],
    }),
    false,
  );
  assert.equal(
    isDraft({
      ...draft,
      pairs: [{ ...draft.pairs[0], decision: ["confirmed"] }],
    }),
    false,
  );
});

test("source item indices require safe request identity while legacy rows remain compatible", () => {
  const draft = emptyDraft();
  const base = { ...draft.receipt[0], extractionRequestId: "req-1" };
  assert.equal(isDraft({ ...draft, receipt: [base] }), true);
  for (const index of [0, 1, 99]) {
    assert.equal(
      isDraft({ ...draft, receipt: [{ ...base, extractionItemIndex: index }] }),
      true,
    );
  }
  for (const index of [-1, 0.5, 100, "0", null, NaN, Infinity]) {
    assert.equal(
      isDraft({ ...draft, receipt: [{ ...base, extractionItemIndex: index }] }),
      false,
    );
  }
  for (const requestId of [
    undefined,
    "",
    "req with spaces",
    "req\n1",
    "r".repeat(161),
    12,
  ]) {
    assert.equal(
      isDraft({
        ...draft,
        receipt: [
          { ...base, extractionRequestId: requestId, extractionItemIndex: 0 },
        ],
      }),
      false,
    );
  }
  const indexed = { ...base, extractionItemIndex: 1 };
  assert.equal(
    isDraft({
      ...draft,
      confirmedSnapshots: {
        receipt: {
          revision: 1,
          confirmedAt: "now",
          sourceCapturedAt: "source",
          rows: [indexed],
          deduction: "",
          charges: "",
        },
      },
    }),
    true,
  );
  assert.equal(
    isDraft({
      ...draft,
      confirmedSnapshots: {
        receipt: {
          revision: 1,
          confirmedAt: "now",
          sourceCapturedAt: "source",
          rows: [{ ...indexed, extractionItemIndex: -1 }],
          deduction: "",
          charges: "",
        },
      },
    }),
    false,
  );
});

test("legacy mismatched confirmed fish is recovered for review without losing source or adjustment", () => {
  const old = fixture();
  old.receipt[0].name = "Tongkol";
  old.pairs[0].adjustment = "2";
  old.pairs[0].explanation = "Catatan lama dipertahankan.";
  const original = JSON.stringify(old);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => original },
  });
  assert.equal(isDraft(old), false);
  const loaded = readDraft();
  assert.ok(loaded.value);
  assert.match(loaded.warning, /ditinjau ulang/);
  assert.equal(loaded.value.pairs[0].decision, "pending");
  assert.ok(loaded.value.pairs[0].reviewIssue);
  assert.equal(loaded.value.pairs[0].receiptId, old.pairs[0].receiptId);
  assert.equal(loaded.value.pairs[0].adjustment, "2");
  assert.equal(loaded.value.pairs[0].explanation, old.pairs[0].explanation);
  assert.deepEqual(loaded.value.sources, old.sources);
  assert.deepEqual(loaded.value.weighing, old.weighing);
  assert.deepEqual(loaded.value.receipt, old.receipt);
  assert.equal(loaded.value.previousReview?.rows[0].decision, "pending");
  assert.equal(loaded.value.previousReview?.rows[0].receiptName, "Tongkol");
  assert.ok(loaded.value.previousReview?.rows[0].reviewIssue);
  assert.equal(isDraft(loaded.value), true);
  assert.equal(JSON.stringify(old), original);
});

test("persisted receipt reuse cannot remain confirmed and repair is idempotent", () => {
  const old = fixture();
  old.weighing.push({ ...old.weighing[0], id: "w2" });
  old.pairs.push({ ...old.pairs[0], weighId: "w2" });
  let payload = JSON.stringify(old);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => payload },
  });
  assert.equal(isDraft(old), false);
  const repaired = readDraft().value!;
  assert.ok(
    repaired.pairs.every(
      (pair) => pair.decision === "pending" && pair.reviewIssue,
    ),
  );
  payload = JSON.stringify(repaired);
  assert.deepEqual(readDraft().value, repaired);
  assert.equal(
    isDraft({
      ...repaired,
      pairs: [{ ...repaired.pairs[0], reviewIssue: {} }],
    }),
    false,
  );
});

test("legacy unclassified and unknown extraction revoke saved confirmation without erasing evidence", () => {
  for (const raw of [rawFixture("receipt"), classifiedFixture("unknown")]) {
    const old = emptyDraft();
    old.weighing[0] = { ...old.weighing[0], name: "Teri", kg: "12" };
    old.receipt[0] = {
      ...old.receipt[0],
      name: "Teri",
      kg: "10",
      price: "25000",
    };
    old.weighingConfirmed = old.receiptConfirmed = true;
    old.rawExtractions = {
      receipt: {
        result: buildVisionResult(raw, requestFixture(), "test-model"),
        receivedAt: "original-time",
        sourceCapturedAt: old.sources.receipt.capturedAt,
      },
    };
    old.pairs = [
      {
        weighId: old.weighing[0].id,
        receiptId: old.receipt[0].id,
        decision: "confirmed",
        adjustment: "2",
        explanation: "Keterangan asli.",
      },
    ];
    const original = JSON.stringify(old);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: () => original },
    });
    assert.equal(isDraft(old), false);
    const recovered = readDraft();
    assert.ok(recovered.value);
    assert.match(recovered.warning, /Jenis dokumen/);
    assert.equal(recovered.value.receiptConfirmed, false);
    assert.equal(recovered.value.weighingConfirmed, true);
    assert.equal(
      sourceDocumentGate(recovered.value, "receipt").canConfirm,
      false,
    );
    assert.deepEqual(recovered.value.rawExtractions, old.rawExtractions);
    assert.deepEqual(recovered.value.sources, old.sources);
    assert.deepEqual(recovered.value.receipt, old.receipt);
    assert.equal(recovered.value.pairs[0].decision, "pending");
    assert.equal(recovered.value.pairs[0].adjustment, "2");
    assert.equal(recovered.value.pairs[0].explanation, "Keterangan asli.");
    assert.equal(isDraft(recovered.value), true);
    assert.equal(JSON.stringify(old), original);
  }
});

test("voice metadata validates without accepting a clip or malformed result in persistent data", () => {
  const draft = emptyDraft();
  const transcript = "Teri dua belas kilo.";
  draft.sources.weighing = {
    text: transcript,
    filename: "Rekaman suara",
    capturedAt: "recording-one",
  };
  const extraction = classifiedFixture("weighing");
  extraction.items[0].weightValue = "12";
  const result = buildVoiceResult(
    { transcript, extraction, unresolvedFields: [] },
    {
      requestId: "voice-one",
      sourceId: `${draft.id}:weighing:recording-one`,
      sourceRevision: "1",
      audioDataUrl: "",
    },
    "test-model",
  );
  draft.voiceExtraction = {
    result,
    receivedAt: "received",
    sourceCapturedAt: "recording-one",
  };
  draft.rawExtractions = {
    weighing: {
      result: result.vision,
      receivedAt: "received",
      sourceCapturedAt: "recording-one",
    },
  };
  assert.equal(isDraft(draft), true);
  for (const invalid of [
    null,
    { result, receivedAt: "received" },
    { ...draft.voiceExtraction, sourceCapturedAt: 12 },
    {
      ...draft.voiceExtraction,
      audioDataUrl: "data:audio/wav;base64,YXVkaW8=",
    },
    { ...draft.voiceExtraction, clip: new Blob(["audio"]) },
    { ...draft.voiceExtraction, result: { ...result, transcript: 12 } },
    {
      ...draft.voiceExtraction,
      result: { ...result, audioDataUrl: "data:audio/wav;base64,YXVkaW8=" },
    },
    {
      ...draft.voiceExtraction,
      result: {
        ...result,
        unresolvedFields: [
          { itemIndex: 10, field: "weight", reason: "Missing" },
        ],
      },
    },
  ])
    assert.equal(isDraft({ ...draft, voiceExtraction: invalid }), false);
  const forged = structuredClone(draft);
  forged.voiceExtraction!.result.vision.normalized.items[0].weightKg = 99;
  assert.equal(isDraft(forged), false);
  const old = structuredClone(draft);
  delete old.voiceExtraction;
  assert.equal(isDraft(old), true);
});

test("archive transaction key is optional for old drafts and preserves a validated durable UUID", () => {
 const draft=emptyDraft();assert.equal(isDraft(draft),true);
 draft.transactionKey=crypto.randomUUID();assert.equal(isDraft(draft),true);
 assert.equal(isDraft({...draft,transactionKey:"BL-short-reused-id"}),false);
 assert.equal(isDraft({...draft,transactionKey:{id:draft.transactionKey}}),false);
});
