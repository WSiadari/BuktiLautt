// Skema alat baca Ombak Pintar: daftar alat, deklarasi untuk Gemini, dan validasi argumen.
// Semua alat hanya membaca. Angka dihitung server, bukan model.
import type { UnifiedAgentRequest } from "../../src/agent/unified.ts";
import {
  resolveFindingTargets,
  type InspectionAgentRequest,
} from "../../src/agent/contract.ts";
import {
  validateArchiveQuery,
  type ArchiveQuery,
} from "../../src/lib/archiveDomain.ts";
import { VisionError } from "../errors.ts";

export const UNIFIED_READ_TOOLS = [
  "get_active_inspection",
  "list_inspection_findings",
  "get_inspection_finding",
  "search_archived_transactions",
  "get_archived_transaction",
  "calculate_transaction_totals",
  "count_transactions",
  "get_pending_inspection_tasks",
  "analyze_sales",
] as const;
export const SALES_FOCUS = [
  "overview",
  "fish",
  "weight",
  "counterparty",
  "daily",
] as const;
export type SalesFocus = (typeof SALES_FOCUS)[number];
export const UNIFIED_UTILITY_TOOLS = [
  "get_general_help",
  "request_clarification",
] as const;
export const HELP_TOPICS = [
  "upload_receipt",
  "review",
  "matching",
  "adjustment",
  "archive",
  "voice",
  "general",
] as const;
export const HELP_TEXT: Record<(typeof HELP_TOPICS)[number], string> = {
  upload_receipt:
    "Pada langkah Nota Penjualan, pilih Foto lalu unggah nota. Jika ingin pembacaan AI, pilih Baca dengan AI dan tinjau persetujuan pengiriman. Periksa usulan terhadap sumber, tambahkan ke form secara eksplisit, lalu konfirmasikan setelah ditinjau.",
  review:
    "Bandingkan setiap usulan dengan sumber asli. Belum diketahui berarti informasi belum cukup, bukan nol. Sunting form bila diperlukan; simpan koreksi tanpa mengganti bukti sumber, lalu konfirmasikan setelah ditinjau.",
  matching:
    "Pilih pasangan baris timbang dan nota yang benar, lalu konfirmasikan pasangan. Nama ikan yang berulang tetap baris terpisah. Catat tanpa pasangan jika memang tidak ada pasangan pada sumber.",
  adjustment:
    "Pastikan kondisi sebenarnya, buka penyesuaian Tidak terjual pada pasangan yang sesuai, isi berat dan keterangan Anda, lalu simpan. Penyesuaian tidak mengganti berat kedua sumber. Asisten tidak menulis penyesuaian.",
  archive:
    "Masuk, pilih ruang kerja yang benar, lalu buka Arsip Transaksi. Tanggal transaksi mengikuti nota dan konfirmasi Anda; referensi membedakan transaksi pada tanggal sama. Total memakai revisi terkonfirmasi terbaru tiap transaksi dan memisahkan draf.",
  voice:
    "Tekan mikrofon, izinkan perekaman, lalu hentikan atau batalkan. Tinjau rekaman dan persetujuan sebelum transkripsi. Periksa dan sunting teks pertanyaan, lalu tekan Kirim. Transkrip tidak dikirim sebagai pertanyaan secara otomatis.",
  general:
    "Mulai dari catatan timbang dan nota, tinjau usulan, konfirmasikan pasangan, lalu catat penyesuaian bila sesuai kondisi. Gunakan arsip untuk menyimpan dan membuka transaksi. Tanyakan langkah tertentu agar panduan lebih tepat.",
};
const objectSchema = (
  properties: Record<string, unknown> = {},
  required: string[] = [],
) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});
const text = { type: "string", maxLength: 160 };
export const queryProperties = {
  fromDate: {
    type: "string",
    description: "YYYY-MM-DD transaction date in Asia/Jakarta",
  },
  toDate: { type: "string", description: "YYYY-MM-DD, inclusive" },
  status: { type: "string", enum: ["confirmed", "draft", "all"] },
  counterpartyName: text,
  reference: text,
  receiptNumber: text,
  offset: { type: "integer", minimum: 0, maximum: 10000 },
  limit: { type: "integer", minimum: 1, maximum: 50 },
};
export function toolDeclarations(request: UnifiedAgentRequest) {
  const input = inspectionRequest(request);
  const resolved = input ? resolveFindingTargets(input) : null;
  const target = resolved?.targets.length === 1 ? resolved.targets[0] : null;
  return [
    {
      name: "get_active_inspection",
      description: "Read the active inspection; never use archive records",
      parametersJsonSchema: objectSchema(),
    },
    {
      name: "list_inspection_findings",
      description: "List active findings or clarify duplicate or absent fish",
      parametersJsonSchema: objectSchema(),
    },
    {
      name: "get_inspection_finding",
      description:
        "Read only the exact active finding resolved from this question",
      parametersJsonSchema: objectSchema(
        { id: { type: "string", ...(target ? { enum: [target.id] } : {}) } },
        ["id"],
      ),
    },
    {
      name: "search_archived_transactions",
      description:
        "Search authorized archive by exact reference, receipt number, counterparty, dates or status; bounded page",
      parametersJsonSchema: objectSchema(queryProperties),
    },
    {
      name: "get_archived_transaction",
      description:
        "Read one authorized transaction by human-readable BL reference, never UUID",
      parametersJsonSchema: objectSchema({ reference: text }, ["reference"]),
    },
    {
      name: "calculate_transaction_totals",
      description:
        "Sum latest confirmed transaction revisions once, excluding drafts; dates required",
      parametersJsonSchema: objectSchema(queryProperties, [
        "fromDate",
        "toDate",
      ]),
    },
    {
      name: "count_transactions",
      description:
        "Count distinct authorized transactions by date/status; total is never model-computed",
      parametersJsonSchema: objectSchema(queryProperties),
    },
    {
      name: "get_pending_inspection_tasks",
      description:
        "Read outstanding tasks on active inspection, or unfinished archive drafts",
      parametersJsonSchema: objectSchema(
        { scope: { type: "string", enum: ["active", "archive"] } },
        ["scope"],
      ),
    },
    {
      name: "analyze_sales",
      description:
        "Analyze confirmed archived sales for a date range: overview (total Rupiah, kg sold, top fish), fish (kg/Rupiah/average price per fish species, optionally one fishName), weight (weighing vs receipt differences, unsold, open), counterparty (buyers ranked), daily (per-day totals). compare=true adds the previous period. Server computes every number.",
      parametersJsonSchema: objectSchema(
        {
          fromDate: queryProperties.fromDate,
          toDate: queryProperties.toDate,
          focus: { type: "string", enum: SALES_FOCUS },
          fishName: { type: "string", maxLength: 80 },
          counterpartyName: text,
          compare: { type: "boolean" },
        },
        ["fromDate", "toDate", "focus"],
      ),
    },
    {
      name: "get_general_help",
      description:
        "Read fixed usage instructions without querying any transaction",
      parametersJsonSchema: objectSchema(
        { topic: { type: "string", enum: HELP_TOPICS } },
        ["topic"],
      ),
    },
    {
      name: "request_clarification",
      description:
        "Ask about ambiguous intent, date, transaction, inspection or an explicitly named different workspace",
      parametersJsonSchema: objectSchema(
        {
          reason: {
            type: "string",
            enum: [
              "question",
              "date",
              "transaction",
              "inspection",
              "workspace",
            ],
          },
          workspaceName: { type: "string", maxLength: 100 },
        },
        ["reason"],
      ),
    },
  ];
}
export function inspectionRequest(
  request: UnifiedAgentRequest,
): InspectionAgentRequest | null {
  return request.inspection
    ? {
        requestId: request.requestId,
        question: request.question,
        snapshot: request.inspection,
        ...(request.findingId ? { findingId: request.findingId } : {}),
      }
    : null;
}
export const invalidTool = () =>
  new VisionError(
    "INVALID_OUTPUT",
    502,
    "Pilihan alat atau argumen asisten belum valid. Perjelas pertanyaan atau gunakan Panduan dasar.",
  );
export function boundedQuery(args: unknown): ArchiveQuery {
  if (
    !args ||
    typeof args !== "object" ||
    Array.isArray(args) ||
    Object.keys(args).some((key) => !Object.hasOwn(queryProperties, key))
  )
    throw invalidTool();
  if ("status" in args && typeof args.status !== "string") throw invalidTool();
  try {
    const query = validateArchiveQuery(args);
    if (
      query.fromDate &&
      query.toDate &&
      (Date.parse(query.toDate) - Date.parse(query.fromDate)) / 86400000 > 366
    )
      throw invalidTool();
    return query;
  } catch {
    throw invalidTool();
  }
}
