import { Fragment, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import type { Draft, Pair } from "../types";
import { parseKilograms, type PairResult } from "../lib/examination";
import { normalizeFishName, validatePair } from "../lib/matching";
import { Icon } from "./ui";

const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });
const weight = (value: number | null) => value === null ? "Belum diketahui" : number.format(value) + " kg";

export function PairLedger({ draft, pairResult, errors, onChange, onEvidence, onAdjust, onExplain, receiptNeedsDecision, children }: {
  draft: Draft;
  pairResult: (pair: Pair) => PairResult;
  errors: Record<string, string>;
  onChange: (id: string, patch: Partial<Pair>) => void;
  onEvidence: (kind: "weighing" | "receipt") => void;
  onAdjust: (pair: Pair) => void;
  onExplain: (pair: Pair) => void;
  receiptNeedsDecision: boolean;
  children: ReactNode;
}) {
  const changedRow = useRef<string | null>(null);
  function changeDecision(pair: Pair, decision: Pair["decision"]) {
    changedRow.current = pair.weighId;
    onChange(pair.weighId, decision === "unmatched" ? {decision, receiptId:""} : {decision});
  }
  useLayoutEffect(() => {
    if (!changedRow.current) return;
    const row = document.getElementById("inspection-pair-" + changedRow.current);
    changedRow.current = null;
    if (row && document.activeElement === document.body) (row.querySelector("summary") ?? row).focus({preventScroll:true});
  }, [draft]);
  const groups = useMemo(() => {
    const rows = draft.pairs.map(pair => {
      const w = draft.weighing.find(row => row.id === pair.weighId)!;
      const receipt = draft.receipt.find(row => row.id === pair.receiptId);
      const validation = validatePair(draft, w.id, pair.receiptId);
      const confirmed = pair.decision === "confirmed" && !pair.reviewIssue && validation.valid;
      const review = !!pair.reviewIssue || (pair.decision === "confirmed" && !validation.valid);
      const compatibleName = normalizeFishName(w.name);
      const options = draft.receipt.flatMap((row, index) => {
        if (!compatibleName || normalizeFishName(row.name) !== compatibleName) return [];
        const owner = draft.pairs.find(other => other.weighId !== w.id && other.receiptId === row.id && other.decision !== "unmatched");
        return [{row, line:index+1, owner:owner && draft.weighing.findIndex(other=>other.id===owner.weighId)+1}];
      });
      const r = options.find(option=>option.row.id===pair.receiptId)?.row;
      const result = pairResult(pair);
      // Nomor baris membedakan jenis ikan yang sama (mis. dua baris Teri).
      const line = draft.weighing.findIndex(row => row.id === w.id) + 1;
      const receiptLine = r ? draft.receipt.findIndex(row => row.id === r.id) + 1 : 0;
      const duplicate = draft.weighing.filter(row => compatibleName && normalizeFishName(row.name) === compatibleName).length > 1;
      return {pair, w, r, receipt, validation, options, confirmed, review, result, line, receiptLine, duplicate};
    });
    const settled = (row: typeof rows[number]) => row.confirmed && row.result.status === "ready" && row.result.remainingKg === 0;
    const unmatched = (row: typeof rows[number]) => row.pair.decision === "unmatched" && !row.review;
    return [
      {title:"Perlu keputusan", rows:rows.filter(row=>!settled(row) && !unmatched(row))},
      {title:"Sudah cocok", rows:rows.filter(settled)},
      {title:"Tanpa pasangan", rows:rows.filter(unmatched)},
    ];
  }, [draft, pairResult]);

  return groups.map(({title,rows},index) => <Fragment key={title}>
    {rows.length > 0 && <section className="ledger-section" aria-label={title}>
      <h2 className="ledger-group">{title} <span>{rows.length}</span></h2>
      {rows.map(({pair:p,w,r,receipt,options,validation,confirmed,review,result,line,receiptLine,duplicate}) => {
        const error = errors[w.id] || (p.receiptId && !validation.valid ? validation.message : "");
        const ready = result.status === "ready";
        const openDifference = ready && result.remainingKg !== 0;
        // Pratinjau memakai perhitungan yang sama seolah pasangan dikonfirmasi; tidak disimpan.
        const preview = !ready && r && p.decision === "pending" && validation.valid
          ? pairResult({...p, decision:"confirmed", reviewIssue: undefined}) : null;
        const previewKg = preview?.status === "ready" ? preview.initialKg : null;
        const label = w.name + (duplicate ? " baris " + line : "");
        const status = review ? "Perlu ditinjau ulang" : confirmed
          ? "Pasangan dikonfirmasi" : p.decision === "unmatched" ? "Tanpa pasangan" : "Menunggu keputusan";
        const figures = <dl className="ledger-figures">
          <div><dt>Timbang</dt><dd>{weight(parseKilograms(w.kg))}</dd><small className="ledger-ref">baris {line}</small></div>
          <div><dt>Nota</dt><dd>{r ? weight(parseKilograms(r.kg)) : "—"}</dd><small className="ledger-ref">{receiptLine ? "baris " + receiptLine : "belum dipilih"}</small></div>
          <div className={openDifference || (previewKg ?? 0) !== 0 ? "ledger-difference" : ready && result.remainingKg === 0 ? "ledger-zero" : ""}><dt>{p.adjustment && ready ? "Sisa selisih" : "Selisih"}</dt><dd>{ready ? weight(result.remainingKg) : previewKg !== null ? weight(previewKg) : "—"}</dd><small className={"ledger-ref" + (!ready && previewKg !== null ? " ledger-preview" : "")}>{!ready && previewKg !== null ? "pratinjau" : ready && result.remainingKg === 0 ? "cocok" : ready ? "terbuka" : "—"}</small></div>
        </dl>;
        const actions = <div className="ledger-detail">
          <div className="ledger-evidence">
            <button className="text-button evidence-link" onClick={()=>onEvidence("weighing")} aria-label={"Bukti timbang "+label}><Icon name="source" size={16}/>Bukti timbang</button>
            <button className="text-button evidence-link" onClick={()=>onEvidence("receipt")} aria-label={"Bukti nota "+label}><Icon name="source" size={16}/>Bukti nota</button>
          </div>
          {(p.decision === "pending" || review) && <div className="ledger-select">
            <label className="field"><span>Baris nota untuk {label}</span>
              <select aria-label={"Pasangan nota untuk "+label} value={r?.id || ""} disabled={!options.length}
                aria-invalid={!!error} aria-describedby={error ? "match-"+w.id+"-error" : undefined}
                onChange={e=>onChange(w.id,{receiptId:e.target.value,decision:"pending"})}>
                <option value="">Pilih baris nota</option>
                {options.map(({row,line,owner})=><option key={row.id} value={row.id} disabled={!!owner}>
                  {row.name} · {weight(parseKilograms(row.kg))} · baris nota {line}{owner ? " · sudah dipakai pada baris timbang "+owner : ""}
                </option>)}
              </select>
            </label>
            {!options.length && <p>Tidak ditemukan jenis ikan yang sama pada nota penjualan.</p>}
          </div>}
          {error && <p role="alert" id={"match-"+w.id+"-error"}>{error}</p>}
          {review && <div className="pair-review-note"><strong>Konfirmasi lama perlu ditinjau ulang</strong>
            <p>{p.reviewIssue || validation.message}</p>
            {receipt && <p>Baris nota sebelumnya · {receipt.name} · {weight(parseKilograms(receipt.kg))}</p>}
            {(p.adjustment || p.explanation) && <p>Penyesuaian sebelumnya tidak aktif · {p.adjustment && weight(parseKilograms(p.adjustment))} {p.explanation}</p>}
          </div>}
          {ready && p.adjustment && <p className="ledger-note">Selisih awal {weight(result.initialKg)} · Tidak terjual {weight(result.adjustmentKg)} · {p.explanation}</p>}
          {ready && result.direction === "receipt-more" && <p>Berat pada nota lebih besar daripada berat timbang.</p>}
          {confirmed && !ready && <p>{result.error || "Periksa kembali berat pada kedua sumber."}</p>}
          <div className="ledger-actions">
            {p.decision==="pending" || review ? <>
              <button className="button primary" disabled={!r || !validation.valid} onClick={()=>changeDecision(p,"confirmed")}>Konfirmasi pasangan {label}</button>
              <button className="text-button" onClick={()=>changeDecision(p,"unmatched")}>Catat tanpa pasangan</button>
            </> : <>
              {ready && (result.initialKg ?? 0)>0 && <button className="button secondary" onClick={()=>onAdjust(p)}>{p.adjustment ? "Ubah penyesuaian" : "Catat penyesuaian"}</button>}
              {confirmed && ready && <button className="text-button" onClick={()=>onExplain(p)}>Jelaskan selisih {label}</button>}
              <button className="text-button" onClick={()=>changeDecision(p,"pending")}>Ubah keputusan</button>
            </>}
          </div>
        </div>;
        const summary = <div className="ledger-summary">
          <div className="ledger-name"><h3>{w.name || "Jenis ikan belum diketahui"}</h3>
            {duplicate && <span className="ledger-line duplicate">Timbang baris {line}</span>}
            <span className={"ledger-status " + (review ? "review" : confirmed ? (openDifference ? "open" : "ok") : p.decision === "unmatched" ? "unmatched" : "pending")}>{status}</span>
            {openDifference && <span className="ledger-open-label">Selisih terbuka</span>}
            {p.adjustment && ready && <span>Penyesuaian {weight(result.adjustmentKg)}</span>}
          </div>{figures}
        </div>;
        return title==="Perlu keputusan" ? <article key={w.id} tabIndex={-1} id={"inspection-pair-"+w.id} className="pair-card ledger-row">
          {summary}{actions}
        </article> : <details key={w.id} tabIndex={-1} id={"inspection-pair-"+w.id} className="pair-card settled-pair">
          <summary>{summary}<span className="ledger-disclose">Detail</span></summary>{actions}
        </details>;
      })}
    </section>}
    {index === (receiptNeedsDecision ? 0 : groups.length - 1) && children}
  </Fragment>);
}
