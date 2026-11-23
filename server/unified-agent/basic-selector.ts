// Pemilih alat dasar: membaca pertanyaan dengan aturan tetap saat Gemini tidak tersedia.
// Bila maksud, tanggal, atau pihak belum jelas, hasilnya request_clarification, bukan tebakan.
import type { UnifiedAgentRequest } from "../../src/agent/unified.ts";
import {
  isInspectionFollowUp,
  resolveFindingTargets,
} from "../../src/agent/contract.ts";
import { basicDateRange } from "./dates.ts";
import {
  inspectionRequest,
  type SalesFocus,
  type SalesRanking,
} from "./tool-schema.ts";
import type { Tool } from "./types.ts";

export function requestedWorkspaceName(question: string): string | null {
  if (/\b(?:arsip|transaksi|ruang) pribadi\b/iu.test(question))
    return "Ruang pribadi";
  const match =
    /\b(?:tim|ruang kerja|workspace)\s+(?:["“]([^"”]{1,100})["”]|(.+?))(?=\s+(?:pada|tanggal|tgl|hari|minggu|bulan|tahun|dengan|untuk)\b|[?!.]|$)/iu.exec(
      question,
    );
  const name = (match?.[1] || match?.[2] || "").trim();
  return !name || /^(?:saya|kami|ini|aktif)$/iu.test(name) ? null : name;
}
export function explicitArchiveStatus(
  question: string,
): "confirmed" | "draft" | "all" | null {
  if (
    /\b(?:tanpa|kecuali|bukan|tidak\s+termasuk)\s+(?:transaksi\s+)?(?:draf|draft)\b/iu.test(
      question,
    )
  )
    return "confirmed";
  if (
    /\bsemua\s+status\b|\btermasuk\s+(?:draf|draft)\b|\b(?:draf|draft)\s+(?:dan|atau)\s+(?:terkonfirmasi|confirmed)\b|\b(?:terkonfirmasi|confirmed)\s+(?:dan|atau)\s+(?:draf|draft)\b/iu.test(
      question,
    )
  )
    return "all";
  if (
    /\b(?:draf|draft)\b|\bbelum\s+(?:dikonfirmasi|terkonfirmasi)\b/iu.test(
      question,
    )
  )
    return "draft";
  return /\b(?:terkonfirmasi|confirmed)\b|\bsudah\s+dikonfirmasi\b/iu.test(
    question,
  )
    ? "confirmed"
    : null;
}
export function aggregateStatus(question: string): "confirmed" | "draft" | "all" {
  return explicitArchiveStatus(question) ?? "confirmed";
}
export function explicitCounterparty(question: string): {
  name: string | null;
  unclear: boolean;
} {
  if (!/\bdengan\b/iu.test(question)) return { name: null, unclear: false };
  const matched =
    /\bdengan\s+(.+?)(?=\s+(?:pada|tanggal|tgl|hari|minggu|bulan|tahun|status|nomor|referensi)\b|[?!]|$)/iu.exec(
      question,
    )?.[1];
  const name =
    matched
      ?.trim()
      .replace(/[.!?]+$/u, "")
      .replace(/^["“]|["”]$/gu, "")
      .trim() || null;
  const unclear =
    !name ||
    name.length > 160 ||
    /\b(?:dan|atau)\b|\b(?:pihak itu|orang itu|yang tadi|siapa saja)\b|[\u0000-\u001f\u007f]/iu.test(
      name,
    );
  return { name: unclear ? null : name, unclear };
}
/** Pihak untuk analitik: "dengan bulan lalu" adalah pembanding waktu, bukan nama pihak. */
export function salesCounterparty(question: string) {
  const party = explicitCounterparty(question);
  return party.name &&
    /^(?:bulan|minggu|tahun|hari|periode|kemarin|sebelumnya|\d)/iu.test(party.name)
    ? { name: null, unclear: false }
    : party;
}
const TOP_RANK =
  /\b(?:paling\s+(?:laku|banyak|mahal|tinggi|besar)|terlaris|terbanyak|tertinggi|termahal|terbesar)\b/u;
const BOTTOM_RANK =
  /\b(?:paling\s+(?:sedikit|kurang|rendah|kecil|sepi|tidak\s+laku|murah)|terendah|terkecil|tersedikit|termurah|kurang\s+laku|sedikit\s+terjual)\b/u;
const PRICE_METRIC =
  /\b(?:mahal|murah|termahal|termurah|harga\s+(?:tertinggi|terendah|rata(?:-rata)?|per\s+kg)|harga\s*\/\s*kg|rata-rata\s+harga)\b/u;
const REVENUE_METRIC =
  /\b(?:penghasil|paling\s+menguntungkan|(?:pendapatan|penghasilan|om[sz]et|nilai)\s+(?:terbesar|tertinggi|terkecil|terendah|paling\s+(?:besar|tinggi|kecil|rendah)))\b/u;
/** Arah peringkat: kata kunci "bawah" hanya menang bila muncul lebih dulu daripada kata kunci "atas". */
function rankDirection(q: string): SalesRanking["direction"] {
  const top = TOP_RANK.exec(q)?.index ?? -1;
  const bottom = BOTTOM_RANK.exec(q)?.index ?? -1;
  return bottom >= 0 && (top < 0 || bottom < top) ? "bottom" : "top";
}
/** Kenali pertanyaan analitik penjualan; tanpa periode tetap memakai alur lama. */
export function salesIntent(
  question: string,
): ({ focus: SalesFocus; compare: boolean } & SalesRanking) | null {
  const q = question.toLocaleLowerCase("id-ID");
  const compare =
    /\b(?:banding|dibanding(?:kan)?|bandingkan|perbandingan|vs|naik|turun)\b/u.test(q);
  const metric: SalesRanking["metric"] = PRICE_METRIC.test(q)
    ? "price"
    : REVENUE_METRIC.test(q)
      ? "revenue"
      : "weight";
  const direction = rankDirection(q);
  // Kata peringkat yang menyebut ikan atau barang terjual ("ikan paling sepi",
  // "paling sedikit terjual", "paling murah") berarti peringkat per jenis ikan.
  const fishRanking =
    (TOP_RANK.test(q) || BOTTOM_RANK.test(q) || metric !== "weight") &&
    /\b(?:ikan|penghasil|laku|terjual|mahal|murah|termahal|termurah)\b/u.test(q);
  const focus: SalesFocus | null =
    /\b(?:selisih|susut|tidak terjual|penyesuaian|hilang)\b/u.test(q)
      ? "weight"
      : /\b(?:pembeli|pengepul|pelanggan|pihak|siapa)\b/u.test(q)
        ? "counterparty"
        : /\b(?:per hari|harian|tiap hari|setiap hari)\b|\bhari (?:apa|mana|paling|tertinggi|terbaik|terbanyak)\b/u.test(q)
          ? "daily"
          : fishRanking || /\b(?:(?:per|tiap|setiap)\s+(?:jenis\s+)?ikan|jenis ikan|ikan (?:apa|mana)|paling (?:laku|banyak)|terlaris|terbanyak|harga rata|rata-rata harga|kg|kilo(?:gram)?)\b/u.test(q)
            ? "fish"
            : /\b(?:jual|penjualan|terjual|pendapatan|omzet|omset|hasil|ringkas(?:an)?|rangkum(?:an)?|rekap|ikan)\b/u.test(q) || compare
              ? "overview"
              : null;
  return focus ? { focus, compare, metric, direction } : null;
}
/**
 * Pertanyaan tentang dunia luar (cuaca, harga pasar, berita) tidak bisa dijawab dari
 * catatan pengguna. Nama pihak atau ruang kerja yang disebut ("dengan CV Angin Laut")
 * tidak dihitung sebagai topik.
 */
export function outOfScopeQuestion(question: string): boolean {
  const lower = (value: string) => value.normalize("NFKC").toLocaleLowerCase("id-ID");
  let q = lower(question);
  for (const name of [explicitCounterparty(question).name, requestedWorkspaceName(question)])
    if (name) q = q.replace(lower(name), " ");
  return /\b(?:cuaca|hujan|prakiraan|ramalan|badai|gelombang|angin|berita)\b|\bharga\s+pasar(?:an)?\b|\bpasaran\b|\bharga\b[^?!.]*\bdi\s+(?:pasar|pelelangan|tpi)\b/u.test(
    q,
  );
}
export function selectBasicUnifiedTool(
  request: UnifiedAgentRequest,
  now = new Date(),
): Tool {
  const question = request.question.trim();
  if (
    /^(?:bagaimana|gimana|cara)\b/iu.test(question) &&
    /\b(?:menggunakan|memakai|suara|mikrofon|rekam|unggah|mengunggah|upload|foto|nota|arsip)\b/iu.test(
      question,
    )
  )
    return {
      name: "get_general_help",
      args: {
        topic: /\b(?:suara|mikrofon|rekam)\b/iu.test(question)
          ? "voice"
          : /\b(?:unggah|mengunggah|upload|foto|nota)\b/iu.test(question)
            ? "upload_receipt"
            : /\b(?:arsip|transaksi)\b/iu.test(question)
              ? "archive"
              : "general",
      },
    };
  if (isInspectionFollowUp(question))
    return { name: "get_pending_inspection_tasks", args: { scope: "active" } };
  const sales = salesIntent(question);
  if (sales) {
    let range: { fromDate: string; toDate: string } | null;
    try {
      range = basicDateRange(question, now);
    } catch {
      range = null;
    }
    if (range) {
      const party = salesCounterparty(question);
      if (party.unclear)
        return { name: "request_clarification", args: { reason: "transaction" } };
      return {
        name: "analyze_sales",
        args: {
          ...range,
          focus: sales.focus,
          ...(sales.compare ? { compare: true } : {}),
          ...(party.name ? { counterpartyName: party.name } : {}),
        },
      };
    }
  }
  if (/\b(?:total|jumlah transaksi|berapa transaksi)\b/iu.test(question)) {
    const party = explicitCounterparty(question);
    if (party.unclear)
      return { name: "request_clarification", args: { reason: "transaction" } };
    try {
      return {
        name:
          /\b(?:jumlah|berapa)\s+transaksi\b/iu.test(question) &&
          !/\btotal\b/iu.test(question)
            ? "count_transactions"
            : "calculate_transaction_totals",
        args: {
          ...basicDateRange(question, now),
          status: aggregateStatus(question),
          ...(party.name ? { counterpartyName: party.name } : {}),
        },
      };
    } catch {
      return { name: "request_clarification", args: { reason: "date" } };
    }
  }
  const reference = /\bBL-\d{8}-\d+\b/iu.exec(question)?.[0];
  if (reference)
    return {
      name: "get_archived_transaction",
      args: { reference: reference.toUpperCase() },
    };
  const receipt = /\b(?:nomor nota|no\.? nota)\s+([^?!.]{1,100})/iu
    .exec(question)?.[1]
    ?.trim();
  if (receipt)
    return {
      name: "search_archived_transactions",
      args: {
        receiptNumber: receipt,
        status: explicitArchiveStatus(question) ?? "all",
      },
    };
  if (/\b(?:transaksi|arsip)\b/iu.test(question)) {
    if (
      /^(?:tampilkan|cari)\b/iu.test(question) &&
      /\b(?:tanggal|tgl)\b/iu.test(question)
    ) {
      try {
        const range = basicDateRange(question, now);
        const party = explicitCounterparty(question);
        if (party.unclear)
          return {
            name: "request_clarification",
            args: { reason: "transaction" },
          };
        return {
          name: "search_archived_transactions",
          args: {
            ...range,
            ...(party.name ? { counterpartyName: party.name } : {}),
            status: explicitArchiveStatus(question) ?? "all",
          },
        };
      } catch {
        return { name: "request_clarification", args: { reason: "date" } };
      }
    }
    const party = explicitCounterparty(question);
    if (party.name && /^(?:tampilkan|cari)\b/iu.test(question))
      return {
        name: "search_archived_transactions",
        args: {
          counterpartyName: party.name,
          status: explicitArchiveStatus(question) ?? "all",
        },
      };
    return { name: "request_clarification", args: { reason: "transaction" } };
  }
  const inspection = inspectionRequest(request);
  if (inspection) {
    const targets = resolveFindingTargets(inspection);
    if (["single", "multiple", "not_found", "general"].includes(targets.kind))
      return targets.targets.length === 1
        ? {
            name: "get_inspection_finding",
            args: { id: targets.targets[0].id },
          }
        : { name: "list_inspection_findings", args: {} };
  }
  return { name: "request_clarification", args: { reason: "question" } };
}
