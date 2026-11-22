import type { VisionResult } from "./vision/contract.ts";
import type { VoiceResult } from "./voice/contract.ts";

export type Row = {
  id: string;
  name: string;
  kg: string;
  price: string;
  provenance:
    "Usulan AI simulasi" | "Hasil AI" | "Diisi pengguna" | "Dikoreksi pengguna";
  sourceSubtotal?: string;
  sourceDiscount?: string;
  extractionRequestId?: string;
  extractionItemIndex?: number;
  rawText?: string;
  rawWeight?: string;
  rawUnit?: string;
  extractionIssues?: string[];
};
export type Source = {
  text: string;
  filename: string;
  image?: string;
  capturedAt: string;
};
export type Pair = {
  weighId: string;
  receiptId: string;
  decision: "pending" | "confirmed" | "unmatched";
  adjustment: string;
  explanation: string;
  reviewIssue?: string;
};
export type PreviousReview = {
  revision: number;
  sources: { weighing: string; receipt: string };
  rows: {
    name: string;
    weighedKg: string;
    receiptKg: string;
    decision: Pair["decision"];
    adjustment: string;
    explanation: string;
    reviewIssue?: string;
    receiptId?: string;
    receiptName?: string;
    weighId?: string;
    sourceWeighing?: string;
    sourceReceipt?: string;
    reviewRevision?: number;
  }[];
};
export type Draft = {
  transactionKey?: string;
  version: 1;
  id: string;
  demo: boolean;
  revision: number;
  weighing: Row[];
  receipt: Row[];
  sources: { weighing: Source; receipt: Source };
  weighingConfirmed: boolean;
  receiptConfirmed: boolean;
  pairs: Pair[];
  unmatchedReceipts: string[];
  deduction: string;
  charges: string;
  savedAt: string;
  previousReview?: PreviousReview;
  voiceExtraction?: {
    result: VoiceResult;
    receivedAt: string;
    sourceCapturedAt: string;
  };
  rawExtractions?: Partial<
    Record<
      "weighing" | "receipt",
      { result: VisionResult; receivedAt: string; sourceCapturedAt: string }
    >
  >;
  confirmedSnapshots?: Partial<
    Record<
      "weighing" | "receipt",
      {
        revision: number;
        confirmedAt: string;
        sourceCapturedAt: string;
        rows: Row[];
        deduction: string;
        charges: string;
      }
    >
  >;
};
export type Step = "home" | "weighing" | "receipt" | "matching" | "report";

