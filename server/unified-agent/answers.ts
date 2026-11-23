// Penyusun jawaban: teks Ombak Pintar dirangkai dari nilai yang sudah dihitung server.
import type {
  UnifiedAgentRequest,
  UnifiedAgentResponse,
} from "../../src/agent/unified.ts";
import {
  fishKey,
  type ArchiveAnalytics,
} from "../../src/lib/archiveAnalytics.ts";
import { dayLabel, periodLabel } from "./dates.ts";
import type { SalesFocus, SalesRanking } from "./tool-schema.ts";
import type { UnifiedAgentAccess } from "./types.ts";

export function output(
  request: UnifiedAgentRequest,
  access: UnifiedAgentAccess,
  provider: UnifiedAgentResponse["provider"],
  kind: UnifiedAgentResponse["kind"],
  answer: string,
): UnifiedAgentResponse {
  return {
    requestId: request.requestId,
    kind,
    answer,
    workspaceId: access.workspace?.id ?? null,
    workspaceName: access.workspace?.name ?? null,
    inspection: null,
    transactions: [],
    aggregate: null,
    clarification: kind === "clarification" || kind === "switch_workspace",
    provider,
  };
}
export function switchWorkspace(
  request: UnifiedAgentRequest,
  access: UnifiedAgentAccess,
  provider: UnifiedAgentResponse["provider"],
  name: string,
) {
  return output(
    request,
    access,
    provider,
    "switch_workspace",
    `Pertanyaan menyebut ruang kerja “${name}”. ${access.workspace ? `Ruang aktif saat ini “${access.workspace.name}”.` : "Anda belum masuk ke ruang kerja akun."} Pilih ruang kerja tersebut secara eksplisit sebelum meminta data. Data ruang lain tidak digabungkan.`,
  );
}
// ---------- analyze_sales: analitik arsip, semua angka dari server ----------
const kgText = (grams: number) =>
  `${(grams / 1000).toLocaleString("id-ID", { maximumFractionDigits: 3 })} kg`;
const rpText = (value: number | null) =>
  value === null ? "belum diketahui" : `Rp${value.toLocaleString("id-ID")}`;
export function findFish(
  analytics: ArchiveAnalytics,
  question: string,
  requested: string | null,
) {
  const q = ` ${question.toLocaleLowerCase("id-ID").replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  if (requested) {
    const key = fishKey(requested);
    return analytics.fish.find((item) => item.key === key) ?? null;
  }
  return (
    [...analytics.fish]
      .sort((a, b) => b.key.length - a.key.length)
      .find((item) => q.includes(` ${item.key} `)) ?? null
  );
}
function changeText(current: number | null, previous: number | null, unit: "rp" | "kg") {
  if (current === null || previous === null) return "perbandingan belum dapat dihitung";
  const format = (value: number) => (unit === "rp" ? rpText(value) : kgText(value));
  if (previous === 0)
    return current === 0 ? "sama-sama nol" : `naik dari ${format(0)}`;
  const diff = current - previous;
  const pct = Math.round((Math.abs(diff) / previous) * 1000) / 10;
  if (diff === 0) return "sama";
  return `${diff > 0 ? "naik" : "turun"} ${format(Math.abs(diff))} (${pct.toLocaleString("id-ID")}%)`;
}
type FishSales = ArchiveAnalytics["fish"][number];
const nameList = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(", ")} dan ${names.at(-1)}` : names.join("");
const RANKING_METRIC: Record<
  SalesRanking["metric"],
  { noun: string; top: string; bottom: string; value: (item: FishSales) => number | null; format: (value: number) => string }
> = {
  weight: { noun: "Berat terjual", top: "Paling banyak", bottom: "Paling sedikit", value: (item) => item.soldGrams, format: kgText },
  price: { noun: "Harga rata-rata", top: "Harga rata-rata tertinggi", bottom: "Harga rata-rata terendah", value: (item) => item.averagePricePerKg, format: (value) => `${rpText(value)}/kg` },
  revenue: { noun: "Nilai baris nota", top: "Penghasil terbesar", bottom: "Penghasil terkecil", value: (item) => item.grossRupiah, format: rpText },
};
/**
 * Kalimat penutup peringkat per ikan. Daftar tetap urut menurut berat; kalimat ini
 * menyebut dasar pengurutan dan hanya memeringkat ikan yang nilainya lengkap.
 */
export function fishRankingText(items: FishSales[], ranking: SalesRanking): string {
  const metric = RANKING_METRIC[ranking.metric];
  if (items.length === 1) {
    const value = metric.value(items[0]);
    return `Hanya ada satu jenis ikan pada periode ini, jadi belum ada pembanding. ${metric.noun} ${items[0].name}${value === null ? " belum diketahui karena ada harga yang belum lengkap" : `: ${metric.format(value)}`}.`;
  }
  const basis = "Diurutkan menurut berat terjual.";
  const known = items.filter((item) => metric.value(item) !== null);
  const unknown = nameList(items.filter((item) => metric.value(item) === null).map((item) => item.name));
  if (!known.length)
    return `${basis} ${metric.noun} belum bisa dibandingkan karena setiap jenis ikan masih punya harga yang belum diketahui.`;
  if (known.length === 1)
    return `${basis} ${metric.noun} baru lengkap untuk ${known[0].name} (${metric.format(metric.value(known[0])!)}); ${unknown} masih punya harga yang belum diketahui, jadi belum bisa dibandingkan.`;
  const values = known.map((item) => metric.value(item)!);
  const target = ranking.direction === "bottom" ? Math.min(...values) : Math.max(...values);
  const winners = known.filter((item) => metric.value(item) === target);
  return (
    `${basis} ${metric[ranking.direction]}: ${nameList(winners.map((item) => item.name))} (${winners.length > 1 ? "masing-masing " : ""}${metric.format(target)}).` +
    (unknown ? ` ${unknown} belum ikut dibandingkan karena ada harga yang belum diketahui.` : "")
  );
}
export function renderSales(
  focus: SalesFocus,
  a: ArchiveAnalytics,
  fish: FishSales | null,
  previous: ArchiveAnalytics | null,
  ranking: SalesRanking = { metric: "weight", direction: "top" },
): string {
  const period = `${periodLabel(a.fromDate, a.toDate)} (WIB)`;
  const drafts = a.draftCount
    ? `\n${a.draftCount} draf pada periode ini belum dijumlahkan.`
    : "";
  if (!a.transactionCount)
    return `Belum ada transaksi terkonfirmasi pada ${period}.${drafts}`;
  const lines: string[] = [];
  if (fish) {
    lines.push(
      `${fish.name} terjual ${kgText(fish.soldGrams)} pada ${period} dari ${fish.transactionCount} transaksi.`,
      `• Nilai baris nota: ${rpText(fish.grossRupiah)}${fish.averagePricePerKg !== null ? ` · rata-rata ${rpText(fish.averagePricePerKg)}/kg` : ""}`,
    );
    const rank = a.fish.indexOf(fish) + 1;
    if (a.fish.length > 1)
      lines.push(`• Peringkat ${rank} dari ${a.fish.length} jenis ikan menurut berat.`);
    if (previous) {
      const before = previous.fish.find((item) => item.key === fish.key);
      lines.push(
        `• Dibanding ${periodLabel(previous.fromDate, previous.toDate)}: ${changeText(fish.soldGrams, before?.soldGrams ?? 0, "kg")}.`,
      );
    }
    lines.push("Nilai per ikan memakai subtotal baris nota, sebelum potongan dan biaya.");
    return lines.join("\n") + drafts;
  }
  if (focus === "fish") {
    lines.push(`Penjualan per jenis ikan, ${period}:`);
    a.fish.slice(0, 10).forEach((item, index) =>
      lines.push(
        `${index + 1}. ${item.name} — ${kgText(item.soldGrams)} · ${rpText(item.grossRupiah)}${item.averagePricePerKg !== null ? ` · rata-rata ${rpText(item.averagePricePerKg)}/kg` : ""}`,
      ),
    );
    if (a.fish.length > 10) lines.push(`…dan ${a.fish.length - 10} jenis lainnya.`);
    if (a.fish.length) lines.push(fishRankingText(a.fish, ranking));
    lines.push("Nilai per ikan memakai subtotal baris nota, sebelum potongan dan biaya.");
  } else if (focus === "weight") {
    const w = a.weight;
    lines.push(
      `Selisih berat ${period}, dari ${a.transactionCount} transaksi terkonfirmasi:`,
      `• Berat catatan timbang ${kgText(w.weighedGrams)} · berat di nota ${kgText(w.soldGrams)}`,
      `• Selisih awal ${kgText(w.initialDifferenceGrams)} · dicatat tidak terjual ${kgText(w.unsoldGrams)}`,
      w.openPairCount
        ? `• Masih terbuka ${kgText(w.openGrams)} pada ${w.openPairCount} pasangan — periksa di transaksi terkait.`
        : "• Tidak ada selisih berat yang masih terbuka.",
    );
    if (w.receiptMorePairCount)
      lines.push(`• ${w.receiptMorePairCount} pasangan berat notanya lebih besar daripada timbangan.`);
    if (w.unmatchedWeighingCount)
      lines.push(`• ${w.unmatchedWeighingCount} baris timbang dicatat tanpa pasangan nota.`);
  } else if (focus === "counterparty") {
    lines.push(`Pihak transaksi ${period}, dari nilai terbesar:`);
    a.counterparties.slice(0, 10).forEach((item, index) =>
      lines.push(`${index + 1}. ${item.name} — ${rpText(item.totalRupiah)} · ${item.transactionCount} transaksi`),
    );
    if (a.counterparties.length > 10) lines.push(`…dan ${a.counterparties.length - 10} pihak lainnya.`);
  } else if (focus === "daily") {
    lines.push(`Penjualan per hari, ${period}:`);
    a.days.slice(-14).forEach((item) =>
      lines.push(`• ${dayLabel(item.date)} — ${rpText(item.totalRupiah)} · ${item.transactionCount} transaksi`),
    );
    if (a.days.length > 14) lines.push(`(14 hari terakhir yang ada transaksinya ditampilkan.)`);
    // Arah ikut pertanyaan ("hari apa paling sepi"); hari tanpa transaksi tidak ada di daftar.
    const lowest = ranking.direction === "bottom";
    const pick = [...a.days]
      .filter((item) => item.totalRupiah !== null)
      .sort((x, y) => (lowest ? x.totalRupiah! - y.totalRupiah! : y.totalRupiah! - x.totalRupiah!))[0];
    if (pick && a.days.length > 1)
      lines.push(
        lowest
          ? `Hari terendah di antara hari yang ada transaksinya: ${dayLabel(pick.date)} (${rpText(pick.totalRupiah)}).`
          : `Hari tertinggi: ${dayLabel(pick.date)} (${rpText(pick.totalRupiah)}).`,
      );
  } else {
    lines.push(
      `Penjualan ${period}: ${rpText(a.totalRupiah)} dari ${a.transactionCount} transaksi terkonfirmasi.`,
      `• Berat terjual menurut nota: ${kgText(a.weight.soldGrams)} (${a.fish.length} jenis ikan)`,
    );
    if (a.fish[0])
      lines.push(`• Paling banyak: ${a.fish[0].name} ${kgText(a.fish[0].soldGrams)} · ${rpText(a.fish[0].grossRupiah)}`);
    if (a.deductionRupiah || a.chargesRupiah)
      lines.push(`• Sebelum potongan ${rpText(a.deductionRupiah)} dan biaya ${rpText(a.chargesRupiah)}: ${rpText(a.grossRupiah)}`);
    if (a.weight.openPairCount)
      lines.push(`• Masih ada selisih berat terbuka ${kgText(a.weight.openGrams)} pada ${a.weight.openPairCount} pasangan.`);
  }
  if (a.unknownTotalCount)
    lines.push(`${a.unknownTotalCount} transaksi belum punya total yang lengkap, jadi total Rupiah belum pasti.`);
  if (previous && !previous.transactionCount)
    lines.push(
      `Pada ${periodLabel(previous.fromDate, previous.toDate)} belum ada transaksi terkonfirmasi, jadi belum ada pembanding.`,
    );
  else if (previous) {
    const label = periodLabel(previous.fromDate, previous.toDate);
    lines.push(
      focus === "weight"
        ? `Dibanding ${label}: selisih awal ${changeText(a.weight.initialDifferenceGrams, previous.weight.initialDifferenceGrams, "kg")}.`
        : `Dibanding ${label} (${rpText(previous.totalRupiah)}, ${previous.transactionCount} transaksi): ${changeText(a.totalRupiah, previous.totalRupiah, "rp")}.`,
    );
  }
  return lines.join("\n") + drafts;
}
