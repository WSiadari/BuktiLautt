import type { Source } from "../types";
import { OmbakPintar } from "./OmbakPintar";

export function AIVisionProcessing({
  source,
  documentLabel,
  onManual,
  mode = "demo",
}: {
  source: Source;
  documentLabel: string;
  onManual: () => void;
  mode?: "demo" | "real";
}) {
  return (
    <section
      className="vision-processing"
      aria-label={
        mode === "demo"
          ? "Pembacaan contoh sedang berlangsung"
          : "Permintaan pembacaan AI sedang berlangsung"
      }
    >
      <div className="vision-processing-top">
        <span className="vision-mode">
          <span />{" "}
          {mode === "demo"
            ? "Simulasi AI Vision"
            : "AI Vision · layanan eksternal"}
        </span>
        <span className="vision-indeterminate" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="vision-processing-body">
        <div className="vision-document" aria-hidden="true">
          {source.image ? (
            <img src={source.image} alt="" />
          ) : (
            <pre>{source.text}</pre>
          )}
          <span className="vision-scan-line" />
          <span className="vision-document-caption">{documentLabel}</span>
        </div>
        <div className="vision-status">
          <OmbakPintar mood="processing" size="medium" />
          <div role="status">
            <h3>
              {mode === "demo"
                ? "Membaca sumber contoh…"
                : "Menunggu hasil pembacaan…"}
            </h3>
            <p>
              {mode === "demo"
                ? "Menyiapkan usulan contoh untuk ditinjau."
                : "Menunggu pemeriksaan jenis dan pembacaan isi dokumen."}{" "}
              Sumber dan koreksi tetap dipertahankan.
            </p>
          </div>
        </div>
      </div>
      <div className="vision-skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="vision-processing-footer">
        <p>Belum ada hasil baru diterapkan.</p>
        <button className="text-button" onClick={onManual}>
          Lanjut isi manual
        </button>
      </div>
    </section>
  );
}
