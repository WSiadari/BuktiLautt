// Tahap 3 · Periksa pasangan: pengguna mengonfirmasi pasangan baris timbang dan nota,
// lalu menjelaskan selisih. Penyesuaian dicatat terpisah dan tidak menimpa angka asli.
import type { RefObject } from "react";
import { Badge, Icon } from "./ui";
import { PairLedger } from "./PairLedger";
import { ReceiptDocumentSummary } from "./ReceiptDocumentSummary";
import {
  parseKilograms,
  type PairResult,
  type ReceiptTotals,
} from "../lib/examination";
import { kg, money } from "../lib/fieldValues";
import type { compareReceiptDocument } from "../lib/receiptDocument";
import type { Draft, Pair, Row, Step } from "../types";

export type MatchingStepProps = {
  draft: Draft;
  setStep: (step: Step) => void;
  setArchiveChat: (open: boolean) => void;
  setSourceModal: (kind: "weighing" | "receipt" | null) => void;
  setChatOpen: (open: boolean) => void;
  setChatFindingId: (id: string | null) => void;
  pairErrors: Record<string, string>;
  setAdjusting: (weighId: string | null) => void;
  setAdjustValue: (value: string) => void;
  setExplanation: (value: string) => void;
  heading: RefObject<HTMLHeadingElement | null>;
  update: (next: Draft) => void;
  /** Keputusan pasangan selalu dari pengguna; kode hanya menghitung selisih. */
  changePair: (weighId: string, patch: Partial<Pair>) => void;
  pairResult: (pair: Pair) => PairResult;
  /** Pasangan dengan selisih berat yang belum dijelaskan. */
  findings: Pair[];
  unpairedReceipt: Row[];
  allReviewed: boolean;
  /** Total nota yang dihitung kode, bukan hasil baca AI. */
  total: ReceiptTotals;
  documentComparison: ReturnType<typeof compareReceiptDocument>;
  receiptAmountHint: string;
};

export function MatchingStep({
  draft,
  setStep,
  setArchiveChat,
  setSourceModal,
  setChatOpen,
  setChatFindingId,
  pairErrors,
  setAdjusting,
  setAdjustValue,
  setExplanation,
  heading,
  update,
  changePair,
  pairResult,
  findings,
  unpairedReceipt,
  allReviewed,
  total,
  documentComparison,
  receiptAmountHint,
}: MatchingStepProps) {
  return (
    <>
      <div className="page-intro ledger-intro">
        <div>
          <p className="eyebrow">Langkah 3 dari 4</p>
          <h1 ref={heading} tabIndex={-1}>
            Periksa pasangan
          </h1>
          <p>Cocokkan tiap ikan, lalu jelaskan selisihnya.</p>
        </div>
        <Badge>
          {
            draft.pairs.filter((p) => p.decision !== "pending")
              .length
          }
          /{draft.pairs.length} keputusan tercatat
        </Badge>
      </div>
      {draft.previousReview && (
        <details className="panel previous-review">
          <summary>
            Keputusan sebelumnya · Revisi{" "}
            {draft.previousReview.revision}{" "}
            <Badge tone="caution">Perlu ditinjau ulang</Badge>
          </summary>
          <p>
            Salinan terakhir ini tidak dipakai dalam hitungan atau
            laporan aktif. Konfirmasikan ulang berdasarkan data saat
            ini.
          </p>
          {draft.previousReview.rows.map((line, i) => (
            <div key={i}>
              <strong>
                {line.name} · {line.weighedKg || "—"} kg timbang /{" "}
                {line.receiptKg || "—"} kg nota
              </strong>
              <p>
                {line.reviewIssue
                  ? "Konfirmasi lama dibatalkan; perlu ditinjau"
                  : line.decision === "confirmed"
                    ? "Pasangan sebelumnya dikonfirmasi"
                    : line.decision === "unmatched"
                      ? "Sebelumnya tanpa pasangan"
                      : "Konfirmasi lama dibatalkan; perlu ditinjau"}
                {line.adjustment &&
                  " · Tidak terjual " + line.adjustment + " kg"}
              </p>
              {line.receiptName && (
                <p>Baris nota sebelumnya: {line.receiptName}</p>
              )}
              {line.reviewIssue && (
                <p className="caution-text">{line.reviewIssue}</p>
              )}
              {line.explanation && (
                <p className="verbatim">{line.explanation}</p>
              )}
            </div>
          ))}
          <small>
            Rujukan sumber: {draft.previousReview.sources.weighing};{" "}
            {draft.previousReview.sources.receipt}
          </small>
        </details>
      )}
      <div className="matching-grid">
        <section className="pair-list">
          <PairLedger draft={draft} pairResult={pairResult} errors={pairErrors} onChange={changePair} onEvidence={setSourceModal}
            receiptNeedsDecision={unpairedReceipt.some(r=>!draft.unmatchedReceipts.includes(r.id))}
            onAdjust={p => {
              setAdjusting(p.weighId);
              setAdjustValue(p.adjustment || "");
              setExplanation(p.explanation);
            }}
            onExplain={p => {
              setChatFindingId(`pair:${p.weighId}`);
              setArchiveChat(false);
              setChatOpen(true);
            }}
          >
          {unpairedReceipt.length > 0 && (
            <section className="panel unmatched-panel">
              <h2>Baris nota tanpa pasangan</h2>
              <p>
                Putuskan setiap baris nota yang belum digunakan.
              </p>
              {unpairedReceipt.map((r) => (
                <div className="unmatched-row" key={r.id}>
                  <div>
                    <strong>{r.name}</strong>
                    <span>{kg(parseKilograms(r.kg))}</span>
                  </div>
                  {draft.unmatchedReceipts.includes(r.id) ? (
                    <Badge>Tanpa pasangan · dicatat</Badge>
                  ) : (
                    <button
                      className="button secondary"
                      onClick={() =>
                        update({
                          ...draft,
                          unmatchedReceipts: [
                            ...draft.unmatchedReceipts,
                            r.id,
                          ],
                        })
                      }
                    >
                      Catat tanpa pasangan
                    </button>
                  )}
                </div>
              ))}
            </section>
          )}
          </PairLedger>
        </section>
        <aside className="panel result-panel">
          <h2>
            Ringkasan pemeriksaan
          </h2>
          <div className="result-stat">
            <span>Selisih berat pada pasangan terkonfirmasi</span>
            <strong>{findings.length} terbuka</strong>
          </div>
          <p className="meta">
            Selisih dihitung per pasangan. Selisih positif dan
            negatif tidak saling menghapus.
          </p>
          <div className="result-stat">
            <span>Total akhir nota terhitung</span>
            <strong>{money(total.totalRupiah)}</strong>
          </div>
          <p className="meta">
            Aritmetika Rupiah berdiri sendiri. {receiptAmountHint}
          </p>
          <details className="ledger-amounts">
            <summary>Rincian nominal dan sumber</summary>
            <div className="result-stat">
              <span>Subtotal item terhitung</span>
              <strong>{money(total.subtotalRupiah)}</strong>
            </div>
          <ReceiptDocumentSummary
            draft={draft}
            comparison={documentComparison}
            hint={receiptAmountHint}
            compact
          />
          </details>
          <div className="callout info compact">
            <Icon name="source" />
            <p>
              Laporan dapat memuat temuan terbuka. Jangan mengubah
              sumber untuk menghilangkan selisih.
            </p>
          </div>

          {!allReviewed && (
            <p className="meta">
              Selesaikan keputusan pada kedua sisi sumber.
            </p>
          )}
        </aside>
      </div>
      <div className="action-bar sticky-actions">
                  <button
          className="button secondary"
          onClick={() => setStep("receipt")}
          aria-label="Kembali ke nota"
        >
          <Icon name="arrow-left" size={18} />
          <span className="btn-label">Kembali ke nota</span>
        </button>
        <button
          className="button primary"
          disabled={!allReviewed}
          onClick={() => setStep("report")}
        >
          Lihat laporan <Icon name="arrow" />
        </button>
      </div>
    </>
  );
}
