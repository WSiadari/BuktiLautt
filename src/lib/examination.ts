import { normalizeFishName } from "./matching.ts";

export type PairInput = {
  weighedName: string | null;
  receiptName: string | null;
  weighedKg: number | null;
  receiptKg: number | null;
  confirmed: boolean;
  savedAdjustmentKg: number | null;
};

export type PairResult = {
  status: "ready" | "unconfirmed" | "unknown" | "invalid";
  initialKg: number | null;
  adjustmentKg: number | null;
  remainingKg: number | null;
  direction: "weighed-more" | "receipt-more" | "equal" | null;
  error: string | null;
};

export type ReceiptLine = {
  receiptKg: number | null;
  pricePerKg: number | null;
};

export type ReceiptTotals = {
  status: "ready" | "unknown" | "invalid";
  lineTotalsRupiah: (number | null)[];
  subtotalRupiah: number | null;
  totalRupiah: number | null;
  error: string | null;
};

function parseGrams(value: string | number | null): number | null {
  if (value === null) return null;
  const text = String(value).trim();
  if (text.length > 24 || !/^\d+(?:[.,]\d{1,3})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.replace(",", ".").split(".");
  const grams = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
  if (grams > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const kilograms = Number(grams) / 1000;
  // Keep the numeric UI boundary lossless at the supported gram precision.
  if (BigInt(Math.round(kilograms * 1000)) !== grams) return null;
  return Number(grams);
}

export function parseKilograms(value: string | number | null): number | null {
  const grams = parseGrams(value);
  return grams === null ? null : grams / 1000;
}

export function calculatePair(input: PairInput): PairResult {
  const result: PairResult = {
    status: "unconfirmed",
    initialKg: null,
    adjustmentKg: null,
    remainingKg: null,
    direction: null,
    error: null,
  };
  if (!input.confirmed) return result;
  const weighedName = normalizeFishName(input.weighedName);
  const receiptName = normalizeFishName(input.receiptName);
  if (!weighedName || weighedName !== receiptName) {
    return {
      ...result,
      status: "invalid",
      error:
        "Jenis ikan belum jelas atau berbeda. Tinjau dan konfirmasikan pasangan dengan jenis yang sama.",
    };
  }
  if (input.weighedKg === null || input.receiptKg === null) {
    return {
      ...result,
      status: "unknown",
      error: "Berat sumber belum diketahui.",
    };
  }
  const weighedGrams = parseGrams(input.weighedKg);
  const receiptGrams = parseGrams(input.receiptKg);
  const adjustmentGrams = parseGrams(input.savedAdjustmentKg ?? 0);
  if (
    weighedGrams === null ||
    receiptGrams === null ||
    weighedGrams === 0 ||
    receiptGrams === 0
  ) {
    return {
      ...result,
      status: "invalid",
      error: "Berat sumber harus positif, paling banyak tiga angka desimal kg.",
    };
  }
  const initialGrams = weighedGrams - receiptGrams;
  if (
    adjustmentGrams === null ||
    (adjustmentGrams > 0 && adjustmentGrams > initialGrams)
  ) {
    return {
      ...result,
      status: "invalid",
      error:
        "Penyesuaian tidak terjual harus berada dalam sisa selisih positif.",
    };
  }
  return {
    status: "ready",
    initialKg: initialGrams / 1000,
    adjustmentKg: adjustmentGrams / 1000,
    remainingKg: (initialGrams - adjustmentGrams) / 1000,
    direction:
      initialGrams > 0
        ? "weighed-more"
        : initialGrams < 0
          ? "receipt-more"
          : "equal",
    error: null,
  };
}

export function calculateAdjustmentPreview(
  input: PairInput,
  proposedKg: number | null,
): PairResult {
  if (!input.confirmed) return calculatePair(input);
  if (proposedKg === null || proposedKg <= 0) {
    return {
      ...calculatePair(input),
      status: "invalid",
      remainingKg: null,
      error: "Isi penyesuaian lebih dari 0 kg.",
    };
  }
  return calculatePair({ ...input, savedAdjustmentKg: proposedKg });
}

function validRupiah(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= 0;
}

export function calculateReceiptTotals(
  lines: ReceiptLine[],
  deductionRupiah: number | null = 0,
  chargesRupiah: number | null = 0,
): ReceiptTotals {
  let invalid = false;
  const lineTotalsRupiah = lines.map(({ receiptKg, pricePerKg }) => {
    const grams = parseGrams(receiptKg);
    if (receiptKg !== null && (grams === null || grams === 0)) invalid = true;
    if (pricePerKg !== null && !validRupiah(pricePerKg)) invalid = true;
    if (grams === null || grams === 0 || !validRupiah(pricePerKg)) return null;
    // Round each line to whole Rupiah, half up, using integer arithmetic.
    const rounded = (BigInt(grams) * BigInt(pricePerKg) + 500n) / 1000n;
    if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
      invalid = true;
      return null;
    }
    return Number(rounded);
  });
  const sum =
    !lines.length || lineTotalsRupiah.includes(null)
      ? null
      : lineTotalsRupiah.reduce<bigint>(
          (subtotal, line) => subtotal + BigInt(line!),
          0n,
        );
  if (
    (deductionRupiah !== null && !validRupiah(deductionRupiah)) ||
    (chargesRupiah !== null && !validRupiah(chargesRupiah))
  )
    invalid = true;
  const result: ReceiptTotals = {
    status: "unknown",
    lineTotalsRupiah,
    subtotalRupiah:
      sum !== null && sum <= BigInt(Number.MAX_SAFE_INTEGER)
        ? Number(sum)
        : null,
    totalRupiah: null,
    error: null,
  };
  if (invalid)
    return {
      ...result,
      status: "invalid",
      error: "Berat atau nominal nota tidak valid.",
    };
  if (sum === null || deductionRupiah === null || chargesRupiah === null) {
    return result;
  }
  const total = sum - BigInt(deductionRupiah) + BigInt(chargesRupiah);
  if (total < 0n || total > BigInt(Number.MAX_SAFE_INTEGER)) {
    return {
      ...result,
      status: "invalid",
      error: "Total nota berada di luar rentang yang dapat dihitung.",
    };
  }
  return { ...result, status: "ready", totalRupiah: Number(total) };
}
