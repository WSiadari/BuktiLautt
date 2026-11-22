// Tahap 1 dan 2 · Catatan timbang dan Nota penjualan: ambil sumber (teks, foto, atau suara),
// tinjau usulan AI, sunting isian, lalu konfirmasi. Sumber, hasil AI, dan isian disimpan terpisah.
import type { ReactNode, RefObject } from "react";
import { AIVisionProcessing } from "./AIVisionProcessing";
import { OmbakPintar } from "./OmbakPintar";
import { ReceiptDocumentSummary } from "./ReceiptDocumentSummary";
import { RowProvenance } from "./RowProvenance";
import { Badge, Icon } from "./ui";
import { VisionProposal } from "./VisionProposal";
import { VoiceInput, type VoiceCapture } from "./VoiceInput";
import {
  VoiceProposalReview,
  type VoiceEdits,
} from "./VoiceProposalReview";
import { now, row } from "../data/demo";
import type { ReceiptTotals } from "../lib/examination";
import {
  feeState,
  feeStateLabel,
  money,
  rupiahValue,
  validSourceKg,
} from "../lib/fieldValues";
import type { compareReceiptDocument } from "../lib/receiptDocument";
import { proposalIsCurrent, sourceDocumentGate } from "../lib/visionReview";
import { voiceProposalIsCurrent } from "../lib/voiceReview";
import type { SimulationOutcome } from "../services/simulation";
import type { Draft, Source, Step } from "../types";
import type { DocumentType } from "../vision/contract";
import type { VoiceResult } from "../voice/contract";

export type SourceStepProps = {
  /** Catatan timbang atau nota penjualan; keduanya memakai layar yang sama. */
  kind: "weighing" | "receipt";
  draft: Draft;
  step: Step;
  setStep: (step: Step) => void;
  setSourceModal: (kind: "weighing" | "receipt" | null) => void;
  tab: "data" | "source";
  setTab: (tab: "data" | "source") => void;
  mode: "text" | "photo" | "voice";
  setMode: (mode: "text" | "photo" | "voice") => void;
  reading: boolean;
  setReading: (reading: boolean) => void;
  readMessage: string;
  setReadMessage: (message: string) => void;
  readOutcome: SimulationOutcome;
  setReadOutcome: (outcome: SimulationOutcome) => void;
  readFailed: boolean;
  setReadFailed: (failed: boolean) => void;
  uploading: "weighing" | "receipt" | null;
  setUploading: (kind: "weighing" | "receipt" | null) => void;
  readingMode: "real" | "demo";
  visionStatusMessage: string;
  /** Membuka persetujuan pengiriman sumber ke AI; tidak ada yang dikirim tanpa persetujuan. */
  setConsentKind: (kind: DocumentType | null) => void;
  readRetryable: boolean;
  sourceConfirming: DocumentType | null;
  retryWait: boolean;
  fileRequest: RefObject<number>;
  heading: RefObject<HTMLHeadingElement | null>;
  cancelVision: () => void;
  update: (next: Draft) => void;
  invalidate: (next: Draft) => Draft;
  editRow: (kind: "weighing" | "receipt", id: string, field: "name" | "kg" | "price" | "sourceSubtotal", value: string) => void;
  changeSource: (kind: "weighing" | "receipt", source: Source) => void;
  receiveVoice: (result: VoiceResult, capture: VoiceCapture) => boolean;
  importVoice: (indices: number[], edits: VoiceEdits) => void;
  /** Usulan AI masuk ke form hanya lewat pilihan eksplisit pengguna. */
  applyProposal: (kind: DocumentType, indices: number[]) => void;
  simulate: (kind: "weighing" | "receipt") => void;
  confirmSource: (kind: DocumentType) => Promise<void>;
  sourceValid: (kind: "weighing" | "receipt") => boolean;
  /** Total nota yang dihitung kode, bukan hasil baca AI. */
  total: ReceiptTotals;
  documentComparison: ReturnType<typeof compareReceiptDocument>;
  receiptAmountHint: string;
  upload: (kind: "weighing" | "receipt", file?: File) => Promise<void>;
  sourceView: (kind: "weighing" | "receipt") => ReactNode;
  replaceDocument: (kind: DocumentType) => void;
};

export function SourceStep({
  kind,
  draft,
  step,
  setStep,
  setSourceModal,
  tab,
  setTab,
  mode,
  setMode,
  reading,
  setReading,
  readMessage,
  setReadMessage,
  readOutcome,
  setReadOutcome,
  readFailed,
  setReadFailed,
  uploading,
  setUploading,
  readingMode,
  visionStatusMessage,
  setConsentKind,
  readRetryable,
  sourceConfirming,
  retryWait,
  fileRequest,
  heading,
  cancelVision,
  update,
  invalidate,
  editRow,
  changeSource,
  receiveVoice,
  importVoice,
  applyProposal,
  simulate,
  confirmSource,
  sourceValid,
  total,
  documentComparison,
  receiptAmountHint,
  upload,
  sourceView,
  replaceDocument,
}: SourceStepProps) {
  const isReceipt = kind === "receipt";
  const documentGate = sourceDocumentGate(draft, kind);
  const filledRows = draft[kind].filter(
    (r) =>
      r.name.trim() ||
      r.kg.trim() ||
      r.price.trim() ||
      r.sourceSubtotal?.trim() ||
      r.extractionRequestId,
  ).length;
  const formCountLabel = filledRows
    ? `${filledRows} baris isian untuk ditinjau`
    : `${draft[kind].length} baris isian manual`;
  const confirmed = isReceipt
    ? draft.receiptConfirmed
    : draft.weighingConfirmed;
  return (
    <>
      <div className="page-intro">
        <div>
          <p className="eyebrow">
            Langkah {isReceipt ? "2" : "1"} dari 4
          </p>
          <h1 ref={heading} tabIndex={-1}>
            {isReceipt ? "Nota penjualan" : "Catatan timbang"}
          </h1>
          <p>
            {isReceipt
              ? "Foto nota, cek angka, lalu konfirmasi."
              : "Foto catatan timbang, cek angka, lalu konfirmasi."}
          </p>
        </div>
        <Badge tone={confirmed ? "success" : ""}>
          {confirmed ? "Dikonfirmasi pengguna" : "Menunggu tinjauan"}
        </Badge>
      </div>
      {draft.demo && (
        <div className="callout info demo-callout">
          <Icon name="source" />
          <p>
            <strong>Contoh sintetis.</strong> Pembacaan disimulasikan; tidak
            ada data yang dikirim ke AI.
            {isReceipt && (
              <>
                {" "}
                <strong>Berat Teri belum terbaca:</strong> lihat sumber, lalu
                isi 10 kg.
              </>
            )}
          </p>
        </div>
      )}
      <div className="review-grid">
        <section
          className={`panel source-panel ${tab === "source" ? "mobile-active" : ""}`}
        >
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Langkah A</p>
              <h2>
                <span className="step-dot">1</span> Ambil sumber
              </h2>
            </div>
            <button
              className="text-button"
              onClick={() => setSourceModal(kind)}
            >
              <Icon name="source" size={16} /> Perbesar
            </button>
          </div>
          <div className="segmented" aria-label="Jenis sumber">
            <button
              className={mode === "text" ? "selected" : ""}
              onClick={() => {
                setMode("text");
                cancelVision();
                fileRequest.current++;
                setReading(false);
                setUploading(null);
              }}
            >
              <Icon name="text" size={16} /> Teks
            </button>
            <button
              className={mode === "photo" ? "selected" : ""}
              onClick={() => {
                setMode("photo");
                cancelVision();
                fileRequest.current++;
                setReading(false);
                setUploading(null);
              }}
            >
              <Icon name="camera" size={16} /> Foto
            </button>
            {!isReceipt && !draft.demo && (
              <button
                className={mode === "voice" ? "selected" : ""}
                onClick={() => {
                  cancelVision();
                  fileRequest.current++;
                  setReading(false);
                  setUploading(null);
                  setMode("voice");
                }}
              >
                <Icon name="mic" size={16} /> Suara
              </button>
            )}
          </div>
          {draft.demo ? (
            sourceView(kind)
          ) : mode === "voice" && !isReceipt ? (
            <VoiceInput
              context={{
                draftId: draft.id,
                revision: draft.revision,
                sourceCapturedAt: draft.sources.weighing.capturedAt,
                uiKey: `${step}:${tab}:${mode}`,
              }}
              restoredResult={
                voiceProposalIsCurrent(draft)
                  ? draft.voiceExtraction?.result
                  : undefined
              }
              onResult={receiveVoice}
              onReview={() => {
                setTab("data");
                requestAnimationFrame(() =>
                  document
                    .querySelector('[data-testid="voice-proposals"]')
                    ?.scrollIntoView({ block: "start" }),
                );
              }}
              onFallback={(nextMode) => {
                setMode(nextMode);
                setTab("source");
              }}
            />
          ) : (
            <>
              {mode === "text" ? (
                <label className="field">
                  Teks sumber
                  <textarea
                    rows={7}
                    maxLength={20000}
                    placeholder={"Contoh: Teri 12 kg\nTongkol 8 kg"}
                    value={draft.sources[kind].text}
                    onChange={(e) =>
                      changeSource(kind, {
                        text: e.target.value,
                        filename: "Sumber teks pengguna",
                        capturedAt: now(),
                      })
                    }
                  />
                </label>
              ) : (
                <>
                  <label className="upload-zone">
                    <span className="upload-orb">
                      <Icon name="camera" size={30} />
                    </span>
                    <strong>
                      {draft.sources[kind].image
                        ? "Ganti foto"
                        : isReceipt
                          ? "Foto nota penjualan"
                          : "Foto catatan timbang"}
                    </strong>
                    <span>Ambil foto atau pilih dari galeri · maks 4 MB</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        upload(kind, e.target.files?.[0]);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {draft.sources[kind].image && (
                    <>
                      {sourceView(kind)}
                      <button
                        className="text-button source-remove"
                        onClick={() =>
                          changeSource(kind, {
                            text: "",
                            filename: "",
                            capturedAt: now(),
                          })
                        }
                      >
                        Hapus foto sumber
                      </button>
                    </>
                  )}
                </>
              )}
            </>
          )}
          {uploading === kind && (
            <div className="source-ready" role="status">
              <OmbakPintar mood="processing" />
              <div>
                <strong>Menyiapkan foto…</strong>
                <p>
                  Foto sedang dibuka di perangkat. Belum ada pembacaan AI.
                </p>
              </div>
            </div>
          )}
          {!uploading && draft.sources[kind].filename && (
            <div className="source-ready">
              <OmbakPintar mood="idle" />
              <div>
                <strong>Sumber siap ditinjau</strong>
                <p>
                  {draft.demo
                    ? "Data contoh sintetis. Isian tetap perlu Anda periksa."
                    : "Sumber dipilih. Isi manual atau minta AI setelah menyetujui pengiriman."}
                </p>
              </div>
            </div>
          )}
          {!(mode === "voice" && !isReceipt) && (
            <button
              className="button ai full"
              onClick={() =>
                draft.demo ? simulate(kind) : setConsentKind(kind)
              }
              disabled={
                reading ||
                uploading === kind ||
                (!draft.sources[kind].image &&
                  !draft.sources[kind].text.trim())
              }
            >
              {reading ? (
                <>
                  <span className="spinner" />{" "}
                  {readingMode === "demo"
                    ? "Simulasi membaca…"
                    : "Menunggu hasil AI…"}
                </>
              ) : draft.demo ? (
                <>
                  <Icon name="sparkle" size={18} /> Simulasi baca AI
                </>
              ) : (
                <>
                  <Icon name="sparkle" size={18} /> Baca dengan AI
                </>
              )}
            </button>
          )}
          <p className="meta">
            {draft.demo
              ? "Usulan perlu konfirmasi Anda."
              : visionStatusMessage}
          </p>
          {draft.demo && (
            <details className="demo-controls">
              <summary>Keadaan pembacaan contoh</summary>
              <label className="field">
                Hasil simulasi
                <select
                  value={readOutcome}
                  onChange={(e) => {
                    cancelVision();
                    setReading(false);
                    setReadOutcome(e.target.value as SimulationOutcome);
                  }}
                >
                  <option value="success">Selesai · tinjau usulan</option>
                  <option value="partial">Hasil sebagian</option>
                  <option value="empty">Tidak ada baris terbaca</option>
                  <option value="timeout">Waktu tunggu habis</option>
                  <option value="quota">Batas layanan</option>
                  <option value="invalid">Hasil tidak valid</option>
                </select>
              </label>
              <p className="meta">
                Hanya demonstrasi keadaan. Tidak mengirim data, mengganti
                sumber, atau menimpa koreksi.
              </p>
            </details>
          )}
        </section>
        <section
          className={`panel data-panel ${tab === "data" ? "mobile-active" : ""}`}
        >
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{formCountLabel}</p>
              <h2>
                <span className="step-dot">2</span> Periksa angka
              </h2>
            </div>
            <Badge>
              {draft.demo
                ? "Simulasi AI"
                : draft[kind].some((r) => r.extractionRequestId)
                  ? "AI + tinjauan pengguna"
                  : draft.rawExtractions?.[kind]
                    ? proposalIsCurrent(draft, kind)
                      ? "Usulan hasil AI"
                      : "Arsip usulan AI"
                    : "Isi manual"}
            </Badge>
          </div>
          {reading && (
            <AIVisionProcessing
              mode={readingMode}
              source={draft.sources[kind]}
              documentLabel={isReceipt ? "Nota penjualan" : "Catatan timbang"}
              onManual={() => {
                cancelVision();
                fileRequest.current++;
                setReading(false);
                setReadMessage(
                  "Pembacaan dibatalkan. Isian Anda tetap dipertahankan.",
                );
              }}
            />
          )}
          {readMessage && (
            <div
              className={`callout vision-result-message ${readFailed ? "error" : "info"}`}
              role={readFailed ? "alert" : "status"}
            >
              <OmbakPintar
                mood={
                  readFailed
                    ? "error"
                    : draft[kind].some((r) => !r.kg)
                      ? "review"
                      : "idle"
                }
              />
              <div>
                <strong>
                  {!documentGate.canConfirm
                    ? "Jenis sumber perlu diperiksa"
                    : readFailed
                      ? draft.demo
                        ? "Pembacaan contoh perlu perhatian"
                        : "Sumber perlu diperiksa"
                      : draft[kind].some((r) => !r.kg)
                        ? "Ada nilai yang perlu diperiksa"
                        : "Lanjutkan dengan meninjau isian"}
                </strong>
                <p>{readMessage}</p>
                {readFailed && (
                  <div className="recovery-actions">
                    <button
                      className="text-button"
                      onClick={() =>
                        draft.demo ? simulate(kind) : setConsentKind(kind)
                      }
                      disabled={!draft.demo && (retryWait || !readRetryable)}
                    >
                      {!draft.demo && retryWait
                        ? "Tunggu sebelum mencoba lagi"
                        : "Coba baca lagi"}
                    </button>
                    <button
                      className="text-button"
                      onClick={() => {
                        cancelVision();
                        fileRequest.current++;
                        setReading(false);
                        setReadFailed(false);
                        setReadMessage(
                          "Isi manual dipilih. Sumber dan koreksi tetap dipertahankan.",
                        );
                        document
                          .querySelector<HTMLInputElement>(
                            ".data-panel input",
                          )
                          ?.focus();
                      }}
                    >
                      Isi manual
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          {kind === "weighing" &&
            draft.voiceExtraction &&
            !draft.demo &&
            voiceProposalIsCurrent(draft) && (
              <VoiceProposalReview
                key={draft.voiceExtraction.result.vision.requestId}
                draft={draft}
                onApply={importVoice}
              />
            )}
          {draft.rawExtractions?.[kind] &&
            !draft.demo &&
            !(kind === "weighing" && voiceProposalIsCurrent(draft)) && (
              <VisionProposal
                key={draft.rawExtractions[kind]!.result.requestId}
                result={draft.rawExtractions[kind]!.result}
                rows={draft[kind]}
                stale={!proposalIsCurrent(draft, kind)}
                onApply={(indices) => applyProposal(kind, indices)}
                onReplace={() => replaceDocument(kind)}
                onRetry={() => setConsentKind(kind)}
              />
            )}
          {reading && (
            <p className="previous-fields-label">
              Isian sebelumnya tetap tersedia di bawah. Pembacaan belum
              menerapkan hasil baru.
            </p>
          )}
          <div
            className={`row-list ${readMessage && !readFailed && !reading ? "vision-results-visible" : ""}`}
          >
            {draft[kind].map((r, i) => (
              <div className="fish-row" key={r.id}>
                <div className="fish-row-head">
                  <span className="row-index">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Badge>{r.provenance}</Badge>
                  <button
                    className="text-button small row-source-link"
                    onClick={() => setSourceModal(kind)}
                    aria-label={`Lihat sumber ${r.name || `baris ${i + 1}`}`}
                  >
                    <Icon name="source" size={16} /> Sumber
                  </button>
                  {(draft[kind].length > 1 || !!r.extractionRequestId) && (
                    <button
                      className="icon-button"
                      aria-label={`Hapus baris ${i + 1}`}
                      onClick={() =>
                        update(
                          invalidate({
                            ...draft,
                            [kind]:
                              draft[kind].length === 1
                                ? [row()]
                                : draft[kind].filter((v) => v.id !== r.id),
                            [`${kind}Confirmed`]: false,
                          }),
                        )
                      }
                    >
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </div>
                <div
                  className={`field-grid ${isReceipt ? "receipt-fields" : ""}`}
                >
                  <label className="field">
                    Jenis ikan
                    <input
                      value={r.name}
                      onChange={(e) =>
                        editRow(kind, r.id, "name", e.target.value)
                      }
                      placeholder="Nama ikan"
                    />
                  </label>
                  <label className="field">
                    Berat (kg)
                    <input
                      inputMode="decimal"
                      aria-invalid={!!r.kg.trim() && !validSourceKg(r.kg)}
                      aria-describedby={
                        !r.kg.trim() || !validSourceKg(r.kg)
                          ? `${kind}-${r.id}-kg-hint`
                          : undefined
                      }
                      className={!r.kg.trim() ? "uncertain-input" : ""}
                      value={r.kg}
                      onChange={(e) =>
                        editRow(kind, r.id, "kg", e.target.value)
                      }
                      placeholder="Belum diketahui"
                    />
                    {!r.kg.trim() && (
                      <small
                        id={`${kind}-${r.id}-kg-hint`}
                        className="caution-text"
                      >
                        Perlu diperiksa di sumber
                      </small>
                    )}
                    {!!r.kg.trim() && !validSourceKg(r.kg) && (
                      <small
                        id={`${kind}-${r.id}-kg-hint`}
                        className="error-text"
                      >
                        Berat harus lebih dari 0 kg, maksimal 3 angka desimal.
                      </small>
                    )}
                  </label>
                  {isReceipt && (
                    <label className="field">
                      Harga / kg (Rp)
                      <input
                        inputMode="numeric"
                        aria-invalid={
                          !!r.price.trim() && rupiahValue(r.price) === null
                        }
                        aria-describedby={
                          !r.price.trim() || rupiahValue(r.price) === null
                            ? `${kind}-${r.id}-price-hint`
                            : undefined
                        }
                        value={r.price}
                        onChange={(e) =>
                          editRow(kind, r.id, "price", e.target.value)
                        }
                        placeholder="Belum diketahui"
                      />
                      {!r.price.trim() && (
                        <small id={`${kind}-${r.id}-price-hint`}>
                          Belum diketahui · membatasi hitungan Rupiah
                        </small>
                      )}
                      {!!r.price.trim() && rupiahValue(r.price) === null && (
                        <small
                          id={`${kind}-${r.id}-price-hint`}
                          className="error-text"
                        >
                          Harga harus berupa Rupiah bulat 0 atau lebih, tanpa
                          tanda pemisah.
                        </small>
                      )}
                    </label>
                  )}
                </div>
                {isReceipt && r.extractionRequestId && (
                  <label className="field source-amount-field">
                    Subtotal dari pembacaan AI (Rp), dapat dikoreksi
                    <input
                      inputMode="numeric"
                      value={r.sourceSubtotal || ""}
                      aria-invalid={
                        !!r.sourceSubtotal?.trim() &&
                        rupiahValue(r.sourceSubtotal) === null
                      }
                      aria-describedby={kind + "-" + r.id + "-subtotal-hint"}
                      placeholder="Belum diketahui"
                      onChange={(event) =>
                        editRow(
                          kind,
                          r.id,
                          "sourceSubtotal",
                          event.target.value,
                        )
                      }
                    />
                    <small
                      id={kind + "-" + r.id + "-subtotal-hint"}
                      className={
                        r.sourceSubtotal?.trim() &&
                        rupiahValue(r.sourceSubtotal) === null
                          ? "error-text"
                          : ""
                      }
                    >
                      {r.sourceSubtotal?.trim() &&
                      rupiahValue(r.sourceSubtotal) === null
                        ? "Subtotal harus Rupiah bulat 0 atau lebih."
                        : "Nominal sumber terpisah. Harga per kg tidak ditebak dari subtotal."}
                    </small>
                  </label>
                )}
                {r.extractionRequestId && (
                  <RowProvenance row={r} confirmed={confirmed} />
                )}
              </div>
            ))}
          </div>
          <button
            className="text-button add-row"
            onClick={() =>
              update(
                invalidate({
                  ...draft,
                  [kind]: [...draft[kind], row()],
                  [`${kind}Confirmed`]: false,
                }),
              )
            }
          >
            <Icon name="plus" /> Tambah jenis ikan
          </button>
          {isReceipt && (
            <section
              className="nota-amounts"
              aria-label="Total, potongan, dan biaya nota"
            >
              <div
                className="nota-totals"
                aria-label="Subtotal dan total akhir nota"
              >
                <div>
                  <span>Subtotal item terhitung</span>
                  <strong>{money(total.subtotalRupiah)}</strong>
                </div>
                <div className="nota-final">
                  <span>Total akhir nota terhitung</span>
                  <strong>{money(total.totalRupiah)}</strong>
                </div>
              </div>
              {total.totalRupiah === null && (
                <p className="nota-hint">{receiptAmountHint}</p>
              )}
              <h3>Potongan dan biaya</h3>
              <p className="meta">
                Kosong berarti belum diketahui. Isi 0 hanya bila Anda
                memastikan tidak ada.
              </p>
              <div className="fee-grid">
                {(
                  [
                    ["deduction", "Potongan", "potongan"],
                    ["charges", "Biaya tambahan", "biaya tambahan"],
                  ] as const
                ).map(([field, label, lower]) => {
                  const value = draft[field];
                  const state = feeState(value, draft.receiptConfirmed);
                  const describedBy = `${field}-state`;
                  return (
                    <div className="fee-field" key={field}>
                      <label className="field">
                        {label} (Rp)
                        <input
                          inputMode="numeric"
                          value={value}
                          aria-invalid={state === "invalid"}
                          aria-describedby={describedBy}
                          onChange={(e) =>
                            update(
                              invalidate({
                                ...draft,
                                [field]: e.target.value,
                                receiptConfirmed: false,
                              }),
                            )
                          }
                          placeholder="Belum diketahui"
                        />
                      </label>
                      <span
                        id={describedBy}
                        className={`fee-state ${state}`}
                      >
                        {state === "invalid"
                          ? `${label} harus Rupiah bulat 0 atau lebih, tanpa tanda pemisah.`
                          : feeStateLabel(value, draft.receiptConfirmed)}
                      </span>
                      {state === "unknown" && (
                        <button
                          type="button"
                          className="text-button fee-zero"
                          onClick={() =>
                            update(
                              invalidate({
                                ...draft,
                                [field]: "0",
                                receiptConfirmed: false,
                              }),
                            )
                          }
                        >
                          Isi Rp0 untuk {lower}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {isReceipt && (
            <ReceiptDocumentSummary
              draft={draft}
              comparison={documentComparison}
              hint={receiptAmountHint}
              collapsible
            />
          )}
          {!documentGate.canConfirm && (
            <div className="callout document-blocked" role="alert">
              <div>
                <strong>
                  Konfirmasi untuk langkah ini belum dapat dilakukan.
                </strong>
                <p>{documentGate.message}</p>
                <p>
                  Isian manual tetap dapat disiapkan. Konfirmasi tetap
                  terkunci sampai sumber diganti atau pembacaan ulang
                  memastikan jenis yang sesuai.
                </p>
                <button
                  className="text-button"
                  onClick={() => replaceDocument(kind)}
                >
                  Ganti dokumen
                </button>
              </div>
            </div>
          )}{" "}
          <div className="confirmation-note">
            <Icon name="check" />
            <p>
              Konfirmasi berarti Anda sudah meninjau isian terhadap sumber,
              bukan verifikasi pihak luar.
            </p>
          </div>
        </section>
      </div>
      <div className="action-bar sticky-actions">
        <button
          className="button secondary"
          onClick={() => setStep(isReceipt ? "weighing" : "home")}
          aria-label="Kembali"
        >
          <Icon name="arrow-left" size={18} />
          <span className="btn-label">Kembali</span>
        </button>
        <div>
          <span className="meta">
            {sourceValid(kind)
              ? "Siap untuk Anda konfirmasikan"
              : "Lengkapi sumber, nama, dan angka terlebih dahulu"}
          </span>
          <button
            className="button primary"
            disabled={!sourceValid(kind) || !!sourceConfirming}
            onClick={() => confirmSource(kind)}
          >
            {sourceConfirming === kind
              ? "Menyimpan konfirmasi…"
              : `Konfirmasi ${isReceipt ? "nota" : "catatan timbang"}`}{" "}
            <Icon name="arrow" />
          </button>
        </div>
      </div>
    </>
  );
}
