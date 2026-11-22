import type { Draft, Row, Source } from "../types.ts";
import { validateVisionResult } from "../vision/contract.ts";
import { validateVoiceResult } from "../voice/contract.ts";
import { confirmedPairsAreValid, sanitizeMatches } from "../lib/matching.ts";
import {
  documentConfirmationsAreValid,
  sanitizeDocumentConfirmations,
} from "../lib/documentValidation.ts";

export const DRAFT_KEY = "buktilaut.prototype.draft.v1";
export const DEMO_KEY = "buktilaut.prototype.demo.v1";
const string = (v: unknown): v is string => typeof v === "string";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
function validRow(v: unknown): v is Row {
  return (
    object(v) &&
    ["id", "name", "kg", "price"].every((k) => string(v[k])) &&
    string(v.provenance) &&
    [
      "Usulan AI simulasi",
      "Hasil AI",
      "Diisi pengguna",
      "Dikoreksi pengguna",
    ].includes(v.provenance) &&
    [
      "sourceSubtotal",
      "sourceDiscount",
      "extractionRequestId",
      "rawText",
      "rawWeight",
      "rawUnit",
    ].every((key) => v[key] === undefined || string(v[key])) &&
    (v.extractionItemIndex === undefined ||
      (Number.isInteger(v.extractionItemIndex) &&
        Number(v.extractionItemIndex) >= 0 &&
        Number(v.extractionItemIndex) < 100 &&
        string(v.extractionRequestId) &&
        /^[a-zA-Z0-9_.:-]{1,160}$/.test(v.extractionRequestId))) &&
    (v.extractionIssues === undefined ||
      (Array.isArray(v.extractionIssues) && v.extractionIssues.every(string)))
  );
}
function validSource(v: unknown): v is Source {
  return (
    object(v) &&
    ["text", "filename", "capturedAt"].every((k) => string(v[k])) &&
    (v.image === undefined ||
      (string(v.image) && /^data:image\/(jpeg|png|webp);base64,/.test(v.image)))
  );
}
// Recovery checks shape first so invalid links can be revoked without discarding source records.
export function isDraftStructure(v: unknown): v is Draft {
  if (object(v) && v.transactionKey !== undefined &&
      (!string(v.transactionKey) || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v.transactionKey))) return false;
  if (
    !object(v) ||
    v.version !== 1 ||
    !string(v.id) ||
    typeof v.demo !== "boolean" ||
    !Number.isSafeInteger(v.revision) ||
    Number(v.revision) < 1 ||
    !string(v.deduction) ||
    !string(v.charges) ||
    !string(v.savedAt) ||
    typeof v.weighingConfirmed !== "boolean" ||
    typeof v.receiptConfirmed !== "boolean"
  )
    return false;
  if (
    !Array.isArray(v.weighing) ||
    !v.weighing.length ||
    !v.weighing.every(validRow) ||
    !Array.isArray(v.receipt) ||
    !v.receipt.length ||
    !v.receipt.every(validRow)
  )
    return false;
  if (
    !object(v.sources) ||
    !validSource(v.sources.weighing) ||
    !validSource(v.sources.receipt) ||
    !Array.isArray(v.pairs) ||
    !Array.isArray(v.unmatchedReceipts)
  )
    return false;
  const w = new Set(v.weighing.map((r) => r.id)),
    r = new Set(v.receipt.map((r) => r.id));
  if (w.size !== v.weighing.length || r.size !== v.receipt.length) return false;
  const usedW = new Set();
  for (const p of v.pairs) {
    if (
      !object(p) ||
      !string(p.weighId) ||
      !w.has(p.weighId) ||
      usedW.has(p.weighId) ||
      !string(p.receiptId) ||
      !string(p.decision) ||
      !["pending", "confirmed", "unmatched"].includes(p.decision) ||
      !string(p.adjustment) ||
      !string(p.explanation) ||
      (p.reviewIssue !== undefined &&
        (!string(p.reviewIssue) || p.reviewIssue.length > 1000))
    )
      return false;
    usedW.add(p.weighId);
  }
  if (v.previousReview !== undefined) {
    const h = v.previousReview;
    if (
      !object(h) ||
      !Number.isSafeInteger(h.revision) ||
      Number(h.revision) < 1 ||
      !object(h.sources) ||
      !string(h.sources.weighing) ||
      !string(h.sources.receipt) ||
      !Array.isArray(h.rows) ||
      !h.rows.every(
        (line) =>
          object(line) &&
          ["name", "weighedKg", "receiptKg", "adjustment", "explanation"].every(
            (k) => string(line[k]),
          ) &&
          [
            "reviewIssue",
            "receiptId",
            "receiptName",
            "weighId",
            "sourceWeighing",
            "sourceReceipt",
          ].every((key) => line[key] === undefined || string(line[key])) &&
          (line.reviewRevision === undefined ||
            (Number.isSafeInteger(line.reviewRevision) &&
              Number(line.reviewRevision) >= 1)) &&
          string(line.decision) &&
          ["pending", "confirmed", "unmatched"].includes(line.decision),
      )
    )
      return false;
  }
  if (v.rawExtractions !== undefined) {
    if (
      !object(v.rawExtractions) ||
      Object.keys(v.rawExtractions).some(
        (key) => !["weighing", "receipt"].includes(key),
      )
    )
      return false;
    for (const kind of ["weighing", "receipt"] as const) {
      const extraction = v.rawExtractions[kind];
      if (extraction === undefined) continue;
      if (
        !object(extraction) ||
        !string(extraction.receivedAt) ||
        !string(extraction.sourceCapturedAt) ||
        !object(extraction.result)
      )
        return false;
      const result = extraction.result;
      if (
        !["requestId", "sourceId", "sourceRevision"].every((key) =>
          string(result[key]),
        )
      )
        return false;
      try {
        validateVisionResult(result, {
          documentType: kind,
          requestId: result.requestId as string,
          sourceId: result.sourceId as string,
          sourceRevision: result.sourceRevision as string,
        });
      } catch {
        return false;
      }
    }
  }
  if (v.confirmedSnapshots !== undefined) {
    if (
      !object(v.confirmedSnapshots) ||
      Object.keys(v.confirmedSnapshots).some(
        (key) => !["weighing", "receipt"].includes(key),
      )
    )
      return false;
    for (const kind of ["weighing", "receipt"] as const) {
      const snapshot = v.confirmedSnapshots[kind];
      if (snapshot === undefined) continue;
      if (
        !object(snapshot) ||
        !Number.isSafeInteger(snapshot.revision) ||
        Number(snapshot.revision) < 1 ||
        !["confirmedAt", "sourceCapturedAt", "deduction", "charges"].every(
          (key) => string(snapshot[key]),
        ) ||
        !Array.isArray(snapshot.rows) ||
        !snapshot.rows.length ||
        !snapshot.rows.every(validRow) ||
        new Set(snapshot.rows.map((line) => line.id)).size !==
          snapshot.rows.length
      )
        return false;
    }
  }
  if (v.voiceExtraction !== undefined) {
    const voice = v.voiceExtraction;
    if (
      !object(voice) ||
      Object.keys(voice).length !== 3 ||
      !["result", "receivedAt", "sourceCapturedAt"].every((key) =>
        Object.hasOwn(voice, key),
      ) ||
      !string(voice.receivedAt) ||
      !string(voice.sourceCapturedAt) ||
      !object(voice.result) ||
      !object(voice.result.vision)
    )
      return false;
    const vision = voice.result.vision;
    if (
      !["requestId", "sourceId", "sourceRevision"].every((key) =>
        string(vision[key]),
      )
    )
      return false;
    try {
      validateVoiceResult(voice.result, {
        requestId: vision.requestId as string,
        sourceId: vision.sourceId as string,
        sourceRevision: vision.sourceRevision as string,
        audioDataUrl: "",
      });
    } catch {
      return false;
    }
  }
  return v.unmatchedReceipts.every((id) => string(id) && r.has(id));
}
export function isDraft(v: unknown): v is Draft {
  return (
    isDraftStructure(v) &&
    documentConfirmationsAreValid(v) &&
    confirmedPairsAreValid(v)
  );
}

export function readDraft(key = DRAFT_KEY): {
  value: Draft | null;
  warning: string;
  exists: boolean;
} {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { value: null, warning: "", exists: false };
    const value: unknown = JSON.parse(raw);
    if (!isDraftStructure(value))
      return {
        value: null,
        exists: true,
        warning:
          "Draf lama tidak dapat dipulihkan karena formatnya tidak sesuai. Data lama belum dihapus. Memulai pemeriksaan baru akan menggantinya; contoh sintetis memakai penyimpanan terpisah.",
      };
    const documents = sanitizeDocumentConfirmations(value);
    const repaired = sanitizeMatches(documents.draft);
    return {
      value: repaired.draft,
      exists: true,
      warning: documents.changed
        ? "Jenis dokumen pada draf lama perlu ditinjau ulang. Konfirmasi dibatalkan; sumber, hasil AI, dan riwayat tetap dipertahankan."
        : repaired.issues.length
          ? "Pasangan ikan pada draf lama perlu ditinjau ulang. Konfirmasi yang tidak valid dibatalkan; sumber dan penyesuaian lama tetap dipertahankan."
          : "",
    };
  } catch {
    return {
      value: null,
      exists: true,
      warning:
        "Draf belum dapat dibuka. Data lama belum dihapus. Periksa izin penyimpanan browser atau lanjutkan contoh sintetis.",
    };
  }
}

