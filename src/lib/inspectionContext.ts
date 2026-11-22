import type { Draft } from "../types.ts";
import { calculatePair, parseKilograms } from "./examination.ts";
import { validatePair } from "./matching.ts";
import { sourceDocumentGate } from "./documentValidation.ts";

export type InspectionFinding = {
  id: string;
  weighId: string | null;
  receiptId: string | null;
  species: string;
  status:
    | "confirmed_open"
    | "confirmed_resolved"
    | "confirmed_equal"
    | "unconfirmed"
    | "unmatched"
    | "review_required"
    | "incomplete";
  weighedKg: number | null;
  receiptKg: number | null;
  initialKg: number | null;
  adjustmentKg: number | null;
  remainingKg: number | null;
  references: {
    weighing: { kind: "weighing"; rowId: string } | null;
    receipt: { kind: "receipt"; rowId: string } | null;
    adjustment: { weighId: string } | null;
  };
};

export type InspectionContext = {
  draftId: string;
  revision: number;
  findings: InspectionFinding[];
};

function positiveWeight(value: string | undefined): number | null {
  const weight = parseKilograms(value ?? null);
  return weight !== null && weight > 0 ? weight : null;
}

function displaySpecies(name: string): string {
  const label = name
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!label) return "Jenis ikan belum diketahui";
  return label.length > 120 ? "Nama ikan perlu ditinjau" : label;
}

export function buildInspectionContext(draft: Draft): InspectionContext {
  const sourcesConfirmed = draft.weighingConfirmed && draft.receiptConfirmed;
  const findings = draft.weighing.map((weighed): InspectionFinding => {
    const pairs = draft.pairs.filter((pair) => pair.weighId === weighed.id);
    const pair = pairs.length === 1 ? pairs[0] : undefined;
    const receipt =
      pair && pair.decision !== "unmatched"
        ? draft.receipt.find((row) => row.id === pair.receiptId)
        : undefined;
    const finding: InspectionFinding = {
      id: "pair:" + weighed.id,
      weighId: weighed.id,
      receiptId: receipt?.id ?? null,
      species: displaySpecies(weighed.name),
      status: "unconfirmed",
      weighedKg: positiveWeight(weighed.kg),
      receiptKg: positiveWeight(receipt?.kg),
      initialKg: null,
      adjustmentKg: null,
      remainingKg: null,
      references: {
        weighing: { kind: "weighing", rowId: weighed.id },
        receipt: receipt ? { kind: "receipt", rowId: receipt.id } : null,
        adjustment: null,
      },
    };
    if (pairs.length > 1 || pair?.reviewIssue) {
      return { ...finding, status: "review_required" };
    }
    if (!pair) return finding;
    if (pair.decision === "unmatched") {
      return {
        ...finding,
        status: draft.weighingConfirmed ? "unmatched" : "unconfirmed",
      };
    }
    if (pair.decision !== "confirmed") return finding;
    if (
      !sourcesConfirmed ||
      !validatePair(draft, pair.weighId, pair.receiptId).valid ||
      !weighed.name.trim() ||
      weighed.name.length > 120
    ) {
      return { ...finding, status: "review_required" };
    }
    const adjustmentKg = pair.adjustment
      ? positiveWeight(pair.adjustment)
      : null;
    if (pair.adjustment && adjustmentKg === null) {
      return { ...finding, status: "review_required" };
    }
    const result = calculatePair({
      weighedName: weighed.name,
      receiptName: receipt?.name ?? null,
      weighedKg: finding.weighedKg,
      receiptKg: finding.receiptKg,
      confirmed: true,
      savedAdjustmentKg: adjustmentKg,
    });
    if (result.status !== "ready") {
      return {
        ...finding,
        status: result.status === "unknown" ? "incomplete" : "review_required",
      };
    }
    return {
      ...finding,
      status:
        result.remainingKg !== 0
          ? "confirmed_open"
          : result.adjustmentKg! > 0
            ? "confirmed_resolved"
            : "confirmed_equal",
      initialKg: result.initialKg,
      adjustmentKg: result.adjustmentKg,
      remainingKg: result.remainingKg,
      references: {
        ...finding.references,
        adjustment: result.initialKg! > 0 ? { weighId: weighed.id } : null,
      },
    };
  });

  const claimedReceiptIds = new Set(
    draft.pairs
      .filter((pair) => pair.decision !== "unmatched")
      .map((pair) => pair.receiptId),
  );
  for (const receipt of draft.receipt) {
    if (claimedReceiptIds.has(receipt.id)) continue;
    const reviewedUnmatched =
      draft.receiptConfirmed &&
      sourceDocumentGate(draft, "receipt").canConfirm &&
      draft.unmatchedReceipts.includes(receipt.id);
    findings.push({
      id: "receipt:" + receipt.id,
      weighId: null,
      receiptId: receipt.id,
      species: displaySpecies(receipt.name),
      status: reviewedUnmatched ? "unmatched" : "unconfirmed",
      weighedKg: null,
      receiptKg: positiveWeight(receipt.kg),
      initialKg: null,
      adjustmentKg: null,
      remainingKg: null,
      references: {
        weighing: null,
        receipt: { kind: "receipt", rowId: receipt.id },
        adjustment: null,
      },
    });
  }
  return { draftId: draft.id, revision: draft.revision, findings };
}
