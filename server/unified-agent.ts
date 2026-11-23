// Ombak Pintar terpadu: memilih satu alat baca, menjalankannya pada data berizin,
// lalu memvalidasi jawaban. Bagian lain ada di server/unified-agent/:
//   tool-schema.ts     daftar alat, deklarasi untuk Gemini, validasi argumen
//   basic-selector.ts  pemilih alat dasar tanpa model
//   gemini-selector.ts pemilih alat lewat Gemini
//   dates.ts           parser dan label tanggal (WIB)
//   answers.ts         penyusun teks jawaban
import type {
  UnifiedAgentRequest,
  UnifiedAgentResponse,
} from "../src/agent/unified.ts";
import {
  validateUnifiedAgentRequest,
  validateUnifiedAgentResponse,
} from "../src/agent/unified.ts";
import {
  exactAgentObject,
  isInspectionFollowUp,
  renderInspectionAnswer,
  resolveFindingTargets,
} from "../src/agent/contract.ts";
import { buildInspectionFollowUp } from "../src/lib/archiveDomain.ts";
import { previousPeriod } from "../src/lib/archiveAnalytics.ts";
import { unavailableReason, type VisionConfig } from "./config.ts";
import { VisionError } from "./errors.ts";
import { findFish, output, renderSales, switchWorkspace } from "./unified-agent/answers.ts";
import {
  aggregateStatus,
  explicitArchiveStatus,
  explicitCounterparty,
  outOfScopeQuestion,
  requestedWorkspaceName,
  salesCounterparty,
  salesIntent,
  selectBasicUnifiedTool,
} from "./unified-agent/basic-selector.ts";
import { basicDateRange, periodLabel } from "./unified-agent/dates.ts";
import { providerTool } from "./unified-agent/gemini-selector.ts";
import {
  HELP_TEXT,
  HELP_TOPICS,
  OUT_OF_SCOPE_TEXT,
  SALES_FOCUS,
  boundedQuery,
  inspectionRequest,
  invalidTool,
  type SalesFocus,
} from "./unified-agent/tool-schema.ts";
import type { Tool, UnifiedAgentAccess, UnifiedAgentOptions } from "./unified-agent/types.ts";

const ACTIVE_INSPECTION_TOOLS = [
  "get_active_inspection",
  "list_inspection_findings",
  "get_inspection_finding",
];
/**
 * Pertanyaan penjualan yang menyebut periode (mis. "ikan apa paling laku bulan ini")
 * adalah analitik arsip, bukan pertanyaan pemeriksaan aktif. Gemini kadang tetap memilih
 * alat pemeriksaan karena ada pemeriksaan terbuka dan pertanyaan menyebut "ikan", sehingga
 * jawabannya malah meminta nama ikan. Bila aturan tetap (sama dengan Panduan dasar)
 * mengenali analitik penjualan berperiode, pilihan itu yang dipakai.
 */
function preferSalesAnalytics(
  request: UnifiedAgentRequest,
  call: Tool,
  now?: Date,
): Tool {
  if (!ACTIVE_INSPECTION_TOOLS.includes(call.name)) return call;
  const rule = selectBasicUnifiedTool(request, now);
  return rule.name === "analyze_sales" ? rule : call;
}

export type { UnifiedAgentAccess, UnifiedAgentOptions } from "./unified-agent/types.ts";
export {
  SALES_FOCUS,
  UNIFIED_READ_TOOLS,
  UNIFIED_UTILITY_TOOLS,
} from "./unified-agent/tool-schema.ts";
export { naturalDateRange, periodLabel } from "./unified-agent/dates.ts";
export {
  requestedWorkspaceName,
  salesIntent,
  selectBasicUnifiedTool,
} from "./unified-agent/basic-selector.ts";

const normalizedName = (value: string) =>
  value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("id-ID");
function workspaceMismatch(
  requested: string,
  access: UnifiedAgentAccess,
): boolean {
  if (!access.workspace) return true;
  if (requested === "Ruang pribadi" && access.workspace.kind === "personal")
    return false;
  return normalizedName(requested) !== normalizedName(access.workspace.name);
}
async function executeUnifiedAgent(
  input: UnifiedAgentRequest,
  config: VisionConfig,
  signal: AbortSignal,
  access: UnifiedAgentAccess,
  fetchImpl: typeof fetch = fetch,
  options: UnifiedAgentOptions = {},
): Promise<UnifiedAgentResponse> {
  const request = validateUnifiedAgentRequest(input);
  signal.throwIfAborted();
  const basic = !!unavailableReason(config),
    provider = {
      name: basic ? ("basic" as const) : ("gemini" as const),
      model: basic ? "basic-unified-v1" : config.model,
    };
  // Cuaca, harga pasar, atau berita tidak ada di catatan pengguna; jangan paksakan ke alat baca.
  if (outOfScopeQuestion(request.question))
    return output(request, access, provider, "help", (basic ? "Panduan dasar · " : "") + OUT_OF_SCOPE_TEXT);
  const namedWorkspace = requestedWorkspaceName(request.question);
  if (namedWorkspace && workspaceMismatch(namedWorkspace, access))
    return switchWorkspace(request, access, provider, namedWorkspace);
  if (
    /\b(?:transaksi|arsip)\b/iu.test(request.question) &&
    /\b\d{1,2}\s+(?:januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\b(?!\s+\d{4}\b)/iu.test(
      request.question,
    )
  )
    return output(
      request,
      access,
      provider,
      "clarification",
      "Sebutkan tanggal lengkap beserta tahun transaksi. Tahun dari pertanyaan sebelumnya tidak diasumsikan.",
    );
  const call = basic
    ? selectBasicUnifiedTool(request, options.now)
    : preferSalesAnalytics(
        request,
        await providerTool(request, config, signal, access, fetchImpl, options),
        options.now,
      );
  signal.throwIfAborted();
  const prefix = basic ? "Panduan dasar · " : "";
  if (call.name === "get_general_help") {
    if (
      !exactAgentObject(call.args, ["topic"]) ||
      typeof call.args.topic !== "string" ||
      !HELP_TOPICS.includes(call.args.topic as (typeof HELP_TOPICS)[number])
    )
      throw invalidTool();
    return output(
      request,
      access,
      provider,
      "help",
      prefix + HELP_TEXT[call.args.topic as (typeof HELP_TOPICS)[number]],
    );
  }
  if (call.name === "request_clarification") {
    const hasName =
      !!call.args &&
      typeof call.args === "object" &&
      Object.hasOwn(call.args, "workspaceName");
    if (
      !exactAgentObject(call.args, [
        "reason",
        ...(hasName ? ["workspaceName"] : []),
      ]) ||
      typeof call.args.reason !== "string" ||
      !["question", "date", "transaction", "inspection", "workspace"].includes(
        call.args.reason,
      ) ||
      (hasName &&
        (typeof call.args.workspaceName !== "string" ||
          !call.args.workspaceName.trim() ||
          call.args.workspaceName.length > 100))
    )
      throw invalidTool();
    if (call.args.reason === "workspace" && hasName)
      return switchWorkspace(
        request,
        access,
        provider,
        String(call.args.workspaceName),
      );
    const messages: Record<string, string> = {
      date: "Sebutkan tanggal lengkap atau rentang tanggal transaksi (WIB).",
      transaction:
        "Sebutkan referensi transaksi, nomor nota, atau pihak transaksi yang ingin dicari.",
      inspection:
        "Buka pemeriksaan yang ingin dibahas, lalu sebutkan ikan atau barisnya.",
      workspace:
        "Pilih ruang kerja yang ingin dibahas secara eksplisit sebelum meminta datanya.",
      question:
        "Apakah Anda ingin membahas pemeriksaan aktif, mencari transaksi, menghitung penjualan (misalnya “total penjualan bulan ini”, “ikan paling laku bulan ini”, “selisih berat bulan lalu”), atau melihat panduan penggunaan?",
    };
    return output(
      request,
      access,
      provider,
      "clarification",
      prefix + messages[call.args.reason],
    );
  }
  const activeTool = ACTIVE_INSPECTION_TOOLS.includes(call.name);
  const pending = call.name === "get_pending_inspection_tasks";
  if (
    pending &&
    (!exactAgentObject(call.args, ["scope"]) ||
      !["active", "archive"].includes(String(call.args.scope)) ||
      typeof call.args.scope !== "string")
  )
    throw invalidTool();
  if (
    activeTool ||
    (pending && (call.args as { scope: string }).scope === "active")
  ) {
    if (
      activeTool &&
      call.name !== "get_inspection_finding" &&
      !exactAgentObject(call.args, [])
    )
      throw invalidTool();
    const inspection = inspectionRequest(request);
    if (!inspection)
      return output(
        request,
        access,
        provider,
        "clarification",
        "Buka pemeriksaan yang ingin dibahas terlebih dahulu. Tidak ada pemeriksaan aktif yang dapat dibaca.",
      );
    if (call.name === "get_inspection_finding") {
      const targets = resolveFindingTargets(inspection);
      if (
        !exactAgentObject(call.args, ["id"]) ||
        typeof call.args.id !== "string" ||
        targets.targets.length !== 1 ||
        call.args.id !== targets.targets[0].id
      )
        throw invalidTool();
    }
    if (pending && !isInspectionFollowUp(request.question)) {
      const summary = buildInspectionFollowUp(inspection.snapshot);
      return output(
        request,
        access,
        provider,
        "inspection",
        `${prefix}${summary.confirmedPairCount} pasangan terkonfirmasi; ${summary.pendingDecisionCount} keputusan menunggu; ${summary.openDifferenceCount} selisih terbuka; ${summary.unmatchedItemCount} item tanpa pasangan; ${summary.reviewRequiredCount} perlu ditinjau ulang; ${summary.incompleteCount} data belum lengkap. Tinjau sumber dan keputusan melalui pemeriksaan aktif.`,
      );
    }
    const resolution = resolveFindingTargets(inspection);
    const tools =
      isInspectionFollowUp(request.question) || resolution.targets.length !== 1
        ? [{ name: "list_findings" as const }]
        : [
            {
              name: "read_finding" as const,
              findingId: resolution.targets[0].id,
            },
          ];
    const answer = renderInspectionAnswer(inspection, tools, provider.model);
    return {
      ...output(request, access, provider, "inspection", answer.answer),
      inspection: answer,
      clarification: answer.clarification,
    };
  }
  if (call.name === "analyze_sales")
    return analyzeSales(request, call.args, access, provider, prefix, options.now ?? new Date(), signal);
  if (
    ![
      "search_archived_transactions",
      "get_archived_transaction",
      "calculate_transaction_totals",
      "count_transactions",
    ].includes(call.name) &&
    !pending
  )
    throw invalidTool();
  if (!access.workspace)
    return output(
      request,
      access,
      provider,
      "clarification",
      "Masuk dan pilih ruang kerja untuk membaca arsip transaksi. Pemeriksaan lokal dan panduan tetap dapat digunakan.",
    );
  const requestedParty = explicitCounterparty(request.question);
  if (requestedParty.unclear)
    return output(
      request,
      access,
      provider,
      "clarification",
      "Sebutkan satu nama pihak transaksi yang jelas agar pencarian tidak diperluas ke pihak lain.",
    );
  if (call.name === "get_archived_transaction") {
    if (
      !exactAgentObject(call.args, ["reference"]) ||
      typeof call.args.reference !== "string" ||
      !/^BL-\d{8}-\d{3,20}$/iu.test(call.args.reference)
    )
      throw invalidTool();
    let record: Awaited<ReturnType<UnifiedAgentAccess["readInspection"]>>;
    try {
      record = await access.readInspection(call.args.reference.toUpperCase());
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "status" in error &&
        [403, 404].includes(Number(error.status))
      )
        return output(
          request,
          access,
          provider,
          "archive",
          "Transaksi tidak ditemukan atau belum dapat diakses pada ruang aktif.",
        );
      throw error;
    }
    signal.throwIfAborted();
    if (record.transaction.workspaceId !== access.workspace.id)
      throw new VisionError(
        "FORBIDDEN",
        403,
        "Transaksi tidak tersedia pada ruang aktif.",
      );
    const item = record.transaction,
      total =
        item.totalRupiah === null
          ? "Belum diketahui"
          : `Rp${item.totalRupiah.toLocaleString("id-ID")}`;
    if (
      requestedParty.name &&
      !normalizedName(item.counterpartyName ?? "").includes(
        normalizedName(requestedParty.name),
      )
    )
      return output(
        request,
        access,
        provider,
        "clarification",
        "Referensi transaksi dan nama pihak yang disebut tidak cocok. Periksa kembali referensi atau nama pihaknya.",
      );
    return {
      ...output(
        request,
        access,
        provider,
        "archive",
        `${prefix}${item.reference}: tanggal transaksi ${item.transactionDate ?? "belum diketahui"}, status ${item.status === "confirmed" ? "terkonfirmasi" : "draf"}, total ${total}. Buka transaksi untuk meninjau sumber, pasangan, dan revisinya.`,
      ),
      transactions: [item],
    };
  }
  const aggregate = [
    "calculate_transaction_totals",
    "count_transactions",
  ].includes(call.name);
  const query = pending
    ? { status: "draft" as const, limit: 10 }
    : boundedQuery(call.args);
  if (aggregate) query.status = aggregateStatus(request.question);
  else {
    const explicitStatus = explicitArchiveStatus(request.question);
    if (explicitStatus !== null) query.status = explicitStatus;
  }
  if (requestedParty.name) query.counterpartyName = requestedParty.name;
  if (
    call.name === "calculate_transaction_totals" &&
    (!query.fromDate || !query.toDate)
  )
    throw invalidTool();
  const result = await access.queryArchive(query);
  signal.throwIfAborted();
  if (
    result.entries.length > 50 ||
    result.entries.some((entry) => entry.workspaceId !== access.workspace!.id)
  )
    throw new VisionError(
      "FORBIDDEN",
      403,
      "Ringkasan tidak sesuai ruang aktif.",
    );
  const summary = result.summary,
    period = summary.fromDate
      ? `${summary.fromDate}${summary.toDate && summary.toDate !== summary.fromDate ? ` sampai ${summary.toDate}` : ""} (WIB)`
      : "rentang arsip yang dipilih";
  const amount =
    summary.status === "overflow"
      ? "Total melampaui batas perhitungan aman dan tidak ditampilkan sebagai angka."
      : summary.totalRupiah === null
        ? "Total belum diketahui."
        : `Total revisi terkonfirmasi yang termasuk: Rp${summary.totalRupiah.toLocaleString("id-ID")}.`;
  const answer = !summary.transactionCount
    ? `Tidak ada transaksi yang cocok pada ${period}.`
    : `${summary.transactionCount} transaksi pada ${period}: ${summary.confirmedCount} terkonfirmasi dan ${summary.draftCount} draf. ${call.name === "count_transactions" ? "" : amount} ${summary.hasMore ? "Hasil ditampilkan sebagian; gunakan filter yang lebih rinci atau halaman berikutnya." : ""}`;
  return {
    ...output(
      request,
      access,
      provider,
      aggregate ? "aggregate" : "archive",
      prefix + answer,
    ),
    transactions: result.entries,
    aggregate: summary,
    clarification: !aggregate && summary.transactionCount > 1,
  };
}
async function analyzeSales(
  request: UnifiedAgentRequest,
  args: unknown,
  access: UnifiedAgentAccess,
  provider: UnifiedAgentResponse["provider"],
  prefix: string,
  now: Date,
  signal: AbortSignal,
): Promise<UnifiedAgentResponse> {
  const allowed = ["fromDate", "toDate", "focus", "fishName", "counterpartyName", "compare"];
  if (
    !args ||
    typeof args !== "object" ||
    Array.isArray(args) ||
    Object.keys(args).some((key) => !allowed.includes(key))
  )
    throw invalidTool();
  const input = args as Record<string, unknown>;
  if (
    typeof input.focus !== "string" ||
    !SALES_FOCUS.includes(input.focus as SalesFocus) ||
    (input.compare !== undefined && typeof input.compare !== "boolean") ||
    (input.fishName !== undefined &&
      (typeof input.fishName !== "string" || !input.fishName.trim() || input.fishName.length > 80))
  )
    throw invalidTool();
  // Periode yang bisa dibaca server dari pertanyaan selalu menang atas tebakan model.
  let range: { fromDate: string; toDate: string } | null;
  try {
    range = basicDateRange(request.question, now);
  } catch {
    range = null;
  }
  const query = boundedQuery({
    fromDate: range?.fromDate ?? input.fromDate,
    toDate: range?.toDate ?? input.toDate,
  });
  if (!query.fromDate || !query.toDate) throw invalidTool();
  if (!access.workspace)
    return output(
      request,
      access,
      provider,
      "clarification",
      "Masuk dan pilih ruang kerja untuk menghitung penjualan dari arsip. Pemeriksaan lokal dan panduan tetap dapat digunakan.",
    );
  if (!access.analyzeArchive)
    return output(request, access, provider, "clarification", "Analisis arsip belum tersedia pada server ini.");
  const party = salesCounterparty(request.question);
  if (party.unclear)
    return output(
      request,
      access,
      provider,
      "clarification",
      "Sebutkan satu nama pihak transaksi yang jelas agar hitungan tidak diperluas ke pihak lain.",
    );
  const counterpartyName =
    party.name ??
    (typeof input.counterpartyName === "string" && input.counterpartyName.trim()
      ? input.counterpartyName.trim().slice(0, 160)
      : null);
  const range2 = { fromDate: query.fromDate, toDate: query.toDate, counterpartyName };
  const analytics = await access.analyzeArchive(range2);
  signal.throwIfAborted();
  const rule = salesIntent(request.question);
  const wantsCompare = input.compare === true || rule?.compare === true;
  const previous = wantsCompare
    ? await access.analyzeArchive({ ...previousPeriod(query.fromDate, query.toDate), counterpartyName })
    : null;
  signal.throwIfAborted();
  // Seperti periode, fokus yang jelas dari kata kunci pertanyaan (mis. "paling laku" →
  // per ikan, "siapa pembeli" → pihak) menang atas tebakan model. Pertanyaan umum
  // ("total penjualan bulan ini") tetap memakai fokus pilihan model. Dasar dan arah
  // peringkat ("paling murah" → harga, terendah) juga dibaca dari pertanyaan; model
  // tidak memilihnya, jadi tanpa kata kunci dipakai bawaan berat, terbanyak.
  const ruleFocus = rule?.focus;
  const focus =
    ruleFocus && ruleFocus !== "overview" ? ruleFocus : (input.focus as SalesFocus);
  const ranking = {
    metric: rule?.metric ?? "weight",
    direction: rule?.direction ?? "top",
  } as const;
  const fish = findFish(
    analytics,
    request.question,
    typeof input.fishName === "string" ? input.fishName : null,
  );
  if (typeof input.fishName === "string" && !fish && analytics.transactionCount)
    return output(
      request,
      access,
      provider,
      "clarification",
      `${prefix}Tidak ada penjualan “${input.fishName.trim()}” pada ${periodLabel(query.fromDate, query.toDate)}. Jenis yang ada: ${analytics.fish.slice(0, 8).map((item) => item.name).join(", ")}.`,
    );
  const result = await access.queryArchive({
    fromDate: query.fromDate,
    toDate: query.toDate,
    status: "confirmed",
    limit: 50,
    ...(counterpartyName ? { counterpartyName } : {}),
  });
  signal.throwIfAborted();
  if (result.entries.some((entry) => entry.workspaceId !== access.workspace!.id))
    throw new VisionError("FORBIDDEN", 403, "Ringkasan tidak sesuai ruang aktif.");
  return {
    ...output(
      request,
      access,
      provider,
      "aggregate",
      prefix + renderSales(focus, analytics, fish, previous, ranking),
    ),
    aggregate: result.summary,
  };
}
export async function runUnifiedAgent(
  input: UnifiedAgentRequest,
  config: VisionConfig,
  signal: AbortSignal,
  access: UnifiedAgentAccess,
  fetchImpl: typeof fetch = fetch,
  options: UnifiedAgentOptions = {},
): Promise<UnifiedAgentResponse> {
  const request = validateUnifiedAgentRequest(input);
  const result = await executeUnifiedAgent(
    request,
    config,
    signal,
    access,
    fetchImpl,
    options,
  );
  signal.throwIfAborted();
  try {
    return validateUnifiedAgentResponse(
      result,
      request,
      access.workspace?.id ?? null,
    );
  } catch {
    throw invalidTool();
  }
}
