import { useState } from "react";
import type { UnifiedAgentResponse } from "../agent/unified";
import { formatRupiah } from "../lib/format";
const rupiah = (value: number | null) => formatRupiah(value);
export const transactionDateLabel = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "long",
        timeZone: "Asia/Jakarta",
      }).format(new Date(value + "T12:00:00+07:00"))
    : "Tanggal belum dikonfirmasi";
export function AgentTransactions({
  answer,
  onOpen,
}: {
  answer: UnifiedAgentResponse;
  onOpen: (id: string, revision: number) => void;
}) {
  const [visible, setVisible] = useState(5);
  const summary = answer.aggregate;
  if (!summary && !answer.transactions.length) return null;
  return (
    <section
      className="agent-transaction-results"
      aria-label="Transaksi dari arsip berizin"
    >
      {summary && (
        <div className="agent-aggregate">
          <strong>
            {summary.status === "none"
              ? "Tidak ada transaksi yang cocok"
              : summary.status === "overflow"
                ? "Total melampaui batas perhitungan"
                : rupiah(summary.totalRupiah)}
          </strong>
          <dl>
            <div>
              <dt>Transaksi cocok</dt>
              <dd>{summary.transactionCount}</dd>
            </div>
            <div>
              <dt>Terkonfirmasi</dt>
              <dd>{summary.confirmedCount}</dd>
            </div>
            <div>
              <dt>Draf dalam hasil</dt>
              <dd>{summary.draftCount}</dd>
            </div>
            {summary.unknownTotalCount > 0 && (
              <div>
                <dt>Total belum diketahui</dt>
                <dd>{summary.unknownTotalCount}</dd>
              </div>
            )}
          </dl>
          <p>
            {summary.fromDate
              ? transactionDateLabel(summary.fromDate)
              : "Seluruh tanggal"}
            {summary.toDate && summary.toDate !== summary.fromDate
              ? ` – ${transactionDateLabel(summary.toDate)}`
              : ""}{" "}
            · WIB
          </p>
          <p>
            Ruang kerja: {answer.workspaceName || "Pribadi"}
            {summary.statusFilter === "confirmed"
              ? " · Draf tidak dijumlahkan"
              : ""}
          </p>
        </div>
      )}
      <div className="agent-transaction-cards">
        {answer.transactions.slice(0, visible).map((item) => (
          <article className="agent-transaction-card" key={item.transactionId}>
            <header>
              <strong>{item.reference || "Referensi belum tersedia"}</strong>
              <span className="badge">
                {item.status === "confirmed" ? "Terkonfirmasi" : "Draf"}
              </span>
            </header>
            <p>
              {transactionDateLabel(item.transactionDate)}
              {item.transactionTime ? ` · ${item.transactionTime} WIB` : ""}
            </p>
            {item.counterpartyName && <p>{item.counterpartyName}</p>}
            {item.receiptNumber && <p>Nota: {item.receiptNumber}</p>}
            <strong className="transaction-card-amount">
              {rupiah(item.totalRupiah)}
            </strong>
            <button
              type="button"
              className="text-button"
              onClick={() => onOpen(item.transactionId, item.revision)}
            >
              Buka transaksi {item.reference || "tersimpan"}
            </button>
          </article>
        ))}
      </div>
      {visible < answer.transactions.length && (
        <button
          type="button"
          className="text-button"
          onClick={() => setVisible((n) => n + 5)}
        >
          Tampilkan {Math.min(5, answer.transactions.length - visible)}{" "}
          transaksi lainnya
        </button>
      )}
      {summary?.hasMore && answer.transactions.length > 0 && visible >= answer.transactions.length && (
        <p className="meta">
          Masih ada hasil lain. Persempit tanggal, pihak transaksi, atau nomor
          referensi untuk menemukan transaksi yang dimaksud.
        </p>
      )}
    </section>
  );
}
