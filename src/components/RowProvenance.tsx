import type { Row } from "../types";
import { rowWeightProvenance } from "../lib/visionReview";
import { reviewLanguage } from "../lib/reviewLanguage";
import { formatKg } from "../lib/format";

export function RowProvenance({
  row,
  confirmed,
}: {
  row: Row;
  confirmed: boolean;
}) {
  const value = rowWeightProvenance(row);
  return (
    <section
      className="row-provenance"
      aria-label={`Asal data dan koreksi ${row.name || "baris ikan"}`}
    >
      <h3>Asal data dan koreksi</h3>
      <p>
        Berat terbaca AI:{" "}
        <strong>
          {row.rawWeight || "Belum diketahui"}{" "}
          {row.rawUnit || "(unit belum diketahui)"}
        </strong>
      </p>
      <p>
        {value.status === "changed"
          ? "Berat setelah koreksi"
          : value.status === "filled"
            ? "Berat diisi pengguna"
            : "Isian berat saat ini"}
        : <strong>{formatKg(value.currentWeightKg)}</strong>
        {value.status === "same" && " · Sama dengan usulan AI saat ini."}
      </p>
      <p>
        Status:{" "}
        <strong>
          {confirmed
            ? "Dikonfirmasi pengguna"
            : row.provenance === "Dikoreksi pengguna"
              ? "Dikoreksi pengguna · belum dikonfirmasi"
              : "Perlu konfirmasi pengguna"}
        </strong>
      </p>
      <p className="meta">
        Pembacaan AI dapat keliru dan bukan bukti angka asli pada dokumen.
        Periksa sumber sebelum konfirmasi.
      </p>
      {row.extractionIssues?.length ? (
        <ul>
          {row.extractionIssues.map((issue, index) => (
            <li key={index}>{reviewLanguage(issue)}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
