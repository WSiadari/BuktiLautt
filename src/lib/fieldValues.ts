// Nilai isian pemeriksaan: format tampilan dan tiga keadaan nominal.
// Kosong berarti belum diketahui, bukan nol.
import { parseKilograms } from "./examination";
import { formatKg, formatRupiah } from "./format";
export const money = (n: number | null) => formatRupiah(n);
export const kg = (n: number | null) => formatKg(n);
export const rupiahValue = (s: string) =>
  s.trim() !== "" && /^\d+$/.test(s) && Number.isSafeInteger(Number(s))
    ? Number(s)
    : null;
export const invalidRupiahInput = (value: string) =>
  value.trim() !== "" && rupiahValue(value) === null;
// Tiga keadaan nominal yang harus dibedakan pengguna:
// kosong = belum diketahui, angka sebelum konfirmasi = isian, angka setelah konfirmasi = terkonfirmasi.
export type FeeState = "unknown" | "invalid" | "entered" | "confirmed";
export const feeState = (value: string, confirmed: boolean): FeeState =>
  !value.trim()
    ? "unknown"
    : rupiahValue(value) === null
      ? "invalid"
      : confirmed
        ? "confirmed"
        : "entered";
export const feeStateLabel = (value: string, confirmed: boolean) => {
  const state = feeState(value, confirmed);
  const amount = formatRupiah(rupiahValue(value));
  return state === "unknown"
    ? "Belum diketahui"
    : state === "invalid"
      ? "Isian tidak valid"
      : state === "confirmed"
        ? `${amount} · terkonfirmasi`
        : `${amount} · isian, belum dikonfirmasi`;
};
export const validSourceKg = (value: string) => {
  const parsed = parseKilograms(value);
  return parsed !== null && parsed > 0;
};
