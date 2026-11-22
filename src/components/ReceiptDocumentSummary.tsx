import type { Draft } from "../types";
import type { compareReceiptDocument } from "../lib/receiptDocument";
import { extractionBelongsToSource } from "../lib/documentValidation";
import { formatRupiah } from "../lib/format";

type Comparison = ReturnType<typeof compareReceiptDocument>;
const amount = (value: number | null) => formatRupiah(value);
const reviewedAmount = (value: string) =>
  value.trim() !== "" &&
  /^\d+$/.test(value) &&
  Number.isSafeInteger(Number(value))
    ? Number(value)
    : null;
// Bedakan isian kosong (belum diketahui), isian sebelum konfirmasi, dan isian terkonfirmasi.
const reviewedLabel = (value: string, confirmed: boolean) =>
  value.trim() === ""
    ? "Belum diketahui"
    : reviewedAmount(value) === null
      ? "Isian tidak valid"
      : `${amount(reviewedAmount(value))} · ${confirmed ? "terkonfirmasi" : "isian, belum dikonfirmasi"}`;
export const comparisonHeadline = (status: Comparison["status"]) =>
  status === "difference"
    ? "Temuan nominal terbuka"
    : status === "match"
      ? "Total hitung sesuai total tertulis"
      : status === "awaiting_review"
        ? "Perbandingan total menunggu tinjauan"
        : "Total tertulis belum terbaca";
export function ReceiptDocumentSummary({
  draft,
  comparison,
  hint,
  compact = false,
  collapsible = false,
}: {
  draft: Draft;
  comparison: Comparison;
  hint: string;
  compact?: boolean;
  /** Tampilkan sebagai ringkasan yang bisa dibuka (dipakai di tahap Nota pada HP). */
  collapsible?: boolean;
}) {
  const stored = draft.rawExtractions?.receipt;
  const evidence =
    stored && extractionBelongsToSource(draft, "receipt")
      ? stored.result
      : null;
  const confirmed = draft.receiptConfirmed;
  const body = (
    <>
      <p className="meta">
        Nominal tertulis berasal dari pembacaan AI. Periksa dokumen asli; angka
        ini tidak diganti oleh hasil hitung.
      </p>
      <dl>
        {evidence?.normalized.items.map((item, index) => (
          <div key={index}>
            <dt>Subtotal baris {item.itemName || index + 1} terbaca AI</dt>
            <dd>{amount(item.subtotalRupiah)}</dd>
          </div>
        ))}
        <div>
          <dt>Total akhir tertulis (pembacaan AI)</dt>
          <dd>{amount(comparison.printedTotalRupiah)}</dd>
        </div>
        <div>
          <dt>Potongan terbaca AI</dt>
          <dd>{amount(evidence?.normalized.deductionRupiah ?? null)}</dd>
        </div>
        <div>
          <dt>Biaya tambahan terbaca AI</dt>
          <dd>{amount(evidence?.normalized.chargesRupiah ?? null)}</dd>
        </div>
        <div>
          <dt>Potongan isian pengguna</dt>
          <dd>{reviewedLabel(draft.deduction, confirmed)}</dd>
        </div>
        <div>
          <dt>Biaya tambahan isian pengguna</dt>
          <dd>{reviewedLabel(draft.charges, confirmed)}</dd>
        </div>
      </dl>
      <p className="meta">
        {confirmed
          ? "Isian nota telah dikonfirmasi pengguna. Nominal yang belum diketahui tetap belum diketahui."
          : "Isian akan berstatus terkonfirmasi setelah Anda menekan Konfirmasi nota."}
      </p>
      <div
        className={`receipt-total-comparison ${comparison.status}`}
        role={comparison.status === "difference" ? "status" : undefined}
      >
        <strong>{comparisonHeadline(comparison.status)}</strong>
        <p>
          {comparison.status === "difference"
            ? `Total akhir nota terhitung ${amount(comparison.calculatedTotalRupiah)}; total tertulis terbaca AI ${amount(comparison.printedTotalRupiah)}. Selisih (hitung dikurangi tertulis): ${amount(comparison.differenceRupiah)}. Nominal tidak diubah otomatis.`
            : comparison.status === "match"
              ? "Kesamaan angka ini tidak membuktikan pembayaran atau verifikasi pihak luar."
              : comparison.status === "unavailable"
                ? "Total tertulis belum diketahui dari sumber saat ini. Tidak ada nilai yang ditebak."
                : `${confirmed ? "" : "Konfirmasikan nota setelah meninjau semua isian. "}${hint}`}
        </p>
      </div>
    </>
  );
  if (collapsible)
    return (
      <details
        className={`receipt-document-summary collapsible ${comparison.status}`}
        aria-label="Nominal tertulis, tinjauan pengguna, dan perbandingan"
        open={comparison.status === "difference" || undefined}
      >
        <summary>
          <span className="summary-title">Nominal dokumen dan tinjauan</span>
          <span className={`summary-status ${comparison.status}`}>
            {comparisonHeadline(comparison.status)}
          </span>
        </summary>
        <div className="summary-body">{body}</div>
      </details>
    );
  return (
    <section
      className={`receipt-document-summary ${compact ? "compact" : ""}`}
      aria-label="Nominal tertulis, tinjauan pengguna, dan perbandingan"
    >
      <h3>Nominal dokumen dan tinjauan</h3>
      {body}
    </section>
  );
}
