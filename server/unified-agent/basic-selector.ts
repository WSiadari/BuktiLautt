// Pemilih alat dasar: membaca pertanyaan dengan aturan tetap saat Gemini tidak tersedia.
// Bila maksud, tanggal, atau pihak belum jelas, hasilnya request_clarification, bukan tebakan.
import type { UnifiedAgentRequest } from "../../src/agent/unified.ts";
import {
  isInspectionFollowUp,
  resolveFindingTargets,
} from "../../src/agent/contract.ts";
import { basicDateRange } from "./dates.ts";
import { inspectionRequest, type SalesFocus } from "./tool-schema.ts";
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
/** Kenali pertanyaan analitik penjualan; tanpa periode tetap memakai alur lama. */
export function salesIntent(
  question: string,
): { focus: SalesFocus; compare: boolean } | null {
  const q = question.toLocaleLowerCase("id-ID");
  const compare =
    /\b(?:banding|dibanding(?:kan)?|bandingkan|perbandingan|vs|naik|turun)\b/u.test(q);
  const focus: SalesFocus | null =
    /\b(?:selisih|susut|tidak terjual|penyesuaian|hilang)\b/u.test(q)
      ? "weight"
      : /\b(?:pembeli|pengepul|pelanggan|pihak|siapa)\b/u.test(q)
        ? "counterparty"
        : /\b(?:per hari|harian|tiap hari|setiap hari)\b|\bhari (?:apa|mana|paling|tertinggi|terbaik|terbanyak)\b/u.test(q)
          ? "daily"
          : /\b(?:(?:per|tiap|setiap)\s+(?:jenis\s+)?ikan|jenis ikan|ikan (?:apa|mana)|paling (?:laku|banyak)|terlaris|terbanyak|harga rata|rata-rata harga|kg|kilo(?:gram)?)\b/u.test(q)
            ? "fish"
            : /\b(?:jual|penjualan|terjual|pendapatan|omzet|omset|hasil|ringkas(?:an)?|rangkum(?:an)?|rekap|ikan)\b/u.test(q) || compare
              ? "overview"
              : null;
  return focus ? { focus, compare } : null;
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
