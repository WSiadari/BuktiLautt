// Analitik arsip untuk Ombak Pintar: semua angka dihitung dari revisi
// terkonfirmasi terbaru (sama seperti total arsip), tidak pernah dari model.
import {
  archiveDateKey,
  archiveRevisionTotal,
  validateArchiveRevision,
  type ArchiveRevision,
} from "./archiveDomain.ts";
import {
  calculatePair,
  calculateReceiptTotals,
  parseKilograms,
} from "./examination.ts";
import { normalizeFishName } from "./matching.ts";

export type FishSales = {
  key: string;
  name: string;
  /** Berat terjual menurut nota, dalam gram (bilangan bulat). */
  soldGrams: number;
  /** Jumlah subtotal baris nota (berat × harga) sebelum potongan/biaya. */
  grossRupiah: number | null;
  transactionCount: number;
  /** Rata-rata tertimbang harga per kg; null bila ada harga yang belum diketahui. */
  averagePricePerKg: number | null;
};
export type CounterpartySales = {
  name: string;
  transactionCount: number;
  totalRupiah: number | null;
};
export type DailySales = {
  date: string;
  transactionCount: number;
  totalRupiah: number | null;
};
export type ArchiveAnalytics = {
  timezone: "Asia/Jakarta";
  fromDate: string;
  toDate: string;
  transactionCount: number;
  draftCount: number;
  /** Total akhir nota (setelah potongan dan biaya). */
  totalRupiah: number | null;
  unknownTotalCount: number;
  grossRupiah: number | null;
  deductionRupiah: number;
  chargesRupiah: number;
  fish: FishSales[];
  weight: {
    weighedGrams: number;
    soldGrams: number;
    /** Selisih awal (timbang − nota) pada pasangan terkonfirmasi yang positif. */
    initialDifferenceGrams: number;
    unsoldGrams: number;
    openGrams: number;
    openPairCount: number;
    receiptMorePairCount: number;
    unmatchedWeighingCount: number;
  };
  counterparties: CounterpartySales[];
  days: DailySales[];
};

const grams = (value: string | null | undefined): number | null => {
  const kg = parseKilograms(value ?? null);
  return kg === null || kg <= 0 ? null : Math.round(kg * 1000);
};
const rupiah = (value: string): number | null =>
  /^\d+$/u.test(value.trim()) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : null;
const titleCase = (value: string) =>
  value.replace(/(^|[ -])(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toLocaleUpperCase("id-ID"));
const searchKey = (value: string) =>
  value.normalize("NFKC").trim().toLocaleLowerCase("id-ID").replace(/\s+/gu, " ");
const safeSum = (values: (number | null)[]): number | null => {
  if (values.some((value) => value === null)) return null;
  const sum = values.reduce<bigint>((total, value) => total + BigInt(value!), 0n);
  return sum <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(sum) : null;
};

export function fishKey(name: string): string {
  return normalizeFishName(name) ?? searchKey(name);
}

export function analyzeArchive(
  records: ArchiveRevision[],
  input: { fromDate: string; toDate: string; counterpartyName?: string | null },
): ArchiveAnalytics {
  const { fromDate, toDate } = input;
  if (!archiveDateKey(fromDate) || !archiveDateKey(toDate) || fromDate > toDate)
    throw new Error("INVALID_ARCHIVE_QUERY");
  const party = input.counterpartyName ? searchKey(input.counterpartyName) : null;
  const latest = new Map<string, ArchiveRevision>();
  const confirmed = new Map<string, ArchiveRevision>();
  for (const record of records) {
    if (!validateArchiveRevision(record)) throw new Error("INVALID_ARCHIVE_REVISION");
    const previous = latest.get(record.transactionId);
    if (!previous || previous.revision < record.revision) latest.set(record.transactionId, record);
    if (record.status !== "confirmed") continue;
    const best = confirmed.get(record.transactionId);
    if (!best || best.revision < record.revision) confirmed.set(record.transactionId, record);
  }
  const inRange = (record: ArchiveRevision) =>
    !!record.transactionDate &&
    record.transactionDate >= fromDate &&
    record.transactionDate <= toDate &&
    (!party || searchKey(record.counterpartyName ?? "").includes(party));
  const selected = [...confirmed.values()].filter(inRange);
  const draftCount = [...latest.values()].filter(
    (record) => record.status === "draft" && inRange(record),
  ).length;

  const fish = new Map<string, FishSales & { priced: number; pricedRupiah: number; unpriced: boolean }>();
  const counterparties = new Map<string, { name: string; totals: (number | null)[] }>();
  const days = new Map<string, (number | null)[]>();
  const totals: (number | null)[] = [];
  const gross: (number | null)[] = [];
  let deductionRupiah = 0, chargesRupiah = 0;
  const weight = {
    weighedGrams: 0, soldGrams: 0, initialDifferenceGrams: 0, unsoldGrams: 0,
    openGrams: 0, openPairCount: 0, receiptMorePairCount: 0, unmatchedWeighingCount: 0,
  };

  for (const record of selected) {
    const draft = record.draft;
    const total = archiveRevisionTotal(record);
    totals.push(total);
    const receiptTotals = calculateReceiptTotals(
      draft.receipt.map((row) => ({ receiptKg: parseKilograms(row.kg), pricePerKg: rupiah(row.price) })),
      rupiah(draft.deduction) ?? 0,
      rupiah(draft.charges) ?? 0,
    );
    gross.push(receiptTotals.subtotalRupiah);
    deductionRupiah += rupiah(draft.deduction) ?? 0;
    chargesRupiah += rupiah(draft.charges) ?? 0;
    const seenFish = new Set<string>();
    draft.receipt.forEach((row, index) => {
      const sold = grams(row.kg);
      if (sold === null) return;
      const key = fishKey(row.name);
      const entry = fish.get(key) ?? {
        key, name: titleCase(normalizeFishName(row.name) ?? row.name.trim()),
        soldGrams: 0, grossRupiah: 0, transactionCount: 0, averagePricePerKg: null,
        priced: 0, pricedRupiah: 0, unpriced: false,
      };
      entry.soldGrams += sold;
      const line = receiptTotals.lineTotalsRupiah[index];
      if (line === null || line === undefined) entry.unpriced = true;
      else {
        entry.priced += sold;
        entry.pricedRupiah += line;
      }
      if (!seenFish.has(key)) entry.transactionCount++;
      seenFish.add(key);
      fish.set(key, entry);
      weight.soldGrams += sold;
    });
    for (const row of draft.weighing) weight.weighedGrams += grams(row.kg) ?? 0;
    for (const pair of draft.pairs) {
      if (pair.decision === "unmatched") {
        weight.unmatchedWeighingCount++;
        continue;
      }
      if (pair.decision !== "confirmed") continue;
      const weighed = draft.weighing.find((row) => row.id === pair.weighId);
      const receipt = draft.receipt.find((row) => row.id === pair.receiptId);
      const result = calculatePair({
        weighedName: weighed?.name ?? null, receiptName: receipt?.name ?? null,
        weighedKg: parseKilograms(weighed?.kg ?? null), receiptKg: parseKilograms(receipt?.kg ?? null),
        confirmed: true, savedAdjustmentKg: pair.adjustment ? parseKilograms(pair.adjustment) : null,
      });
      if (result.status !== "ready") continue;
      if (result.direction === "receipt-more") weight.receiptMorePairCount++;
      const initial = Math.round((result.initialKg ?? 0) * 1000);
      if (initial > 0) weight.initialDifferenceGrams += initial;
      weight.unsoldGrams += Math.round((result.adjustmentKg ?? 0) * 1000);
      const open = Math.round((result.remainingKg ?? 0) * 1000);
      if (open !== 0) {
        weight.openPairCount++;
        weight.openGrams += Math.abs(open);
      }
    }
    const partyName = record.counterpartyName?.trim() || "Pihak belum diisi";
    const partyEntry = counterparties.get(searchKey(partyName)) ?? { name: partyName, totals: [] };
    partyEntry.totals.push(total);
    counterparties.set(searchKey(partyName), partyEntry);
    days.set(record.transactionDate!, [...(days.get(record.transactionDate!) ?? []), total]);
  }

  const totalRupiah = selected.length ? safeSum(totals) : 0;
  return {
    timezone: "Asia/Jakarta", fromDate, toDate,
    transactionCount: selected.length, draftCount,
    totalRupiah: selected.length ? totalRupiah : 0,
    unknownTotalCount: totals.filter((value) => value === null).length,
    grossRupiah: selected.length ? safeSum(gross) : 0,
    deductionRupiah, chargesRupiah,
    fish: [...fish.values()]
      .map(({ priced, pricedRupiah, unpriced, ...entry }) => ({
        ...entry,
        grossRupiah: unpriced ? null : pricedRupiah,
        averagePricePerKg: !unpriced && priced > 0 ? Math.round((pricedRupiah * 1000) / priced) : null,
      }))
      .sort((a, b) => b.soldGrams - a.soldGrams || a.name.localeCompare(b.name, "id-ID")),
    weight,
    counterparties: [...counterparties.values()]
      .map(({ name, totals: values }) => ({ name, transactionCount: values.length, totalRupiah: safeSum(values) }))
      .sort((a, b) => (b.totalRupiah ?? -1) - (a.totalRupiah ?? -1) || b.transactionCount - a.transactionCount),
    days: [...days.entries()]
      .map(([date, values]) => ({ date, transactionCount: values.length, totalRupiah: safeSum(values) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** Rentang periode sebelumnya dengan panjang sama; bulan kalender penuh → bulan sebelumnya penuh. */
export function previousPeriod(fromDate: string, toDate: string): { fromDate: string; toDate: string } {
  const from = new Date(fromDate + "T00:00:00Z"), to = new Date(toDate + "T00:00:00Z");
  const lastOfMonth = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 0));
  if (from.getUTCDate() === 1 && from.getUTCFullYear() === to.getUTCFullYear() && from.getUTCMonth() === to.getUTCMonth()) {
    const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 0));
    // "bulan ini" yang belum selesai dibandingkan dengan tanggal yang sama bulan lalu.
    if (to.getTime() !== lastOfMonth.getTime()) end.setUTCDate(Math.min(end.getUTCDate(), to.getUTCDate()));
    return { fromDate: start.toISOString().slice(0, 10), toDate: end.toISOString().slice(0, 10) };
  }
  const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  const end = new Date(from); end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - days + 1);
  return { fromDate: start.toISOString().slice(0, 10), toDate: end.toISOString().slice(0, 10) };
}
