import type { Draft } from "../types.ts";
import { calculateReceiptTotals, parseKilograms } from "./examination.ts";
import { extractionBelongsToSource, sourceDocumentGate } from "./documentValidation.ts";
import { documentCompatibility } from "../vision/contract.ts";

const reviewedAmount = (value: string) =>
  /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : null;

export function compareReceiptDocument(draft: Draft) {
  const calculated = calculateReceiptTotals(
    draft.receipt.map((row) => ({
      receiptKg: parseKilograms(row.kg),
      pricePerKg: reviewedAmount(row.price),
    })),
    reviewedAmount(draft.deduction),
    reviewedAmount(draft.charges),
  );
  const extraction = draft.rawExtractions?.receipt;
  const printedTotalRupiah =
    extraction &&
    extractionBelongsToSource(draft, "receipt") &&
    documentCompatibility(extraction.result, "receipt").canImport
      ? extraction.result.normalized.documentTotalRupiah
      : null;
  let status: "unavailable" | "awaiting_review" | "match" | "difference" =
    "unavailable";
  let differenceRupiah: number | null = null;
  if (printedTotalRupiah !== null) {
    status = "awaiting_review";
    if (
      draft.receiptConfirmed &&
      sourceDocumentGate(draft, "receipt").canConfirm &&
      calculated.status === "ready"
    ) {
      differenceRupiah = calculated.totalRupiah! - printedTotalRupiah;
      status = differenceRupiah === 0 ? "match" : "difference";
    }
  }
  return {
    printedTotalRupiah,
    calculatedSubtotalRupiah: calculated.subtotalRupiah,
    calculatedTotalRupiah: calculated.totalRupiah,
    status,
    differenceRupiah,
  };
}
