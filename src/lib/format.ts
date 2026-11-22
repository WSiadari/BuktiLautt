// Satu format Rupiah untuk seluruh antarmuka: "Rp2.206.300" (tanpa spasi).
// null berarti nilainya belum diketahui; null tidak pernah ditampilkan sebagai Rp0.
const grouping = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

export function formatRupiah(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "Belum diketahui";
  const formatted = "Rp" + grouping.format(Math.abs(value));
  return value < 0 ? "-" + formatted : formatted;
}

const kgFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });
export function formatKg(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "Belum diketahui";
  return kgFormat.format(value) + " kg";
}
