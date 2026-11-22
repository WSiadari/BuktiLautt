import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { emptyDraft } from "../data/demo.ts";
import { DRAFT_KEY, DEMO_KEY } from "./storage.ts";
import {
  DATABASE_NAME,
  DATABASE_VERSION,
  loadDraft,
  saveDraft,
} from "./indexedDb.ts";
import { buildVisionResult } from "../vision/contract.ts";
import {
  applyEligibleProposalRows,
  proposalImportState,
  proposalIsCurrent,
  withProposalAssociations,
} from "../lib/visionReview.ts";
import {
  classifiedFixture,
  rawFixture,
  requestFixture,
} from "../../server/test-fixtures.ts";
import { sourceDocumentGate } from "../lib/documentValidation.ts";
import type { Draft } from "../types.ts";
import { buildVoiceResult } from "../voice/contract.ts";
import {
  applyVoiceProposal,
  voiceProposalIsCurrent,
} from "../lib/voiceReview.ts";

const photo =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=";
let legacy: Map<string, string>;
beforeEach(() => {
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: new IDBFactory(),
  });
  legacy = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => legacy.get(key) ?? null,
      setItem: () => {
        throw new Error("New persistence must not write localStorage");
      },
      removeItem: () => {
        throw new Error("Legacy records must remain intact");
      },
    },
  });
});

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function stored(store: string, key: string): Promise<unknown> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store);
      const request = tx.objectStore(store).get(key);
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

test("source photo is a Blob, restores after a fresh read, and demo saves stay isolated", async () => {
  const user = emptyDraft();
  user.sources.weighing.image = photo;
  user.sources.weighing.filename = "timbang.png";
  await saveDraft(user);
  const record = (await stored("drafts", DRAFT_KEY)) as {
    value: typeof user;
    imageKeys: Record<string, string>;
  };
  assert.equal(record.value.sources.weighing.image, undefined);
  assert.equal(JSON.stringify(record).includes("base64"), false);
  const blob = await stored("images", `${DRAFT_KEY}:weighing`);
  assert.ok(blob instanceof Blob);
  assert.equal(blob.type, "image/png");
  assert.deepEqual((await loadDraft()).value, user);
  const demo = { ...emptyDraft(), id: "BL-006", demo: true };
  await saveDraft(demo);
  assert.deepEqual((await loadDraft(DEMO_KEY)).value, demo);
  assert.deepEqual((await loadDraft()).value, user);
  await saveDraft({
    ...user,
    sources: {
      ...user.sources,
      weighing: { text: "Teri12", filename: "text", capturedAt: "new" },
    },
  });
  assert.equal(await stored("images", `${DRAFT_KEY}:weighing`), undefined);
  assert.equal((await loadDraft(DEMO_KEY)).value?.id, "BL-006");
});

test("save resolves only after transaction completion and abort restores both prior records", async (t) => {
  const initial = emptyDraft();
  initial.sources.receipt.image = photo;
  await saveDraft(initial);
  const original = IDBObjectStore.prototype.put;
  let complete = false;
  let requestSucceeded = false;
  const tracking = t.mock.method(
    IDBObjectStore.prototype,
    "put",
    function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      const request = original.call(this, value, key);
      if (this.name === "drafts") {
        request.addEventListener("success", () => {
          requestSucceeded = true;
        });
        this.transaction.addEventListener("complete", () => {
          complete = true;
        });
      }
      return request;
    },
  );
  await saveDraft({ ...initial, revision: 2 });
  assert.equal(requestSucceeded, true);
  assert.equal(complete, true);
  tracking.mock.restore();
  t.mock.method(
    IDBObjectStore.prototype,
    "put",
    function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      const request = original.call(this, value, key);
      if (this.name === "drafts")
        request.addEventListener("success", () => this.transaction.abort());
      return request;
    },
  );
  await assert.rejects(
    saveDraft({
      ...initial,
      revision: 3,
      sources: {
        ...initial.sources,
        receipt: { text: "replacement", filename: "text", capturedAt: "new" },
      },
    }),
  );
  const loaded = await loadDraft();
  assert.equal(loaded.value?.revision, 2);
  assert.equal(loaded.value?.sources.receipt.image, photo);
});

test("queued saves snapshot callers and a failed operation does not poison later writes", async () => {
  const first = emptyDraft();
  const savingFirst = saveDraft(first);
  first.weighing[0].name = "mutated after save call";
  await savingFirst;
  assert.equal((await loadDraft()).value?.weighing[0].name, "");
  const badPhoto = { ...emptyDraft(), revision: 2 };
  badPhoto.sources.weighing.image = "data:image/png;base64,not!base64";
  const failed = assert.rejects(saveDraft(badPhoto));
  const next = { ...emptyDraft(), revision: 3 };
  const last = { ...next, revision: 4 };
  const secondSave = saveDraft(next);
  const lastSave = saveDraft(last);
  const queuedRead = loadDraft();
  await Promise.all([failed, secondSave, lastSave]);
  assert.equal((await queuedRead).value?.revision, 4);
});

test("legacy migration retains original through failure and successful retry", async (t) => {
  const draft = emptyDraft();
  draft.sources.weighing.image = photo;
  const raw = JSON.stringify(draft);
  legacy.set(DRAFT_KEY, raw);
  const original = IDBObjectStore.prototype.put;
  const failure = t.mock.method(
    IDBObjectStore.prototype,
    "put",
    function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === "images")
        throw new DOMException("Quota full", "QuotaExceededError");
      return original.call(this, value, key);
    },
  );
  const fallback = await loadDraft();
  assert.deepEqual(fallback.value, draft);
  assert.equal(fallback.persisted, false);
  assert.match(fallback.warning, /migrasi.*belum berhasil/);
  assert.equal(legacy.get(DRAFT_KEY), raw);
  assert.equal(await stored("drafts", DRAFT_KEY), undefined);
  failure.mock.restore();
  const migrated = await loadDraft();
  assert.deepEqual(migrated.value, draft);
  assert.equal(migrated.persisted, true);
  assert.equal(legacy.get(DRAFT_KEY), raw);
  assert.ok((await stored("images", `${DRAFT_KEY}:weighing`)) instanceof Blob);
});

test("invalid legacy and corrupt IndexedDB schemas are retained with a recovery warning", async () => {
  const corrupt = '{"version":1,"sources":{}}';
  legacy.set(DRAFT_KEY, corrupt);
  assert.equal((await loadDraft()).value, null);
  assert.equal(legacy.get(DRAFT_KEY), corrupt);
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    tx.objectStore("drafts").put({ schemaVersion: 99, value: {} }, DRAFT_KEY);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  db.close();
  const recovered = await loadDraft();
  assert.equal(recovered.value, null);
  assert.equal(recovered.exists, true);
  assert.match(recovered.warning, /Format draf/);
  assert.deepEqual(await stored("drafts", DRAFT_KEY), {
    schemaVersion: 99,
    value: {},
  });
});

test("unavailable IndexedDB recovers legacy with a warning and never claims a save", async () => {
  const draft = emptyDraft();
  legacy.set(DRAFT_KEY, JSON.stringify(draft));
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: {
      open: () => {
        throw new DOMException("Denied", "SecurityError");
      },
    },
  });
  const loaded = await loadDraft();
  assert.deepEqual(loaded.value, draft);
  assert.equal(loaded.persisted, false);
  assert.ok(loaded.warning);
  await assert.rejects(saveDraft({ ...draft, revision: 2 }), /Denied/);
  assert.equal(JSON.parse(legacy.get(DRAFT_KEY)!).revision, 1);
});

test("blocked upgrade fails promptly, closes its late connection, and can retry", async () => {
  await loadDraft();
  const blocker = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const factory = indexedDB;
  // Force an upgrade so the existing tab blocks the real IDB open request.
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: {
      open: (name: string) => factory.open(name, DATABASE_VERSION + 1),
    },
  });
  await assert.rejects(saveDraft(emptyDraft()), /versi lain/);
  blocker.close();
  await saveDraft(emptyDraft());
  const loaded = await loadDraft();
  assert.ok(loaded.value);
  assert.equal(loaded.persisted, true);
});

for (const kind of ["weighing", "receipt"] as const) {
  test(`${kind} partial imports, corrections and deleted-item reimport survive IndexedDB recovery`, async () => {
    const draft = emptyDraft();
    const raw = classifiedFixture(
      kind === "weighing" ? "weighing" : "sales_receipt",
    );
    raw.items = [
      raw.items[0],
      {
        ...raw.items[0],
        itemName: "Tongkol",
        weightValue: "8",
        rawText: "Tongkol 8 kg",
      },
      { ...raw.items[0], weightValue: "5,5", rawText: "Teri 5,5 kg" },
    ];
    const result = buildVisionResult(
      raw,
      {
        ...requestFixture(),
        documentType: kind,
        sourceId: `${draft.id}:${kind}:${draft.sources[kind].capturedAt}`,
      },
      "test-model",
    );
    draft.rawExtractions = {
      [kind]: {
        result,
        receivedAt: "now",
        sourceCapturedAt: draft.sources[kind].capturedAt,
      },
    };
    draft[kind] = applyEligibleProposalRows(draft[kind], result, [0]);
    draft[kind][0].kg = "13";
    draft[kind][0].provenance = "Dikoreksi pengguna";
    draft.revision = 2;
    await saveDraft(draft);
    const partial = (await loadDraft()).value!;
    assert.equal(proposalIsCurrent(partial, kind), true);
    assert.deepEqual(
      proposalImportState(partial[kind], result).appliedIndices,
      [0],
    );
    assert.deepEqual(
      proposalImportState(partial[kind], result).eligibleIndices,
      [1, 2],
    );
    assert.deepEqual(partial.rawExtractions?.[kind]?.result.raw, raw);
    assert.equal(partial[kind][0].rawWeight, "12,5");
    assert.equal(partial[kind][0].kg, "13");
    partial[kind] = applyEligibleProposalRows(partial[kind], result, [0, 1, 1]);
    assert.equal(partial[kind].length, 2);
    await saveDraft(partial);
    const next = (await loadDraft()).value!;
    next[kind] = applyEligibleProposalRows(next[kind], result, [0, 1, 2]);
    assert.equal(next[kind].length, 3);
    next.confirmedSnapshots = {
      [kind]: {
        revision: next.revision,
        confirmedAt: "confirmed",
        sourceCapturedAt: next.sources[kind].capturedAt,
        rows: structuredClone(next[kind]),
        deduction: next.deduction,
        charges: next.charges,
      },
    };
    await saveDraft(next);
    const full = (await loadDraft()).value!;
    assert.deepEqual(
      proposalImportState(full[kind], result).eligibleIndices,
      [],
    );
    assert.equal(
      applyEligibleProposalRows(full[kind], result, [0, 1, 2]).length,
      3,
    );
    assert.deepEqual(
      full.confirmedSnapshots?.[kind]?.rows.map(
        (row) => row.extractionItemIndex,
      ),
      [0, 1, 2],
    );
    assert.equal(full.confirmedSnapshots?.[kind]?.rows[0].kg, "13");
    full[kind] = full[kind].filter((row) => row.extractionItemIndex !== 0);
    await saveDraft(full);
    const deleted = (await loadDraft()).value!;
    assert.deepEqual(
      proposalImportState(deleted[kind], result).eligibleIndices,
      [0],
    );
    deleted[kind] = applyEligibleProposalRows(deleted[kind], result, [0, 0, 2]);
    await saveDraft(deleted);
    const reimported = (await loadDraft()).value!;
    assert.equal(reimported[kind].length, 3);
    assert.equal(
      reimported[kind].filter((row) => row.extractionItemIndex === 0).length,
      1,
    );
    assert.equal(
      reimported[kind].find((row) => row.extractionItemIndex === 0)?.kg,
      "12.5",
    );
    assert.equal(reimported.confirmedSnapshots?.[kind]?.rows[0].kg, "13");
    assert.deepEqual(reimported.rawExtractions?.[kind]?.result, result);
  });
}

test("legacy provenance can be associated without changing saved source or corrections", async () => {
  const draft = emptyDraft();
  const result = buildVisionResult(
    classifiedFixture("sales_receipt"),
    {
      ...requestFixture(),
      sourceId: `${draft.id}:receipt:${draft.sources.receipt.capturedAt}`,
    },
    "test-model",
  );
  draft.rawExtractions = {
    receipt: {
      result,
      receivedAt: "now",
      sourceCapturedAt: draft.sources.receipt.capturedAt,
    },
  };
  draft.receipt = applyEligibleProposalRows(draft.receipt, result, [0]);
  delete draft.receipt[0].extractionItemIndex;
  draft.receipt[0].kg = "14";
  const legacyRaw = JSON.stringify(draft);
  legacy.set(DRAFT_KEY, legacyRaw);
  const migrated = (await loadDraft()).value!;
  assert.equal(migrated.receipt[0].extractionItemIndex, undefined);
  const associated = withProposalAssociations(migrated);
  assert.equal(associated.receipt[0].extractionItemIndex, 0);
  assert.equal(associated.receipt[0].kg, "14");
  assert.equal(migrated.receipt[0].extractionItemIndex, undefined);
  await saveDraft(associated);
  assert.equal((await loadDraft()).value?.receipt[0].extractionItemIndex, 0);
  assert.equal(legacy.get(DRAFT_KEY), legacyRaw);
  const ambiguous = structuredClone(associated);
  const repeatedRaw = classifiedFixture("sales_receipt");
  repeatedRaw.items.push(structuredClone(repeatedRaw.items[0]));
  const repeatedResult = buildVisionResult(
    repeatedRaw,
    requestFixture(),
    "test-model",
  );
  ambiguous.rawExtractions!.receipt!.result = repeatedResult;
  delete ambiguous.receipt[0].extractionItemIndex;
  await saveDraft(ambiguous);
  const recovered = (await loadDraft()).value!;
  const state = proposalImportState(recovered.receipt, repeatedResult);
  assert.equal(state.legacyWarning, true);
  assert.deepEqual(state.blockedIndices, [0, 1]);
  assert.deepEqual(state.eligibleIndices, []);
  assert.deepEqual(withProposalAssociations(recovered), recovered);
  assert.equal(recovered.receipt[0].kg, "14");
  assert.equal(legacy.get(DRAFT_KEY), legacyRaw);
});

test("strict save rejects mismatched and reused confirmations; old IndexedDB records recover non-destructively", async () => {
  const good = emptyDraft();
  good.weighing[0].name = good.receipt[0].name = "Teri";
  good.weighing[0].kg = "12";
  good.receipt[0].kg = "10";
  good.weighingConfirmed = good.receiptConfirmed = true;
  good.sources.weighing.image = photo;
  good.pairs = [
    {
      weighId: good.weighing[0].id,
      receiptId: good.receipt[0].id,
      decision: "confirmed",
      adjustment: "2",
      explanation: "Alasan lama.",
    },
  ];
  await saveDraft(good);
  const bad = structuredClone(good);
  bad.receipt[0].name = "Tongkol";
  await assert.rejects(saveDraft(bad), /Format draf/);
  assert.equal((await loadDraft()).value?.receipt[0].name, "Teri");
  const record = (await stored("drafts", DRAFT_KEY)) as { value: typeof good };
  record.value.receipt[0].name = "Tongkol";
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    tx.objectStore("drafts").put(record, DRAFT_KEY);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  db.close();
  const recovered = await loadDraft();
  assert.equal(recovered.persisted, false);
  assert.equal(recovered.value?.pairs[0].decision, "pending");
  assert.equal(recovered.value?.pairs[0].adjustment, "2");
  assert.equal(recovered.value?.pairs[0].explanation, "Alasan lama.");
  assert.equal(recovered.value?.sources.weighing.image, photo);
  assert.equal(
    ((await stored("drafts", DRAFT_KEY)) as { value: typeof good }).value
      .pairs[0].decision,
    "confirmed",
  );
  await saveDraft(recovered.value!);
  const again = await loadDraft();
  assert.equal(again.persisted, true);
  assert.equal(again.value?.pairs[0].decision, "pending");
  assert.ok(again.value?.pairs[0].reviewIssue);
  const reused = structuredClone(good);
  reused.weighing.push({ ...good.weighing[0], id: "another-weigh" });
  reused.pairs.push({ ...good.pairs[0], weighId: "another-weigh" });
  await assert.rejects(saveDraft(reused), /Format draf/);
});

test("legacy invalid match migration preserves the original backup and never restores its confirmation", async () => {
  const old = emptyDraft();
  old.weighing[0].name = "Kembung";
  old.receipt[0].name = "Teri";
  old.pairs = [
    {
      weighId: old.weighing[0].id,
      receiptId: old.receipt[0].id,
      decision: "confirmed",
      adjustment: "1",
      explanation: "Jejak asli.",
    },
  ];
  legacy.set(DRAFT_KEY, JSON.stringify(old));
  const recovered = await loadDraft();
  assert.equal(recovered.persisted, true);
  assert.match(recovered.warning, /ditinjau ulang/);
  assert.equal(recovered.value?.pairs[0].decision, "pending");
  assert.equal(recovered.value?.pairs[0].adjustment, "1");
  assert.equal(legacy.get(DRAFT_KEY), JSON.stringify(old));
  assert.equal((await loadDraft()).value?.pairs[0].decision, "pending");
});

for (const kind of ["weighing", "receipt"] as const) {
  test(`${kind} old mismatched, unknown, unclassified and foreign-source confirmations recover without changing stored evidence`, async () => {
    const good = emptyDraft();
    good.weighing[0] = { ...good.weighing[0], name: "Teri", kg: "12" };
    good.receipt[0] = {
      ...good.receipt[0],
      name: "Teri",
      kg: "10",
      price: "25000",
    };
    good.sources[kind] = {
      ...good.sources[kind],
      image: photo,
      text: "Sumber asli",
      filename: "sumber.png",
    };
    good.weighingConfirmed = good.receiptConfirmed = true;
    good.pairs = [
      {
        weighId: good.weighing[0].id,
        receiptId: good.receipt[0].id,
        decision: "confirmed",
        adjustment: "2",
        explanation: "Alasan pengguna tetap.",
      },
    ];
    const request = {
      ...requestFixture(),
      documentType: kind,
      sourceId: `${good.id}:${kind}:${good.sources[kind].capturedAt}`,
    };
    good.rawExtractions = {
      [kind]: {
        result: buildVisionResult(
          classifiedFixture(kind === "weighing" ? "weighing" : "sales_receipt"),
          request,
          "test-model",
        ),
        receivedAt: "received",
        sourceCapturedAt: good.sources[kind].capturedAt,
      },
    };
    good.confirmedSnapshots = {
      [kind]: {
        revision: good.revision,
        confirmedAt: "confirmed",
        sourceCapturedAt: good.sources[kind].capturedAt,
        rows: structuredClone(good[kind]),
        deduction: good.deduction,
        charges: good.charges,
      },
    };
    for (const [caseIndex, raw] of [
      classifiedFixture(kind === "weighing" ? "sales_receipt" : "weighing"),
      classifiedFixture("unknown"),
      rawFixture(kind),
      classifiedFixture(kind === "weighing" ? "weighing" : "sales_receipt"),
    ].entries()) {
      await saveDraft(good);
      const old = structuredClone(good);
      old.rawExtractions![kind]!.result = buildVisionResult(
        raw,
        caseIndex === 3
          ? { ...request, sourceId: "another-examination:another-source" }
          : request,
        "test-model",
      );
      await assert.rejects(saveDraft(old), /Format draf/);
      assert.equal((await loadDraft()).value?.[`${kind}Confirmed`], true);
      const record = (await stored("drafts", DRAFT_KEY)) as { value: Draft };
      record.value.rawExtractions = structuredClone(old.rawExtractions);
      const db = await database();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("drafts", "readwrite");
        tx.objectStore("drafts").put(record, DRAFT_KEY);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
      const recovered = await loadDraft();
      assert.ok(recovered.value);
      assert.equal(recovered.persisted, false);
      assert.match(recovered.warning, /Jenis dokumen/);
      assert.equal(recovered.value[`${kind}Confirmed`], false);
      assert.equal(recovered.value.pairs[0].decision, "pending");
      assert.equal(recovered.value.pairs[0].adjustment, "2");
      assert.equal(
        recovered.value.pairs[0].explanation,
        "Alasan pengguna tetap.",
      );
      assert.deepEqual(recovered.value.sources, old.sources);
      assert.deepEqual(recovered.value.weighing, old.weighing);
      assert.deepEqual(recovered.value.receipt, old.receipt);
      assert.deepEqual(recovered.value.rawExtractions, old.rawExtractions);
      assert.deepEqual(
        recovered.value.confirmedSnapshots,
        old.confirmedSnapshots,
      );
      assert.equal(sourceDocumentGate(recovered.value, kind).canConfirm, false);
      assert.equal(
        ((await stored("drafts", DRAFT_KEY)) as { value: Draft }).value[
          `${kind}Confirmed`
        ],
        true,
      );
      await saveDraft(recovered.value);
      const saved = await loadDraft();
      assert.equal(saved.persisted, true);
      assert.equal(saved.value?.[`${kind}Confirmed`], false);
      assert.equal(sourceDocumentGate(saved.value!, kind).canConfirm, false);
      await assert.rejects(
        saveDraft({ ...saved.value!, [`${kind}Confirmed`]: true }),
        /Format draf/,
      );
    }
  });
}

test("voice transcript, raw result, selected imports and corrections restore without storing the session clip", async () => {
  let draft = emptyDraft();
  const transcript = "Teri dua belas kilo, Tongkol delapan kilo.";
  draft.sources.weighing = {
    text: transcript,
    filename: "Rekaman suara",
    capturedAt: "voice-source",
  };
  const extraction = classifiedFixture("weighing");
  extraction.items = [
    {
      ...extraction.items[0],
      weightValue: "12",
      unitPrice: null,
      subtotal: null,
      rawText: "Teri dua belas kilo",
    },
    {
      ...extraction.items[0],
      itemName: "Tongkol",
      weightValue: "8",
      unitPrice: null,
      subtotal: null,
      rawText: "Tongkol delapan kilo",
    },
  ];
  const result = buildVoiceResult(
    { transcript, extraction, unresolvedFields: [] },
    {
      requestId: "voice-test",
      sourceId: `${draft.id}:weighing:voice-source`,
      sourceRevision: "1",
      audioDataUrl: "",
    },
    "test-model",
  );
  draft.voiceExtraction = {
    result,
    receivedAt: "received",
    sourceCapturedAt: "voice-source",
  };
  draft.rawExtractions = {
    weighing: {
      result: result.vision,
      receivedAt: "received",
      sourceCapturedAt: "voice-source",
    },
  };
  draft = applyVoiceProposal(draft, [0]);
  draft.weighing[0].kg = "11";
  draft.weighing[0].provenance = "Dikoreksi pengguna";
  draft.confirmedSnapshots = {
    weighing: {
      revision: draft.revision,
      confirmedAt: "confirmed",
      sourceCapturedAt: "voice-source",
      rows: structuredClone(draft.weighing),
      deduction: "",
      charges: "",
    },
  };
  await saveDraft(draft);
  const first = (await loadDraft()).value!;
  assert.equal(first.sources.weighing.text, transcript);
  assert.equal(voiceProposalIsCurrent(first), true);
  assert.equal(first.weighing[0].kg, "11");
  assert.equal(first.weighing[0].rawWeight, "12");
  assert.deepEqual(first.voiceExtraction, draft.voiceExtraction);
  assert.equal(applyVoiceProposal(first, [0]), first);
  const imported = applyVoiceProposal(first, [0, 1, 1]);
  assert.deepEqual(
    imported.weighing.map((row) => row.kg),
    ["11", "8"],
  );
  await saveDraft(imported);
  const loaded = await loadDraft();
  assert.equal(loaded.persisted, true);
  assert.equal(applyVoiceProposal(loaded.value!, [0, 1]), loaded.value);
  assert.equal(loaded.value?.confirmedSnapshots?.weighing?.rows[0].kg, "11");
  assert.deepEqual(
    loaded.value?.rawExtractions?.weighing?.result,
    result.vision,
  );
  const record = await stored("drafts", DRAFT_KEY);
  assert.equal(JSON.stringify(record).includes("data:audio/"), false);
  assert.equal(JSON.stringify(record).includes("audioDataUrl"), false);
  assert.equal(await stored("images", `${DRAFT_KEY}:weighing`), undefined);
  const withClip = {
    ...imported,
    voiceExtraction: {
      ...imported.voiceExtraction!,
      audioDataUrl: "data:audio/wav;base64,YXVkaW8=",
    },
  };
  await assert.rejects(saveDraft(withClip), /Format draf/);
  assert.deepEqual((await loadDraft()).value, loaded.value);
  const replaced = {
    ...loaded.value!,
    sources: {
      ...loaded.value!.sources,
      weighing: {
        text: "Sumber baru",
        filename: "teks",
        capturedAt: "new-source",
      },
    },
    weighingConfirmed: false,
  };
  await saveDraft(replaced);
  const stale = (await loadDraft()).value!;
  assert.equal(voiceProposalIsCurrent(stale), false);
  assert.equal(applyVoiceProposal(stale, [0]), stale);
  assert.deepEqual(stale.voiceExtraction, imported.voiceExtraction);
  assert.equal(stale.sources.weighing.text, "Sumber baru");
});

test("Phase 4.3 draft with no voice metadata still restores its sources and corrections", async () => {
  const old = emptyDraft();
  old.sources.weighing.image = photo;
  old.weighing[0] = {
    ...old.weighing[0],
    name: "Teri",
    kg: "12",
    provenance: "Dikoreksi pengguna",
  };
  old.receipt[0] = {
    ...old.receipt[0],
    name: "Teri",
    kg: "10",
    price: "25000",
  };
  old.pairs = [
    {
      weighId: old.weighing[0].id,
      receiptId: old.receipt[0].id,
      decision: "pending",
      adjustment: "2",
      explanation: "Riwayat lama.",
    },
  ];
  legacy.set(DRAFT_KEY, JSON.stringify(old));
  const loaded = await loadDraft();
  assert.equal(loaded.persisted, true);
  assert.equal(loaded.value?.voiceExtraction, undefined);
  assert.deepEqual(loaded.value, old);
  assert.equal(legacy.get(DRAFT_KEY), JSON.stringify(old));
});
