import type { RawExtraction, VisionRequest, ClassifiedRawExtraction } from "../src/vision/contract.ts";
export function rawFixture(documentType: "weighing" | "receipt" = "receipt"): RawExtraction {
  return {
    documentType,
    items: [{ itemName: "Teri", weightValue: "12,5", weightUnit: "kg", unitPrice: "Rp25.000/kg", subtotal: "Rp312.500", discount: null, rawText: "Teri 12,5 kg Rp25.000/kg", issues: [] }],
    extractedDate: null, documentTotal: "Rp312.500", deduction: "Rp0", charges: null, notes: null, warnings: [],
  };
}
export function requestFixture(): VisionRequest {
  return { documentType: "receipt", requestId: "test-request", sourceId: "test-source", sourceRevision: "1", text: "Teri 12,5 kg Rp25.000/kg" };
}
export function classifiedFixture(actualType: "weighing" | "sales_receipt" | "unknown" = "sales_receipt"): ClassifiedRawExtraction {
  return {
    ...rawFixture(actualType === "weighing" ? "weighing" : "receipt"),
    schemaVersion: 2, documentType: actualType,
    classification: { certainty: actualType === "unknown" ? "uncertain" : "clear", evidence: actualType === "weighing" ? ["CATATAN TIMBANG", "Jenis ikan dan berat"] : actualType === "sales_receipt" ? ["NOTA PENJUALAN", "Total dan harga per kg"] : [] },
    readability: "readable",
  };
}
