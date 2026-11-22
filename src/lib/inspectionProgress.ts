import type { Draft } from "../types.ts";

export function inspectionProgress(draft: Pick<Draft, "weighingConfirmed" | "receiptConfirmed">) {
  if (!draft.weighingConfirmed) return { step: "weighing", label: "Catatan timbang" } as const;
  if (!draft.receiptConfirmed) return { step: "receipt", label: "Nota penjualan" } as const;
  return { step: "matching", label: "Periksa pasangan" } as const;
}
