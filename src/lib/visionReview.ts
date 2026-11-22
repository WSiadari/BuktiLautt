import type { Draft, Row } from "../types";
import {
  normalizeWeight,
  documentCompatibility,
  type DocumentType,
  type VisionResult,
} from "../vision/contract.ts";
import { parseKilograms } from "./examination.ts";
import { extractionBelongsToSource } from "./documentValidation.ts";

export function proposalIsCurrent(draft: Draft, kind: DocumentType): boolean {
  return extractionBelongsToSource(draft, kind);
}
export { sourceDocumentGate } from "./documentValidation.ts";
function rawSignature(
  text: unknown,
  weight: unknown,
  unit: unknown,
): string | null {
  if (
    typeof text !== "string" ||
    typeof weight !== "string" ||
    typeof unit !== "string" ||
    !(text || weight || unit)
  )
    return null;
  return JSON.stringify([text, weight, unit]);
}
export function proposalImportState(rows: Row[], result: VisionResult) {
  const compatibility = documentCompatibility(result, result.documentType);
  const previousExtractionRows = rows.filter(
    (row) =>
      (row.extractionRequestId &&
        row.extractionRequestId !== result.requestId) ||
      (!row.extractionRequestId && row.provenance === "Hasil AI"),
  ).length;
  const applied = new Set<number>();
  const blocked = new Set<number>();
  const associations = new Map<string, number>();
  let legacyWarning = false;
  let duplicateAssociations = false;
  for (const row of rows.filter(
    (value) => value.extractionRequestId === result.requestId,
  )) {
    if (row.extractionItemIndex !== undefined) {
      if (
        Number.isInteger(row.extractionItemIndex) &&
        row.extractionItemIndex >= 0 &&
        row.extractionItemIndex < result.normalized.items.length
      ) {
        if (applied.has(row.extractionItemIndex)) {
          legacyWarning = true;
          duplicateAssociations = true;
        }
        applied.add(row.extractionItemIndex);
      } else {
        legacyWarning = true;
        result.normalized.items.forEach((_, index) => blocked.add(index));
      }
      continue;
    }
    const signature = rawSignature(row.rawText, row.rawWeight, row.rawUnit);
    const candidates =
      signature === null
        ? []
        : result.raw.items.flatMap((item, index) =>
            rawSignature(
              item.rawText ?? "",
              item.weightValue ?? "",
              item.weightUnit ?? "",
            ) === signature
              ? [index]
              : [],
          );
    if (candidates.length === 1) {
      if (applied.has(candidates[0])) {
        legacyWarning = true;
        duplicateAssociations = true;
      }
      applied.add(candidates[0]);
      associations.set(row.id, candidates[0]);
    } else {
      legacyWarning = true;
      (candidates.length
        ? candidates
        : result.normalized.items.map((_, index) => index)
      ).forEach((index) => blocked.add(index));
    }
  }
  return {
    appliedIndices: [...applied],
    blockedIndices: [...blocked].filter((index) => !applied.has(index)),
    eligibleIndices: result.normalized.items.flatMap((_, index) =>
      compatibility.canImport &&
      !previousExtractionRows &&
      !applied.has(index) &&
      !blocked.has(index)
        ? [index]
        : [],
    ),
    associations,
    legacyWarning,
    duplicateAssociations,
    compatibility,
    previousExtractionRows,
  };
}
export function associateLegacyProposalRows(
  rows: Row[],
  result: VisionResult,
): Row[] {
  const { associations } = proposalImportState(rows, result);
  return rows.map((row) =>
    associations.has(row.id)
      ? { ...row, extractionItemIndex: associations.get(row.id)! }
      : row,
  );
}
export function withProposalAssociations(draft: Draft): Draft {
  let next = draft;
  for (const kind of ["weighing", "receipt"] as const) {
    const result = draft.rawExtractions?.[kind]?.result;
    if (result && proposalImportState(next[kind], result).associations.size)
      next = {
        ...next,
        [kind]: associateLegacyProposalRows(next[kind], result),
      };
  }
  return next;
}
export function proposalRows(
  result: VisionResult,
  indices: number[],
  existingRows: Row[] = [],
): Row[] {
  const eligible = new Set(
    proposalImportState(existingRows, result).eligibleIndices,
  );
  return [...new Set(indices)]
    .filter(
      (index) =>
        Number.isInteger(index) &&
        index >= 0 &&
        index < result.normalized.items.length &&
        eligible.has(index),
    )
    .map((index) => {
      const value = result.normalized.items[index];
      const raw = result.raw.items[index];
      return {
        id: crypto.randomUUID(),
        name: value.itemName ?? "",
        kg: value.weightKg === null ? "" : String(value.weightKg),
        price:
          value.unitPriceRupiah === null ? "" : String(value.unitPriceRupiah),
        provenance: "Hasil AI",
        sourceSubtotal:
          value.subtotalRupiah === null ? "" : String(value.subtotalRupiah),
        sourceDiscount:
          value.discountRupiah === null ? "" : String(value.discountRupiah),
        extractionRequestId: result.requestId,
        extractionItemIndex: index,
        rawText: raw?.rawText ?? "",
        rawWeight: raw?.weightValue ?? "",
        rawUnit: raw?.weightUnit ?? "",
        extractionIssues: [...value.issues],
      };
    });
}
export function applyEligibleProposalRows(
  existingRows: Row[],
  result: VisionResult,
  indices: number[],
): Row[] {
  if (!documentCompatibility(result, result.documentType).canImport)
    return existingRows;
  const existing = associateLegacyProposalRows(existingRows, result);
  const additions = proposalRows(result, indices, existing);
  if (!additions.length) return existing;
  return [
    ...existing.filter(
      (row) =>
        row.provenance !== "Diisi pengguna" ||
        row.name.trim() ||
        row.kg.trim() ||
        row.price.trim() ||
        row.sourceSubtotal,
    ),
    ...additions,
  ];
}
export function rowWeightProvenance(row: Row) {
  const aiWeightKg = normalizeWeight(
    row.rawWeight ?? null,
    row.rawUnit ?? null,
  );
  const currentWeightKg = parseKilograms(row.kg);
  const status =
    aiWeightKg === null
      ? currentWeightKg === null
        ? "unknown"
        : "filled"
      : currentWeightKg === null
        ? "unknown"
        : aiWeightKg === currentWeightKg
          ? "same"
          : "changed";
  return { aiWeightKg, currentWeightKg, status };
}
