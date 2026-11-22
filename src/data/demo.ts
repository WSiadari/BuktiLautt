import type { Row, Source, Draft } from "../types";
export const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const blankSource = (): Source => ({
  text: "",
  filename: "",
  capturedAt: now(),
});
export const row = (name = "", kg = "", price = ""): Row => ({
  id: uid(),
  name,
  kg,
  price,
  provenance: "Diisi pengguna",
});
export const emptyDraft = (): Draft => ({
  version: 1,
  id: `BL-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
  demo: false,
  revision: 1,
  weighing: [row()],
  receipt: [row()],
  sources: { weighing: blankSource(), receipt: blankSource() },
  weighingConfirmed: false,
  receiptConfirmed: false,
  pairs: [],
  unmatchedReceipts: [],
  deduction: "",
  charges: "",
  savedAt: "",
});
export function demoDraft(): Draft {
  const d = emptyDraft();
  return {
    ...d,
    id: "BL-006",
    demo: true,
    weighing: [row("Teri", "12"), row("Tongkol", "8")].map((r) => ({
      ...r,
      provenance: "Usulan AI simulasi",
    })),
    receipt: [row("Teri", "", "25000"), row("Tongkol", "8", "30000")].map(
      (r) => ({ ...r, provenance: "Usulan AI simulasi" }),
    ),
    sources: {
      weighing: {
        text: "CATATAN TIMBANG\n6 November 2026\nTeri  12 kg\nTongkol  8 kg\nTotal  20 kg",
        filename: "catatan-timbang-contoh.txt",
        capturedAt: now(),
      },
      receipt: {
        text: "NOTA PENJUALAN · BL-006\n6 November 2026\nTeri  10 kg × Rp25.000 = Rp250.000\nTongkol  8 kg × Rp30.000 = Rp240.000\nTotal  Rp490.000\nPotongan Rp0 · Tidak ada biaya tambahan",
        filename: "nota-contoh.txt",
        capturedAt: now(),
      },
    },
    deduction: "0",
    charges: "0",
  };
}
