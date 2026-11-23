// Tahap 4 · Laporan: ringkasan, perbandingan berat, temuan, nominal dokumen, dan aritmetika nota.
// Hanya menampilkan nilai yang sudah dihitung di App; angka asli kedua sumber tidak diubah.
import type { RefObject } from "react";
import { Badge, Icon } from "./ui";
import { ReceiptDocumentSummary } from "./ReceiptDocumentSummary";
import {
  parseKilograms,
  type PairResult,
  type ReceiptTotals,
} from "../lib/examination";
import { kg, money, rupiahValue } from "../lib/fieldValues";
import type { compareReceiptDocument } from "../lib/receiptDocument";
import type { AccountSession, ArchiveEntry } from "../services/accounts";
import type { Draft, Pair, Row, Step } from "../types";

export type ReportStepProps = {
  draft: Draft;
  setStep: (step: Step) => void;
  accountSession: AccountSession;
  setAccountOpen: (open: boolean) => void;
  /** Salinan sesi dari arsip akun, bila laporan dibuka dari arsip. */
  cloudArchive: { entry: ArchiveEntry; userId: string; workspaceId: string; syncedAt: string } | null;
  storageError: string;
  heading: RefObject<HTMLHeadingElement | null>;
  pairResult: (pair: Pair) => PairResult;
  /** Pasangan dengan selisih berat yang belum dijelaskan. */
  findings: Pair[];
  unpairedReceipt: Row[];
  /** Total nota yang dihitung kode, bukan hasil baca AI. */
  total: ReceiptTotals;
  documentComparison: ReturnType<typeof compareReceiptDocument>;
  receiptAmountHint: string;
};

export function ReportStep({
  draft,
  setStep,
  accountSession,
  setAccountOpen,
  cloudArchive,
  storageError,
  heading,
  pairResult,
  findings,
  unpairedReceipt,
  total,
  documentComparison,
  receiptAmountHint,
}: ReportStepProps) {
  const canSaveToArchive = Boolean(accountSession.user) && !cloudArchive;
  return (
    <>
      <div className="page-intro no-print">
        <div>
          <p className="eyebrow">Langkah 4 dari 4</p>
          <h1 ref={heading} tabIndex={-1}>
            Laporan
          </h1>
          <p>Angka asli, penyesuaian, dan total nota dalam satu halaman.</p>
        </div>
      </div>
      <section className="report-glance no-print" aria-label="Ringkasan laporan">
        <div className="glance-total">
          <span>Total akhir nota</span>
          <strong>{money(total.totalRupiah)}</strong>
        </div>
        <div
          className={`glance-status ${findings.length || documentComparison.status === "difference" ? "open" : "clear"}`}
        >
          <span>Status selisih</span>
          <strong>
            {findings.length
              ? `${findings.length} selisih berat terbuka`
              : "Tidak ada selisih berat terbuka"}
          </strong>
          {documentComparison.status === "difference" && (
            <small>Temuan nominal terbuka · perlu ditinjau</small>
          )}
        </div>
        {(findings.length > 0 || canSaveToArchive) && (
          <div className="glance-next">
            <span>Tindakan berikutnya</span>
            {findings.length > 0 ? (
              <button
                className="text-button"
                onClick={() => setStep("matching")}
              >
                Jelaskan selisih di Periksa pasangan <Icon name="arrow" />
              </button>
            ) : (
              <button
                className="text-button"
                onClick={() => setAccountOpen(true)}
              >
                Simpan ke arsip akun <Icon name="arrow" />
              </button>
            )}
          </div>
        )}
      </section>
      <div className="report-paper">
        <div className="report-brand">
          <img src="/brand/buktilaut-horizontal.svg" alt="BuktiLaut" />
          <div>
            <strong>LAPORAN PEMERIKSAAN</strong>
            <span>
              {cloudArchive
                ? `Revisi arsip ${cloudArchive.entry.revision}`
                : draft.id}{" "}
              · Revisi pemeriksaan {draft.revision}
            </span>
          </div>
        </div>
        <div className="report-title">
          {cloudArchive?.entry.reference && (
            <strong className="report-transaction-reference">
              {cloudArchive.entry.reference}
            </strong>
          )}
          {cloudArchive && (
            <span className="report-archive-revision">
              Revisi arsip {cloudArchive.entry.revision}
            </span>
          )}
          <div>
            <p className="eyebrow">
              {cloudArchive
                ? `ARSIP AKUN · ${cloudArchive.entry.transactionDate || "TANGGAL BELUM DIKONFIRMASI"}${draft.demo ? " · SINTETIS" : ""}`
                : draft.demo
                  ? "DATA CONTOH (SINTETIS) · 6 NOVEMBER 2026"
                  : "CATATAN PEMERIKSAAN LOKAL"}
            </p>
            <h2>Catatan timbang & nota penjualan</h2>
          </div>
          <div className="report-status-group">
            {documentComparison.status === "difference" && (
              <Badge tone="caution">
                Temuan nominal terbuka · perlu ditinjau
              </Badge>
            )}
            <Badge tone={findings.length ? "caution" : "success"}>
              {findings.length
                ? `${findings.length} temuan berat terbuka`
                : "Tidak ada selisih berat terbuka"}
            </Badge>
          </div>
        </div>
        {cloudArchive && (
          <dl className="report-transaction-metadata">
            <div>
              <dt>Tanggal transaksi</dt>
              <dd>
                {cloudArchive.entry.transactionDate || "Belum dikonfirmasi"}
                {cloudArchive.entry.transactionTime
                  ? " · " + cloudArchive.entry.transactionTime + " WIB"
                  : ""}
              </dd>
            </div>
            {cloudArchive.entry.counterpartyName && (
              <div>
                <dt>Pihak transaksi</dt>
                <dd>{cloudArchive.entry.counterpartyName}</dd>
              </div>
            )}
            {cloudArchive.entry.receiptNumber && (
              <div>
                <dt>Nomor nota</dt>
                <dd>{cloudArchive.entry.receiptNumber}</dd>
              </div>
            )}
          </dl>
        )}
        <div className="report-summary">
          <div>
            <span>Subtotal item terhitung</span>
            <strong>{money(total.subtotalRupiah)}</strong>
            <span className="report-final-label">
              Total akhir nota terhitung
            </span>
            <strong className="report-final-amount">
              {money(total.totalRupiah)}
            </strong>
            <small>Terpisah dari pemeriksaan berat</small>
          </div>
          <div>
            <span>Pasangan dikonfirmasi</span>
            <strong>
              {draft.pairs.filter((p) => p.decision === "confirmed").length}
            </strong>
            <small>Dikonfirmasi oleh pengguna</small>
          </div>
          <div>
            <span>Baris tanpa pasangan</span>
            <strong>
              {draft.pairs.filter((p) => p.decision === "unmatched").length +
                unpairedReceipt.length}
            </strong>
            <small>Dicatat tersendiri</small>
          </div>
        </div>
        <h3>Perbandingan berat</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Jenis ikan</th>
                <th>Timbang</th>
                <th>Nota</th>
                <th>Selisih awal</th>
                <th>Tidak terjual</th>
                <th>Sisa</th>
              </tr>
            </thead>
            <tbody>
              {draft.pairs.map((p) => {
                const w = draft.weighing.find((r) => r.id === p.weighId)!;
                const r = draft.receipt.find((r) => r.id === p.receiptId);
                const result = pairResult(p);
                return (
                  <tr key={p.weighId}>
                    <td>
                      <strong>{w.name}</strong>
                      <small>
                        {p.decision === "confirmed"
                          ? "Pasangan dikonfirmasi"
                          : "Tanpa pasangan"}
                      </small>
                    </td>
                    <td>{kg(parseKilograms(w.kg))}</td>
                    <td>
                      {r && p.decision === "confirmed"
                        ? kg(parseKilograms(r.kg))
                        : "—"}
                    </td>
                    <td>{kg(result.initialKg)}</td>
                    <td>
                      {p.adjustment ? kg(parseKilograms(p.adjustment)) : "—"}
                    </td>
                    <td
                      className={
                        result.remainingKg !== 0 ? "caution-text" : ""
                      }
                    >
                      {kg(result.remainingKg)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mobile-report-cards">
          {draft.pairs.map((p) => {
            const w = draft.weighing.find((r) => r.id === p.weighId)!;
            const r = draft.receipt.find((r) => r.id === p.receiptId);
            const result = pairResult(p);
            return (
              <article className="report-weight-card" key={p.weighId}>
                <div>
                  <h3>{w.name}</h3>
                  <Badge tone={p.decision === "confirmed" ? "success" : ""}>
                    {p.decision === "confirmed"
                      ? "Pasangan dikonfirmasi"
                      : "Tanpa pasangan"}
                  </Badge>
                </div>
                <dl>
                  <div>
                    <dt>Catatan timbang</dt>
                    <dd>{kg(parseKilograms(w.kg))}</dd>
                  </div>
                  <div>
                    <dt>Nota penjualan</dt>
                    <dd>
                      {r && p.decision === "confirmed"
                        ? kg(parseKilograms(r.kg))
                        : "Tanpa pasangan"}
                    </dd>
                  </div>
                  <div>
                    <dt>Selisih awal</dt>
                    <dd>{kg(result.initialKg)}</dd>
                  </div>
                  <div>
                    <dt>Tidak terjual</dt>
                    <dd>
                      {p.adjustment
                        ? kg(parseKilograms(p.adjustment))
                        : "Belum dicatat"}
                    </dd>
                  </div>
                  <div
                    className={
                      result.remainingKg !== 0
                        ? "card-remaining open"
                        : "card-remaining"
                    }
                  >
                    <dt>Sisa berat terbuka</dt>
                    <dd>{kg(result.remainingKg)}</dd>
                  </div>
                </dl>
                {p.explanation && <p className="verbatim">{p.explanation}</p>}
              </article>
            );
          })}
        </div>
        <div className="report-section">
          <h3>Temuan dan keterangan</h3>
          {documentComparison.status === "difference" && (
            <div className="report-finding financial-open">
              <strong>Temuan nominal terbuka</strong>
              <p>
                Total akhir nota terhitung{" "}
                {money(documentComparison.calculatedTotalRupiah)} berbeda dari
                total tertulis yang dibaca AI{" "}
                {money(documentComparison.printedTotalRupiah)}. Selisih
                (hitung dikurangi tertulis):{" "}
                {money(documentComparison.differenceRupiah)}.
              </p>
              <p>
                Periksa dokumen dan isian. Nominal tidak disesuaikan otomatis
                untuk menghilangkan selisih.
              </p>
            </div>
          )}
          {findings.length ? (
            findings.map((p) => (
              <div className="report-finding" key={p.weighId}>
                <strong>
                  {draft.weighing.find((r) => r.id === p.weighId)?.name} ·{" "}
                  {kg(pairResult(p).remainingKg)} belum dijelaskan
                </strong>
                <p>
                  Periksa kembali sumber atau tambahkan penyesuaian dengan
                  keterangan pengguna.
                </p>
              </div>
            ))
          ) : (
            <p>
              Tidak ada selisih berat terbuka pada pasangan yang dikonfirmasi
              dalam revisi ini.
            </p>
          )}
          {draft.pairs
            .filter((p) => p.adjustment)
            .map((p) => (
              <div className="report-finding" key={p.weighId}>
                <strong>
                  {draft.weighing.find((r) => r.id === p.weighId)?.name} ·
                  Tidak terjual {kg(parseKilograms(p.adjustment))}
                </strong>
                <p className="verbatim">{p.explanation}</p>
                <small>
                  Keterangan pengguna · Nilai sumber tidak diubah.
                </small>
              </div>
            ))}
          {unpairedReceipt.length > 0 && (
            <p>
              Tanpa pasangan di nota:{" "}
              {unpairedReceipt.map((r) => r.name).join(", ")}. Nilai nota
              tetap masuk hitungan bila tersedia.
            </p>
          )}
          {draft.pairs.filter((p) => p.decision === "unmatched").length >
            0 && (
            <p>
              Tanpa pasangan di timbang:{" "}
              {draft.pairs
                .filter((p) => p.decision === "unmatched")
                .map(
                  (p) => draft.weighing.find((w) => w.id === p.weighId)?.name,
                )
                .join(", ")}
              .
            </p>
          )}
        </div>
        <div className="report-document-finance">
          <ReceiptDocumentSummary
            draft={draft}
            comparison={documentComparison}
            hint={receiptAmountHint}
            compact
          />
        </div>
        <div className="report-bottom">
          <section>
            <h3>Aritmetika nota</h3>
            {draft.receipt.map((r, i) => (
              <div className="money-line" key={r.id}>
                <span>
                  {r.name} · {kg(parseKilograms(r.kg))} ×{" "}
                  {money(rupiahValue(r.price))}
                </span>
                <strong>{money(total.lineTotalsRupiah[i])}</strong>
              </div>
            ))}
            <div className="money-line item-subtotal">
              <span>Subtotal item terhitung</span>
              <strong>{money(total.subtotalRupiah)}</strong>
            </div>
            <div className="money-line">
              <span>Potongan</span>
              <strong>{money(rupiahValue(draft.deduction))}</strong>
            </div>
            <div className="money-line">
              <span>Biaya tambahan</span>
              <strong>{money(rupiahValue(draft.charges))}</strong>
            </div>
            <div className="money-line grand-total">
              <span>Total akhir nota terhitung</span>
              <strong>{money(total.totalRupiah)}</strong>
            </div>
          </section>
          <section>
            <h3>Sumber dan batas pemeriksaan</h3>
            {draft.receipt.some((r) => r.sourceSubtotal) && (
              <p>
                Subtotal baris isian pengguna:{" "}
                {draft.receipt
                  .filter((r) => r.sourceSubtotal)
                  .map(
                    (r) =>
                      r.name + " " + money(rupiahValue(r.sourceSubtotal!)),
                  )
                  .join("; ")}
                . Nominal ini dipisahkan dari hitungan berat × harga per kg.
              </p>
            )}
            {Object.keys(draft.rawExtractions || {}).length > 0 && (
              <p>
                Hasil AI disimpan terpisah dari koreksi dan snapshot
                konfirmasi pengguna. Isian laporan mengikuti data yang
                ditinjau, bukan keluaran AI otomatis.
              </p>
            )}
            <p>
              {draft.sources.weighing.filename}
              <br />
              {draft.sources.receipt.filename}
            </p>
            <p>
              Konfirmasi pengguna tidak menyatakan keaslian dokumen,
              pembayaran, kerugian, atau verifikasi pihak luar.
            </p>
            {total.status !== "ready" && (
              <p className="caution-text">{receiptAmountHint}</p>
            )}
            <p>
              Perubahan data memerlukan tinjauan ulang. Laporan ini mengikuti
              revisi pemeriksaan {draft.revision}
              {cloudArchive
                ? ` dan revisi arsip ${cloudArchive.entry.revision}`
                : ""}
              .
            </p>
          </section>
        </div>
        <footer className="paper-footer">
          BuktiLaut · {cloudArchive?.entry.reference || draft.id} ·{" "}
          {cloudArchive
            ? `Revisi arsip ${cloudArchive.entry.revision}`
            : `Revisi pemeriksaan ${draft.revision}`}{" "}
          <span>
            {cloudArchive
              ? `Arsip akun · ${accountSession.workspaces.find((workspace) => workspace.id === cloudArchive.workspaceId)?.name || "Ruang kerja aktif"} · Revisi pemeriksaan ${draft.revision} · ID pemeriksaan ${draft.id}${cloudArchive.syncedAt !== draft.savedAt ? " · Perubahan sesi belum disinkronkan" : ""}${draft.demo ? " · Contoh sintetis" : ""}`
              : draft.demo
                ? "Contoh sintetis — bukan transaksi nyata"
                : storageError
                  ? "Perubahan belum tersimpan pada perangkat"
                  : "Draf di perangkat ini"}
          </span>
        </footer>
      </div>
      <div className="action-bar sticky-actions no-print">
        <button
          className="button secondary"
          onClick={() => setStep("matching")}
          aria-label="Kembali ke pemeriksaan"
        >
          <Icon name="arrow-left" size={18} />
          <span className="btn-label">Kembali</span>
        </button>
        <button className="button primary" onClick={() => window.print()}>
          <Icon name="print" /> Cetak PDF
        </button>
      </div>
    </>
  );
}
