import type { Draft, Row } from "../types.ts";
import { documentCompatibility } from "../vision/contract.ts";
import {
  extractionBelongsToSource,
  sourceDocumentGate,
} from "./documentValidation.ts";
import { parseKilograms } from "./examination.ts";
import { buildMatchReviewSnapshot, normalizeFishName } from "./matching.ts";
import { applyEligibleProposalRows } from "./visionReview.ts";

export function voiceProposalIsCurrent(draft: Draft): boolean {
  const voice = draft.voiceExtraction;
  const extraction = draft.rawExtractions?.weighing;
  if (!voice || !extraction || !extractionBelongsToSource(draft, "weighing"))
    return false;
  return (
    voice.sourceCapturedAt === draft.sources.weighing.capturedAt &&
    voice.result.transcript === draft.sources.weighing.text &&
    voice.result.vision.documentType === "weighing" &&
    voice.result.vision.sourceId === extraction.result.sourceId &&
    voice.result.vision.requestId === extraction.result.requestId &&
    voice.result.vision.sourceRevision === extraction.result.sourceRevision &&
    JSON.stringify(voice.result.vision) === JSON.stringify(extraction.result)
  );
}

export function applyVoiceProposal(draft: Draft, indices: number[]): Draft {
  if (
    !voiceProposalIsCurrent(draft) ||
    !sourceDocumentGate(draft, "weighing").canConfirm
  )
    return draft;
  const result = draft.voiceExtraction!.result;
  if (!documentCompatibility(result.vision, "weighing").canImport) return draft;
  const candidates = applyEligibleProposalRows(
    draft.weighing,
    result.vision,
    indices,
  );
  const existingIds = new Set(draft.weighing.map((row) => row.id));
  if (!candidates.some((row) => !existingIds.has(row.id))) return draft;
  const weighing = candidates.map((row): Row => {
    if (existingIds.has(row.id)) return row;
    const unresolved = result.unresolvedFields.filter(
      (field) => field.itemIndex === row.extractionItemIndex,
    );
    const nameUnresolved =
      unresolved.some((field) => field.field === "name") ||
      normalizeFishName(row.name) === null;
    const weight = parseKilograms(row.kg);
    const weightUnresolved =
      unresolved.some(
        (field) => field.field === "weight" || field.field === "unit",
      ) ||
      weight === null ||
      weight <= 0;
    const issues = [
      ...(row.extractionIssues || []),
      ...unresolved.map((field) => field.reason),
    ];
    if (nameUnresolved)
      issues.push("Nama ikan perlu diisi setelah memeriksa transkrip.");
    if (weightUnresolved)
      issues.push(
        "Berat dan satuan perlu dipastikan dari transkrip sebelum konfirmasi.",
      );
    return {
      ...row,
      name: nameUnresolved ? "" : row.name,
      kg: weightUnresolved ? "" : row.kg,
      extractionIssues: [...new Set(issues)],
    };
  });
  const hasReview = draft.pairs.some(
    (pair) =>
      pair.decision !== "pending" ||
      pair.reviewIssue ||
      pair.adjustment ||
      pair.explanation,
  );
  return {
    ...draft,
    weighing,
    weighingConfirmed: false,
    pairs: [],
    unmatchedReceipts: [],
    previousReview: hasReview
      ? buildMatchReviewSnapshot(draft)
      : draft.previousReview,
    revision: draft.revision + 1,
  };
}
