import type { Draft } from "../types.ts";
import {
  documentCompatibility,
  type DocumentType,
} from "../vision/contract.ts";

type DocumentDraft = Pick<
  Draft,
  "id" | "sources" | "rawExtractions" | "weighing" | "receipt"
>;

export function extractionBelongsToSource(
  draft: Pick<Draft, "id" | "sources" | "rawExtractions">,
  kind: DocumentType,
): boolean {
  const extraction = draft.rawExtractions?.[kind];
  const capturedAt = draft.sources[kind].capturedAt;
  return !!extraction &&
    extraction.sourceCapturedAt === capturedAt &&
    extraction.result.documentType === kind &&
    extraction.result.sourceId === `${draft.id}:${kind}:${capturedAt}`;
}

export function sourceDocumentGate(
  draft: DocumentDraft,
  kind: DocumentType,
): { canConfirm: boolean; message: string } {
  const extraction = draft.rawExtractions?.[kind];
  if (
    extraction &&
    extraction.sourceCapturedAt === draft.sources[kind].capturedAt
  ) {
    if (!extractionBelongsToSource(draft, kind))
      return {
        canConfirm: false,
        message:
          "Hasil pembacaan tidak terikat pada sumber pemeriksaan ini. Baca ulang sumber saat ini sebelum mengonfirmasi.",
      };
    const compatibility = documentCompatibility(extraction.result, kind);
    return {
      canConfirm: compatibility.canImport,
      message: compatibility.message,
    };
  }
  const hasAIOrigin = draft[kind].some(
    (row) => row.extractionRequestId || row.provenance === "Hasil AI",
  );
  return hasAIOrigin
    ? {
        canConfirm: false,
        message:
          "Jenis sumber untuk baris hasil AI belum dapat diverifikasi. Baca ulang sumber yang benar sebelum mengonfirmasi.",
      }
    : { canConfirm: true, message: "" };
}

export function documentConfirmationsAreValid(draft: Draft): boolean {
  return (
    (!draft.weighingConfirmed ||
      sourceDocumentGate(draft, "weighing").canConfirm) &&
    (!draft.receiptConfirmed || sourceDocumentGate(draft, "receipt").canConfirm)
  );
}

export function sanitizeDocumentConfirmations(draft: Draft): {
  draft: Draft;
  changed: boolean;
} {
  const weighingConfirmed =
    draft.weighingConfirmed && sourceDocumentGate(draft, "weighing").canConfirm;
  const receiptConfirmed =
    draft.receiptConfirmed && sourceDocumentGate(draft, "receipt").canConfirm;
  const changed =
    weighingConfirmed !== draft.weighingConfirmed ||
    receiptConfirmed !== draft.receiptConfirmed;
  return {
    draft: changed
      ? {
          ...draft,
          weighingConfirmed,
          receiptConfirmed,
          revision: draft.revision + 1,
        }
      : draft,
    changed,
  };
}
