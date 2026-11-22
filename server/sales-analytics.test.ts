import test from "node:test";
import assert from "node:assert/strict";
import {
  naturalDateRange,
  periodLabel,
  runUnifiedAgent,
  salesIntent,
  selectBasicUnifiedTool,
  type UnifiedAgentAccess,
} from "./unified-agent.ts";
import { readConfig } from "./config.ts";
import { queryArchive, type ArchiveRevision } from "../src/lib/archiveDomain.ts";
import { analyzeArchive, previousPeriod } from "../src/lib/archiveAnalytics.ts";
import { demoDraft, row } from "../src/data/demo.ts";
import { buildInspectionContext } from "../src/lib/inspectionContext.ts";

// 22 November 2026, 10.00 WIB (hari Minggu)
const now = new Date("2026-11-22T03:00:00Z");
const disabled = readConfig({});
const enabled = readConfig({
  VISION_ENABLED: "true",
  VISION_DATA_PROCESSING_ACKNOWLEDGED: "true",
  GEMINI_API_KEY: "MOCK_ONLY",
});
const signal = () => new AbortController().signal;
const never = (async () => assert.fail("Panduan dasar tidak memanggil Gemini")) as typeof fetch;

type Line = { fish: string; weighed: string; sold: string; price: string; unsold?: string };
let serial = 0;
function tx(
  date: string,
  party: string,
  lines: Line[],
  extra: { deduction?: string; charges?: string; status?: "confirmed" | "draft" } = {},
): ArchiveRevision {
  serial++;
  const draft = demoDraft();
  draft.demo = false;
  draft.weighing = lines.map((line) => row(line.fish, line.weighed));
  draft.receipt = lines.map((line) => row(line.fish, line.sold, line.price));
  draft.weighingConfirmed = draft.receiptConfirmed = true;
  draft.deduction = extra.deduction ?? "0";
  draft.charges = extra.charges ?? "0";
  draft.pairs = lines.map((line, index) => ({
    weighId: draft.weighing[index].id,
    receiptId: draft.receipt[index].id,
    decision: "confirmed" as const,
    adjustment: line.unsold ?? "",
    explanation: line.unsold ? "Tidak terjual (data uji)" : "",
  }));
  return {
    transactionId: `tx-${serial}`,
    reference: `BL-${date.replaceAll("-", "")}-${String(serial).padStart(6, "0")}`,
    revision: 1,
    status: extra.status ?? "confirmed",
    transactionDate: date,
    transactionDateConfirmed: true,
    workspaceId: "ws-1",
    counterpartyName: party,
    receiptNumber: `NT-${serial}`,
    createdAt: date + "T01:00:00Z",
    updatedAt: date + "T01:00:00Z",
    draft,
  };
}
function fixture(withWorkspace = true) {
  const records = [
    // Oktober: pembanding bulan lalu
    tx("2026-10-10", "Pabrik Mina Jaya", [{ fish: "Teri", weighed: "10", sold: "10", price: "20000" }]),
    // November
    tx("2026-11-03", "Pabrik Mina Jaya", [
      { fish: "Teri", weighed: "12", sold: "10", price: "25000", unsold: "2" },
      { fish: "Tongkol", weighed: "8", sold: "8", price: "30000" },
    ], { deduction: "10000" }),
    tx("2026-11-10", "Ibu Sari", [
      { fish: "Ikan Teri", weighed: "5", sold: "5", price: "26000" },
      { fish: "Kerapu", weighed: "3,5", sold: "3", price: "80000" },
    ], { charges: "5000" }),
    tx("2026-11-21", "Ibu Sari", [{ fish: "Tongkol", weighed: "4", sold: "4", price: "31000" }]),
    // Draf November tidak dijumlahkan
    tx("2026-11-20", "Pabrik Mina Jaya", [{ fish: "Teri", weighed: "50", sold: "50", price: "25000" }], { status: "draft" }),
  ];
  // Draf tidak boleh punya total; ArchiveRevision draf tetap valid.
  const access: UnifiedAgentAccess = {
    workspace: withWorkspace ? { id: "ws-1", name: "Ruang pribadi", kind: "personal" } : null,
    queryArchive: (query) => queryArchive(records, query),
    readInspection: () => assert.fail("tidak dipakai"),
    analyzeArchive: (range) => analyzeArchive(records, range),
  };
  return { records, access };
}
const ask = (question: string, access: UnifiedAgentAccess, config = disabled, fetchImpl = never) =>
  runUnifiedAgent({ requestId: "sales-" + Math.abs(question.length * 31), question }, config, signal(), access, fetchImpl, { now });

test("periode alami dibaca dalam WIB", () => {
  assert.deepEqual(naturalDateRange("total jual ikan bulan ini berapa", now), { fromDate: "2026-11-01", toDate: "2026-11-22" });
  assert.deepEqual(naturalDateRange("penjualan bulan lalu", now), { fromDate: "2026-10-01", toDate: "2026-10-31" });
  assert.deepEqual(naturalDateRange("kemarin jual berapa", now), { fromDate: "2026-11-21", toDate: "2026-11-21" });
  assert.deepEqual(naturalDateRange("minggu lalu", now), { fromDate: "2026-11-09", toDate: "2026-11-15" });
  assert.deepEqual(naturalDateRange("7 hari terakhir", now), { fromDate: "2026-11-16", toDate: "2026-11-22" });
  assert.deepEqual(naturalDateRange("tahun ini", now), { fromDate: "2026-01-01", toDate: "2026-11-22" });
  assert.deepEqual(naturalDateRange("penjualan bulan november", now), { fromDate: "2026-11-01", toDate: "2026-11-30" });
  assert.deepEqual(naturalDateRange("penjualan desember", now), { fromDate: "2025-12-01", toDate: "2025-12-31" });
  assert.deepEqual(naturalDateRange("rekap oktober 2025", now), { fromDate: "2025-10-01", toDate: "2025-10-31" });
  assert.equal(naturalDateRange("Kenapa Teri selisih 2 kg?", now), null);
  assert.equal(periodLabel("2026-11-01", "2026-11-30"), "November 2026");
  assert.equal(periodLabel("2026-11-01", "2026-11-22"), "1–22 November 2026");
  assert.deepEqual(previousPeriod("2026-11-01", "2026-11-22"), { fromDate: "2026-10-01", toDate: "2026-10-22" });
  assert.deepEqual(previousPeriod("2026-11-01", "2026-11-30"), { fromDate: "2026-10-01", toDate: "2026-10-31" });
  assert.deepEqual(previousPeriod("2026-11-16", "2026-11-22"), { fromDate: "2026-11-09", toDate: "2026-11-15" });
});

test("maksud pertanyaan penjualan dikenali tanpa mengubah alur lama", () => {
  assert.deepEqual(salesIntent("total jual ikan bulan ini berapa"), { focus: "overview", compare: false });
  assert.equal(salesIntent("ikan apa paling laku bulan ini")?.focus, "fish");
  assert.equal(salesIntent("berapa kg teri terjual bulan ini")?.focus, "fish");
  assert.equal(salesIntent("total selisih berat bulan ini")?.focus, "weight");
  assert.equal(salesIntent("siapa pembeli terbesar bulan ini")?.focus, "counterparty");
  assert.equal(salesIntent("penjualan per hari minggu ini")?.focus, "daily");
  assert.deepEqual(salesIntent("bandingkan penjualan bulan ini dengan bulan lalu"), { focus: "overview", compare: true });
  assert.equal(salesIntent("Berapa total transaksi 20 November 2026?"), null);
  // Tanpa periode, pertanyaan selisih tetap ke pemeriksaan aktif.
  const draft = demoDraft();
  const tool = selectBasicUnifiedTool({ requestId: "r", question: "Kenapa Teri selisih 2 kg?", inspection: buildInspectionContext(draft) }, now);
  assert.notEqual(tool.name, "analyze_sales");
  assert.equal(selectBasicUnifiedTool({ requestId: "r", question: "Berapa total transaksi 20 November 2026?" }, now).name, "calculate_transaction_totals");
});

test("total jual ikan bulan ini menjumlahkan semua transaksi terkonfirmasi bulan ini", async () => {
  const f = fixture();
  const answer = await ask("total jual ikan bulan ini berapa", f.access);
  // 3/11: 10×25.000 + 8×30.000 − 10.000 = 480.000
  // 10/11: 5×26.000 + 3×80.000 + 5.000 = 375.000
  // 21/11: 4×31.000 = 124.000  → total 979.000 (Oktober & draf tidak ikut)
  assert.equal(answer.kind, "aggregate");
  assert.equal(answer.aggregate?.totalRupiah, 979000);
  assert.equal(answer.aggregate?.fromDate, "2026-11-01");
  assert.equal(answer.aggregate?.toDate, "2026-11-22");
  assert.equal(answer.aggregate?.transactionCount, 3);
  assert.match(answer.answer, /Penjualan 1–22 November 2026 \(WIB\): Rp979\.000 dari 3 transaksi terkonfirmasi/);
  assert.match(answer.answer, /Berat terjual menurut nota: 30 kg \(3 jenis ikan\)/);
  assert.match(answer.answer, /1 draf pada periode ini belum dijumlahkan/);
  assert.equal(answer.transactions.length, 0);
});

test("per ikan, satu ikan, selisih, pembeli, harian, dan perbandingan", async () => {
  const f = fixture();
  const fish = await ask("ikan apa paling laku bulan ini", f.access);
  // "Teri" dan "Ikan Teri" digabung sebagai satu jenis; urut menurut berat.
  assert.match(fish.answer, /1\. Teri — 15 kg · Rp380\.000 · rata-rata Rp25\.333\/kg\n2\. Tongkol — 12 kg · Rp364\.000 · rata-rata Rp30\.333\/kg\n3\. Kerapu — 3 kg/);
  assert.match(fish.answer, /Paling banyak terjual: Teri \(15 kg\)/);

  const teri = await ask("berapa kg teri terjual bulan ini", f.access);
  assert.match(teri.answer, /^Panduan dasar · Teri terjual 15 kg pada 1–22 November 2026 \(WIB\) dari 2 transaksi\./);

  const weight = await ask("total selisih berat bulan ini", f.access);
  assert.match(weight.answer, /Berat catatan timbang 32,5 kg · berat di nota 30 kg/);
  assert.match(weight.answer, /Selisih awal 2,5 kg · dicatat tidak terjual 2 kg/);
  assert.match(weight.answer, /Masih terbuka 0,5 kg pada 1 pasangan/);

  const buyers = await ask("siapa pembeli terbesar bulan ini", f.access);
  assert.match(buyers.answer, /1\. Ibu Sari — Rp499\.000 · 2 transaksi\n2\. Pabrik Mina Jaya — Rp480\.000 · 1 transaksi/);

  const daily = await ask("penjualan per hari bulan ini", f.access);
  assert.match(daily.answer, /Hari tertinggi: 3 November 2026 \(Rp480\.000\)/);

  const compare = await ask("bandingkan penjualan bulan ini dengan bulan lalu", f.access);
  assert.match(compare.answer, /Dibanding 1–22 Oktober 2026 \(Rp200\.000, 1 transaksi\): naik Rp779\.000 \(389,5%\)/);

  const party = await ask("total penjualan dengan Ibu Sari bulan ini", f.access);
  assert.equal(party.aggregate?.totalRupiah, 499000);
});

test("Gemini hanya memilih alat; periode dari pertanyaan dan angka tetap dari server", async () => {
  const f = fixture();
  const model = (async () =>
    Response.json({
      candidates: [{
        finishReason: "STOP",
        content: { parts: [{ functionCall: { name: "analyze_sales", args: { fromDate: "2026-01-01", toDate: "2026-01-31", focus: "overview" } } }] },
      }],
    })) as typeof fetch;
  const answer = await ask("total jual ikan bulan ini berapa", f.access, enabled, model);
  assert.equal(answer.provider.name, "gemini");
  assert.equal(answer.aggregate?.fromDate, "2026-11-01");
  assert.equal(answer.aggregate?.totalRupiah, 979000);
  const bad = (async () =>
    Response.json({
      candidates: [{
        finishReason: "STOP",
        content: { parts: [{ functionCall: { name: "analyze_sales", args: { fromDate: "2026-11-01", toDate: "2026-11-22", focus: "semua", totalRupiah: 1 } } }] },
      }],
    })) as typeof fetch;
  await assert.rejects(ask("total jual ikan bulan ini berapa", f.access, enabled, bad));
});

test("pertanyaan penjualan berperiode tetap dihitung dari arsip walau Gemini memilih pemeriksaan aktif", async () => {
  const f = fixture();
  const pick = (name: string, args: Record<string, unknown> = {}) =>
    (async () =>
      Response.json({
        candidates: [{ finishReason: "STOP", content: { parts: [{ functionCall: { name, args } }] } }],
      })) as typeof fetch;
  const inspection = buildInspectionContext(demoDraft());
  const askWithInspection = (question: string, fetchImpl: typeof fetch) =>
    runUnifiedAgent({ requestId: "sales-inspection", question, inspection }, enabled, signal(), f.access, fetchImpl, { now });

  // Kasus revisi 1: sebelumnya dijawab "Ikan atau baris mana yang ingin Anda periksa?".
  for (const tool of ["get_active_inspection", "list_inspection_findings"]) {
    const answer = await askWithInspection("Ikan apa paling laku bulan ini?", pick(tool));
    assert.equal(answer.kind, "aggregate");
    assert.equal(answer.provider.name, "gemini");
    assert.match(answer.answer, /Paling banyak terjual: Teri \(15 kg\)/);
  }

  // Kasus revisi 3: Gemini memilih analyze_sales tetapi fokus "overview", sehingga jawabannya
  // ringkasan total, bukan peringkat ikan. Fokus dari kata kunci pertanyaan yang dipakai.
  const overview = await askWithInspection(
    "Ikan apa paling laku bulan ini",
    pick("analyze_sales", { fromDate: "2026-11-01", toDate: "2026-11-22", focus: "overview" }),
  );
  assert.match(overview.answer, /^Penjualan per jenis ikan, 1–22 November 2026 \(WIB\):\n1\. Teri — 15 kg/);
  assert.match(overview.answer, /Paling banyak terjual: Teri \(15 kg\)/);
  // Pertanyaan umum tetap memakai fokus pilihan model.
  const total = await askWithInspection(
    "total penjualan bulan ini",
    pick("analyze_sales", { fromDate: "2026-11-01", toDate: "2026-11-22", focus: "overview" }),
  );
  assert.match(total.answer, /^Penjualan 1–22 November 2026 \(WIB\): Rp979\.000/);

  // Tanpa periode, pertanyaan tentang ikan di pemeriksaan tetap ke pemeriksaan aktif.
  const active = await askWithInspection("Kenapa Teri selisih?", pick("list_inspection_findings"));
  assert.equal(active.kind, "inspection");
});

test("tanpa akun, analitik arsip meminta masuk", async () => {
  const f = fixture(false);
  const answer = await ask("total jual ikan bulan ini berapa", f.access);
  assert.equal(answer.kind, "clarification");
  assert.match(answer.answer, /Masuk dan pilih ruang kerja/);
});
