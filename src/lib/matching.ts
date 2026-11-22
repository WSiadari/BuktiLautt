import type { Draft, Pair, PreviousReview } from "../types.ts";
import { sourceDocumentGate } from "./documentValidation.ts";

export type FishName = string;
type MatchingDraft = Pick<Draft, "weighing" | "receipt" | "pairs"> &
  Partial<Pick<Draft, "id" | "sources" | "rawExtractions">>;
type ReviewPair = Pair & { reviewIssue?: string };
export type PairValidation = {
  valid: boolean;
  code:
    | "ok"
    | "missing-row"
    | "ambiguous-name"
    | "different-name"
    | "row-reused"
    | "document-type";
  message: string;
  canonicalName: FishName | null;
};

export function normalizeFishName(name: unknown): FishName | null {
  if (typeof name !== "string") return null;
  const normalized = name
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .replace(/^ikan /u, "");
  // This identifies exact written labels, without resolving species or aliases.
  if (!/^[\p{L}][\p{L}\p{M}]*(?:[ -][\p{L}][\p{L}\p{M}]*)*$/u.test(normalized))
    return null;
  const words = normalized.split(/[ -]/u);
  const ambiguousWords = new Set([
    "ikan",
    "fish",
    "genericfish",
    "campuran",
    "lainnya",
    "unknown",
    "tidak",
    "belum",
    "terbaca",
    "diketahui",
    "atau",
    "dan",
    "mix",
    "mixed",
    "jenis",
    "hasil",
    "tangkapan",
    "umum",
    "generic",
    "general",
    "kosong",
    "nihil",
    "none",
    "null",
    "undefined",
    "na",
  ]);
  if (words.some((word) => ambiguousWords.has(word))) return null;
  const broadLabels = [
    "laut",
    "air tawar",
    "air laut",
    "pelagis",
    "demersal",
    "asin",
    "segar",
    "beku",
    "kering",
  ];
  if (broadLabels.includes(normalized)) return null;
  const fishTokens = new Set(
    words.filter((word) =>
      ["teri", "tongkol", "kembung", "tuna"].includes(word),
    ),
  );
  if (fishTokens.size > 1) return null;
  return normalized;
}

export function validatePair(
  draft: MatchingDraft,
  weighId: string,
  receiptId: string,
): PairValidation {
  if (draft.sources) {
    for (const kind of ["weighing", "receipt"] as const) {
      const gate = sourceDocumentGate(
        { ...draft, id: draft.id ?? "", sources: draft.sources },
        kind,
      );
      if (!gate.canConfirm)
        return {
          valid: false,
          code: "document-type",
          canonicalName: null,
          message: gate.message,
        };
    }
  }
  const weighing = draft.weighing.filter((row) => row.id === weighId);
  const receipt = draft.receipt.filter((row) => row.id === receiptId);
  if (weighing.length !== 1 || receipt.length !== 1) {
    return {
      valid: false,
      code: "missing-row",
      canonicalName: null,
      message: "Pilih baris timbang dan nota yang masih tersedia.",
    };
  }
  const weighedName = normalizeFishName(weighing[0].name);
  const receiptName = normalizeFishName(receipt[0].name);
  if (!weighedName || !receiptName) {
    return {
      valid: false,
      code: "ambiguous-name",
      canonicalName: null,
      message:
        "Nama ikan belum jelas. Periksa dan koreksi nama terhadap sumber sebelum memasangkan.",
    };
  }
  if (weighedName !== receiptName) {
    return {
      valid: false,
      code: "different-name",
      canonicalName: null,
      message: "Jenis ikan berbeda. Pilih nota dengan jenis ikan yang sama.",
    };
  }
  if (
    draft.pairs.filter((pair) => pair.weighId === weighId).length > 1 ||
    draft.pairs.some(
      (pair) =>
        pair.weighId !== weighId &&
        pair.receiptId === receiptId &&
        pair.decision !== "unmatched",
    )
  ) {
    return {
      valid: false,
      code: "row-reused",
      canonicalName: null,
      message:
        "Baris ini sudah digunakan oleh pasangan lain. Tinjau pasangan tersebut terlebih dahulu.",
    };
  }
  return {
    valid: true,
    code: "ok",
    canonicalName: weighedName,
    message: "Jenis ikan sama. Pasangan dapat dikonfirmasi pengguna.",
  };
}

export function buildMatchReviewSnapshot(draft: Draft): PreviousReview {
  const sources = {
    weighing:
      draft.sources.weighing.filename +
      " · " +
      draft.sources.weighing.capturedAt,
    receipt:
      draft.sources.receipt.filename + " · " + draft.sources.receipt.capturedAt,
  };
  const currentRows: PreviousReview["rows"] = draft.pairs
    .filter(
      (pair) =>
        pair.decision !== "pending" ||
        pair.reviewIssue ||
        pair.adjustment ||
        pair.explanation,
    )
    .map((pair) => ({
      name: draft.weighing.find((row) => row.id === pair.weighId)?.name || "",
      weighedKg:
        draft.weighing.find((row) => row.id === pair.weighId)?.kg || "",
      receiptKg:
        draft.receipt.find((row) => row.id === pair.receiptId)?.kg || "",
      weighId: pair.weighId,
      receiptId: pair.receiptId,
      receiptName:
        draft.receipt.find((row) => row.id === pair.receiptId)?.name || "",
      reviewIssue: pair.reviewIssue,
      decision: pair.decision,
      adjustment: pair.adjustment,
      explanation: pair.explanation,
      sourceWeighing: sources.weighing,
      sourceReceipt: sources.receipt,
      reviewRevision: draft.revision,
    }));
  // Invalidated adjustments are retained even when later choices replace the last ordinary review.
  const rows: PreviousReview["rows"] = (draft.previousReview?.rows || [])
    .filter((row) => row.reviewIssue)
    .map((row) => ({
      ...row,
      sourceWeighing:
        row.sourceWeighing ?? draft.previousReview!.sources.weighing,
      sourceReceipt: row.sourceReceipt ?? draft.previousReview!.sources.receipt,
      reviewRevision: row.reviewRevision ?? draft.previousReview!.revision,
    }));
  const key = (row: PreviousReview["rows"][number]) =>
    JSON.stringify([
      row.weighId,
      row.name,
      row.receiptId,
      row.receiptName,
      row.weighedKg,
      row.receiptKg,
      row.decision,
      row.adjustment,
      row.explanation,
      row.reviewIssue,
      row.sourceWeighing,
      row.sourceReceipt,
    ]);
  const seen = new Set(rows.map(key));
  for (const row of currentRows)
    if (!seen.has(key(row))) {
      rows.push(row);
      seen.add(key(row));
    }
  return {
    revision: draft.revision,
    sources,
    rows,
  };
}

export function confirmPair(
  draft: Draft,
  weighId: string,
  receiptId: string,
): { ok: boolean; draft: Draft; validation: PairValidation } {
  const validation = validatePair(draft, weighId, receiptId);
  const target = draft.pairs.find((pair) => pair.weighId === weighId) as
    ReviewPair | undefined;
  if (!validation.valid) return { ok: false, draft, validation };
  if (!target) {
    return {
      ok: false,
      draft,
      validation: {
        valid: false,
        code: "missing-row",
        canonicalName: null,
        message: "Baris pencocokan belum tersedia. Tinjau ulang sumber.",
      },
    };
  }
  if (
    target.decision === "confirmed" &&
    target.receiptId === receiptId &&
    !target.reviewIssue
  ) {
    return { ok: true, draft, validation };
  }
  const previousReview =
    target.reviewIssue || target.adjustment || target.explanation
      ? buildMatchReviewSnapshot(draft)
      : draft.previousReview;
  return {
    ok: true,
    validation,
    draft: {
      ...draft,
      revision: draft.revision + 1,
      previousReview,
      pairs: draft.pairs.map((pair) =>
        pair.weighId === weighId
          ? {
              ...pair,
              receiptId,
              decision: "confirmed",
              adjustment: "",
              explanation: "",
              reviewIssue: undefined,
            }
          : pair,
      ),
    },
  };
}

export function confirmedPairsAreValid(draft: MatchingDraft): boolean {
  return draft.pairs.every(
    (pair) =>
      pair.decision !== "confirmed" ||
      (!(pair as ReviewPair).reviewIssue &&
        validatePair(draft, pair.weighId, pair.receiptId).valid),
  );
}

export function sanitizeMatches(draft: Draft): {
  draft: Draft;
  issues: { weighId: string; message: string }[];
  changed: boolean;
} {
  const issues: { weighId: string; message: string }[] = [];
  let changed = false;
  const pairs = draft.pairs.map((pair) => {
    const reviewPair = pair as ReviewPair;
    if (pair.decision !== "confirmed") {
      if (reviewPair.reviewIssue) {
        issues.push({ weighId: pair.weighId, message: reviewPair.reviewIssue });
      }
      return pair;
    }
    const validation = validatePair(draft, pair.weighId, pair.receiptId);
    if (validation.valid && !reviewPair.reviewIssue) return pair;
    const message = reviewPair.reviewIssue || validation.message;
    issues.push({ weighId: pair.weighId, message });
    changed = true;
    return { ...pair, decision: "pending" as const, reviewIssue: message };
  });
  if (!changed) return { draft, issues, changed };
  return {
    draft: {
      ...draft,
      pairs,
      previousReview: buildMatchReviewSnapshot({ ...draft, pairs }),
      revision: draft.revision + 1,
    },
    issues,
    changed,
  };
}
