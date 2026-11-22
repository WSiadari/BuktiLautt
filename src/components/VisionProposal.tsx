import { useState } from "react";
import type { Row } from "../types";
import { isClassifiedExtraction, type VisionResult } from "../vision/contract";
import { proposalImportState } from "../lib/visionReview";
import { Badge } from "./ui";
import { reviewLanguage } from "../lib/reviewLanguage";
import { OmbakPintar } from "./OmbakPintar";

import { formatRupiah } from "../lib/format";

const amount = (value: number | null) => formatRupiah(value);
export function VisionProposal({
  result,
  rows,
  stale,
  onApply,
  onReplace,
  onRetry,
}: {
  result: VisionResult;
  rows: Row[];
  stale: boolean;
  onApply: (indices: number[]) => void;
  onReplace: () => void;
  onRetry: () => void;
}) {
  const state = proposalImportState(rows, result);
  const [selected, setSelected] = useState<number[]>(
    () => state.eligibleIndices,
  );
  const eligibleSelected = selected.filter((index) =>
    state.eligibleIndices.includes(index),
  );
  const compatibility = state.compatibility;
  const classified = isClassifiedExtraction(result.raw) ? result.raw : null;
  const isReceipt = result.documentType === "receipt";
  const typeName = (type: string | null) =>
    type === "weighing"
      ? "Catatan timbang"
      : type === "sales_receipt" || type === "receipt"
        ? "Nota penjualan"
        : "Belum dapat dipastikan";
  const complete =
    compatibility.canImport &&
    result.normalized.items.length > 0 &&
    state.appliedIndices.length === result.normalized.items.length;
  return (
    <section
      className="panel vision-proposal"
      aria-label="Usulan hasil AI untuk ditinjau"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">PEMBACAAN AI · PERLU KONFIRMASI PENGGUNA</p>
          <h2>
            {compatibility.canImport
              ? `${result.normalized.items.length} usulan hasil AI — perlu ditinjau`
              : result.normalized.items.length
                ? "Pembacaan disimpan sebagai catatan."
                : "Belum ada hasil AI yang dapat ditambahkan."}
          </h2>
        </div>
        <OmbakPintar mood="review" />
      </div>
      <div
        className={
          compatibility.canImport ? "callout info" : "callout document-blocked"
        }
        role={compatibility.canImport ? undefined : "alert"}
      >
        <div>
          <strong>{compatibility.message}</strong>
          <p>
            {compatibility.canImport
              ? "Hasil AI tidak otomatis mengubah isian. Periksa semua angka terhadap dokumen asli sebelum konfirmasi."
              : "Sumber, hasil pembacaan, dan isian sebelumnya tetap disimpan. Hasil ini tidak dapat ditambahkan atau digunakan untuk konfirmasi pada langkah ini."}
          </p>
          {!compatibility.canImport && (
            <div className="document-recovery">
              <button className="button secondary" onClick={onReplace}>
                Ganti dokumen
              </button>
              <button className="text-button" onClick={onRetry}>
                Baca sumber ini lagi
              </button>
            </div>
          )}
        </div>
      </div>
      <dl className="document-classification">
        <div>
          <dt>Langkah pemeriksaan</dt>
          <dd>
            {result.documentType === "weighing"
              ? "Catatan timbang"
              : "Nota penjualan"}
          </dd>
        </div>
        <div>
          <dt>Jenis dokumen menurut pembacaan AI</dt>
          <dd>
            {classified
              ? typeName(classified.documentType)
              : "Belum diperiksa secara terpisah pada pembacaan lama"}
          </dd>
        </div>
        <div>
          <dt>Keterbacaan menurut AI</dt>
          <dd>
            {classified?.readability === "readable"
              ? "Dapat dibaca"
              : classified?.readability === "partial"
                ? "Sebagian terbaca"
                : classified?.readability === "unreadable"
                  ? "Tidak cukup jelas"
                  : "Belum tercatat"}
          </dd>
        </div>
      </dl>
      {classified?.classification.evidence.length ? (
        <p className="document-evidence">
          Petunjuk yang dibaca AI:{" "}
          {classified.classification.evidence.join("; ")}. Tetap periksa sumber
          asli.
        </p>
      ) : null}
      {stale && (
        <div className="callout error" role="alert">
          Sumber dokumen telah berubah. Pembacaan sebelumnya tetap disimpan,
          tetapi tidak dapat ditambahkan dari sumber lama. Baca sumber terbaru
          bila diperlukan.
        </div>
      )}
      {state.legacyWarning && state.blockedIndices.length > 0 && (
        <div className="callout info">
          <p>
            Sebagian baris lama belum dapat dihubungkan dengan pasti ke butir
            pembacaan ini. Butir yang berpotensi ganda dikunci; butir lain yang
            aman tetap tersedia. Isian lama tidak diubah.
          </p>
        </div>
      )}
      {state.duplicateAssociations && (
        <div className="callout error" role="alert">
          Beberapa baris form merujuk butir AI yang sama. Baris lama tetap
          dipertahankan; periksa dan hapus baris ganda secara sengaja sebelum
          mengonfirmasi. Butir tersebut tidak dapat ditambahkan lagi.
        </div>
      )}
      {!!state.previousExtractionRows && compatibility.canImport && (
        <div className="callout info">
          <p>
            Form masih memuat {state.previousExtractionRows} baris dari
            pembacaan sebelumnya. Isian dan koreksi tetap dipertahankan; hasil
            pembacaan ulang tidak dapat ditambahkan agar tidak ganda. Tinjau
            isian yang ada, atau hapus baris AI sebelumnya secara sengaja
            sebelum memakai hasil baru.
          </p>
        </div>
      )}
      {result.warnings.length > 0 && (
        <ul className="proposal-warnings">
          {result.warnings.map((warning, index) => (
            <li key={index}>{reviewLanguage(warning)}</li>
          ))}
        </ul>
      )}
      <div className="proposal-items">
        {result.normalized.items.map((item, index) => {
          const applied = state.appliedIndices.includes(index);
          const blocked = state.blockedIndices.includes(index);
          return (
            <article
              key={index}
              data-import-status={
                !compatibility.canImport
                  ? "read-only"
                  : applied
                    ? "applied"
                    : blocked
                      ? "ambiguous"
                      : "eligible"
              }
            >
              <label className="proposal-choice">
                <input
                  type="checkbox"
                  checked={
                    compatibility.canImport &&
                    (applied || eligibleSelected.includes(index))
                  }
                  disabled={
                    stale || !compatibility.canImport || applied || blocked
                  }
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, index]
                        : current.filter((value) => value !== index),
                    )
                  }
                />
                <span>{item.itemName || "Jenis ikan belum diketahui"}</span>
                <Badge tone={blocked ? "caution" : ""}>
                  {!compatibility.canImport
                    ? "Catatan pembacaan · belum dapat digunakan"
                    : applied
                      ? "Sudah ditambahkan"
                      : blocked
                        ? "Perlu tinjauan baris lama"
                        : "Perlu diperiksa"}
                </Badge>
              </label>
              <dl>
                <div>
                  <dt>Berat dibaca AI</dt>
                  <dd>
                    {item.weightKg === null
                      ? "Belum diketahui"
                      : `${item.weightKg.toLocaleString("id-ID")} kg`}
                  </dd>
                </div>
                {(isReceipt || result.raw.items[index]?.unitPrice != null) && <div>
                  <dt>{isReceipt ? "Harga per kg dibaca AI" : "Harga pada catatan · periksa satuannya"}</dt>
                  <dd>{!isReceipt && item.unitPriceRupiah === null ? result.raw.items[index].unitPrice : amount(item.unitPriceRupiah)}</dd>
                </div>}
                {isReceipt && <div>
                  <dt>Subtotal dibaca AI</dt>
                  <dd>{amount(item.subtotalRupiah)}</dd>
                </div>}
              </dl>
              <p className="meta">
                Teks yang dibaca AI:{" "}
                {result.raw.items[index]?.rawText || "Tidak tersedia"}
              </p>
              {item.issues.length > 0 && (
                <ul className="proposal-warnings">
                  {item.issues.map((issue, i) => (
                    <li key={i}>{reviewLanguage(issue)}</li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
      {!result.normalized.items.length && (
        <p>
          AI tidak menghasilkan baris yang dapat digunakan. Sumber dan isian
          Anda tetap utuh; lanjutkan isi manual atau coba kembali.
        </p>
      )}
      {isReceipt && <div className="proposal-document-amounts">
        <p>
          Total dokumen yang dibaca AI:{" "}
          <strong>{amount(result.normalized.documentTotalRupiah)}</strong>
        </p>
        <p>
          Potongan dibaca AI:{" "}
          <strong>{amount(result.normalized.deductionRupiah)}</strong> · Biaya
          dibaca AI: <strong>{amount(result.normalized.chargesRupiah)}</strong>
        </p>
        <small>
          Periksa nominal terhadap dokumen asli. Subtotal tidak digunakan untuk
          menebak harga per kg.
        </small>
      </div>}
      <div className="proposal-format-note">
        <strong>Pembacaan AI — Perlu konfirmasi pengguna</strong>
        <p>
          Hasil telah diperiksa formatnya. Silakan periksa kembali angka
          terhadap dokumen asli. Pemeriksaan format tidak menjamin angka benar.
        </p>
      </div>
      {!compatibility.canImport ? (
        <p className="meta">
          Tidak ada baris yang diimpor dari hasil ini. Ganti sumber atau lakukan
          pembacaan ulang yang sesuai sebelum melanjutkan konfirmasi. Memilih
          isi manual tidak menghapus pemeriksaan jenis dokumen.
        </p>
      ) : complete ? (
        <p className="proposal-complete" role="status">
          Semua {result.normalized.items.length} baris sudah ditambahkan. Isian
          tetap perlu ditinjau dan dikonfirmasi pengguna.
        </p>
      ) : state.eligibleIndices.length > 0 ? (
        <>
          <button
            className="button secondary full"
            disabled={stale || !eligibleSelected.length}
            onClick={() => {
              onApply(eligibleSelected);
              setSelected([]);
            }}
          >
            Tambahkan {eligibleSelected.length} baris terpilih ke form
          </button>
          <p className="meta">
            Isian yang sudah ada tidak ditimpa. Baris yang sengaja dihapus dari
            form dapat dipilih kembali untuk ditambahkan.
          </p>
        </>
      ) : result.normalized.items.length > 0 ? (
        <p className="meta">
          Tidak ada butir lain yang aman ditambahkan dari pembacaan ini. Tinjau
          isian yang sudah ada sebelum meminta pembacaan ulang.
        </p>
      ) : null}
    </section>
  );
}
