import { useState } from "react";
import type { Draft } from "../types";
import { voiceProposalIsCurrent } from "../lib/voiceReview";
import { proposalImportState, sourceDocumentGate } from "../lib/visionReview";
import { normalizeFishName } from "../lib/matching";
import { parseKilograms } from "../lib/examination";
import { Badge } from "./ui";

export type VoiceEdits = Record<number, { name: string; kg: string }>;
export function VoiceProposalReview({
  draft,
  onApply,
}: {
  draft: Draft;
  onApply: (indices: number[], edits: VoiceEdits) => void;
}) {
  const voice = draft.voiceExtraction!;
  const result = voice.result;
  const state = proposalImportState(draft.weighing, result.vision);
  const current =
    voiceProposalIsCurrent(draft) &&
    sourceDocumentGate(draft, "weighing").canConfirm;
  const [edits, setEdits] = useState<VoiceEdits>(() =>
    Object.fromEntries(
      result.vision.normalized.items.map((item, index) => [
        index,
        {
          name:
            result.unresolvedFields.some(
              (issue) => issue.itemIndex === index && issue.field === "name",
            ) || !normalizeFishName(item.itemName)
              ? ""
              : item.itemName || "",
          kg:
            result.unresolvedFields.some(
              (issue) =>
                issue.itemIndex === index &&
                (issue.field === "weight" || issue.field === "unit"),
            ) || item.weightKg === null
              ? ""
              : String(item.weightKg),
        },
      ]),
    ),
  );
  const [selected, setSelected] = useState<number[]>(state.eligibleIndices);
  const eligible = selected.filter((index) =>
    state.eligibleIndices.includes(index),
  );
  const invalid = (index: number) => {
    const value = edits[index];
    const weight = parseKilograms(value.kg);
    return (
      (!!value.name.trim() && normalizeFishName(value.name) === null) ||
      (!!value.kg.trim() && (weight === null || weight <= 0))
    );
  };
  const complete =
    result.vision.normalized.items.length > 0 &&
    state.appliedIndices.length === result.vision.normalized.items.length;
  return (
    <section
      className="panel voice-proposal-review"
      data-testid="voice-proposals"
      aria-label="Tinjau transkrip dan usulan suara"
    >
      <p className="eyebrow">HASIL SUARA Â· BELUM DIKONFIRMASI</p>
      <h2>Transkrip dan usulan catatan timbang</h2>
      <div className="voice-result-transcript">
        <h3>Ucapan yang ditranskrip AI</h3>
        <p>{result.transcript || "Ucapan belum dapat dikenali."}</p>
      </div>
      <p className="meta">
        Periksa dan sunting usulan sebelum memilih baris. Suntingan usulan
        disimpan setelah ditambahkan ke form; transkrip asli tetap
        dipertahankan.
      </p>
      {!current && (
        <div className="callout document-blocked" role="alert">
          Hasil suara tidak lagi sesuai sumber aktif atau belum dapat digunakan.
          Rekam lagi atau pakai Teks/Foto; isian sebelumnya tetap ada.
        </div>
      )}
      {!!state.previousExtractionRows && (
        <div className="callout info">
          <p>
            Form masih memuat baris dari pembacaan sebelumnya. Isian dan koreksi
            dipertahankan; periksa baris lama sebelum mengimpor hasil rekaman
            baru agar tidak ganda.
          </p>
        </div>
      )}
      <div className="voice-proposal-items">
        {result.vision.normalized.items.map((item, index) => {
          const applied = state.appliedIndices.includes(index);
          const blocked = state.blockedIndices.includes(index);
          const issues = result.unresolvedFields.filter(
            (issue) => issue.itemIndex === index,
          );
          const nameError =
            !!edits[index].name.trim() &&
            normalizeFishName(edits[index].name) === null;
          const parsed = parseKilograms(edits[index].kg);
          const weightError =
            !!edits[index].kg.trim() && (parsed === null || parsed <= 0);
          return (
            <article
              key={index}
              data-voice-item={index}
              data-import-status={applied ? "applied" : "eligible"}
            >
              <label className="proposal-choice">
                <input
                  type="checkbox"
                  checked={applied || eligible.includes(index)}
                  disabled={
                    !current ||
                    applied ||
                    blocked ||
                    !!state.previousExtractionRows
                  }
                  onChange={(event) =>
                    setSelected((values) =>
                      event.target.checked
                        ? [...values, index]
                        : values.filter((value) => value !== index),
                    )
                  }
                />
                <span>Usulan {index + 1}</span>
                <Badge>
                  {applied ? "Sudah ditambahkan" : "Perlu ditinjau"}
                </Badge>
              </label>
              <div className="field-grid">
                <label className="field">
                  Jenis ikan
                  <input
                    aria-label={`Jenis ikan usulan suara ${index + 1}`}
                    value={edits[index].name}
                    disabled={applied}
                    placeholder="Belum diketahui"
                    aria-invalid={nameError}
                    onChange={(event) =>
                      setEdits((values) => ({
                        ...values,
                        [index]: { ...values[index], name: event.target.value },
                      }))
                    }
                  />
                  {nameError && (
                    <small className="error-text">
                      Nama belum jelas. Periksa transkrip; jangan menebak jenis
                      ikan.
                    </small>
                  )}
                </label>
                <label className="field">
                  Berat (kg)
                  <input
                    aria-label={`Berat usulan suara ${index + 1}`}
                    inputMode="decimal"
                    value={edits[index].kg}
                    disabled={applied}
                    placeholder="Belum diketahui"
                    aria-invalid={weightError}
                    onChange={(event) =>
                      setEdits((values) => ({
                        ...values,
                        [index]: { ...values[index], kg: event.target.value },
                      }))
                    }
                  />
                  {weightError && (
                    <small className="error-text">
                      Gunakan berat lebih dari 0, maksimal 3 desimal.
                    </small>
                  )}
                </label>
              </div>
              {issues.length > 0 && (
                <ul className="proposal-warnings">
                  {issues.map((issue, i) => (
                    <li key={i}>{issue.reason}</li>
                  ))}
                </ul>
              )}
              <p className="meta">
                Pembacaan awal: {item.itemName || "nama belum diketahui"} Â·{" "}
                {item.weightKg === null
                  ? "berat belum diketahui"
                  : `${item.weightKg.toLocaleString("id-ID")} kg`}
                .{" "}
                {applied
                  ? "Suntingan berikutnya dilakukan pada form di bawah."
                  : "Bidang kosong tetap perlu diselesaikan sebelum konfirmasi catatan timbang."}
              </p>
            </article>
          );
        })}
      </div>
      {!result.vision.normalized.items.length && (
        <p className="voice-feedback">
          Belum ada usulan suara yang dapat ditambahkan. Tidak ada baris ikan
          yang dibuat otomatis; rekam ulang atau gunakan Teks/Foto.
        </p>
      )}
      {complete ? (
        <p className="proposal-complete">
          Semua usulan sudah ditambahkan. Tinjau form dan konfirmasikan catatan
          timbang secara terpisah.
        </p>
      ) : (
        <button
          className="button secondary full"
          data-voice-action="import"
          disabled={!current || !eligible.length || eligible.some(invalid)}
          onClick={() => {
            onApply(
              eligible,
              Object.fromEntries(
                eligible.map((index) => [index, edits[index]]),
              ),
            );
            setSelected([]);
          }}
        >
          Tambahkan {eligible.length} usulan suara terpilih ke form
        </button>
      )}
    </section>
  );
}
