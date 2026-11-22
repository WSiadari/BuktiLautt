// Kontrak bersama Ombak Pintar terpadu: akses data berizin, pilihan alat, dan opsi uji.
import type {
  ArchiveQuery,
  ArchiveQuerySummary,
  ArchiveTransactionCard,
} from "../../src/lib/archiveDomain.ts";
import type { InspectionContext } from "../../src/lib/inspectionContext.ts";
import type { ArchiveAnalytics } from "../../src/lib/archiveAnalytics.ts";

export type UnifiedAgentAccess = {
  workspace: { id: string; name: string; kind?: "personal" | "team" } | null;
  queryArchive: (query: ArchiveQuery) =>
    | { entries: ArchiveTransactionCard[]; summary: ArchiveQuerySummary }
    | Promise<{
        entries: ArchiveTransactionCard[];
        summary: ArchiveQuerySummary;
      }>;
  readInspection: (reference: string) =>
    | { transaction: ArchiveTransactionCard; inspection: InspectionContext }
    | Promise<{
        transaction: ArchiveTransactionCard;
        inspection: InspectionContext;
      }>;
  /** Analitik arsip berizin (penjualan per ikan, selisih berat, pihak, harian). */
  analyzeArchive?: (range: {
    fromDate: string;
    toDate: string;
    counterpartyName?: string | null;
  }) => ArchiveAnalytics | Promise<ArchiveAnalytics>;
};
/** Satu alat baca yang dipilih Gemini atau pemilih dasar, sebelum argumennya divalidasi. */
export type Tool = { name: string; args: unknown };
export type UnifiedAgentOptions = {
  now?: Date;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
};
