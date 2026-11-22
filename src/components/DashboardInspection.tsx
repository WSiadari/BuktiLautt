import type { Draft } from "../types";
import { inspectionProgress } from "../lib/inspectionProgress";
import { Icon } from "./ui";
import { OmbakPintar } from "./OmbakPintar";

const flow = ["Catatan timbang", "Nota penjualan", "Periksa pasangan"] as const;

export function DashboardInspection({ draft, archived, busy, onStart, onResume }: {
  draft: Draft | null;
  archived: boolean;
  busy: boolean;
  onStart: () => void;
  onResume: () => void;
}) {
  const progress = draft ? inspectionProgress(draft) : null;
  const current = progress ? Math.max(0, flow.indexOf(progress.label as (typeof flow)[number])) : -1;
  return (
    <section className="dashboard-inspection dash-hero" aria-labelledby="dashboard-inspection-heading">
      <div className="dash-hero-copy">
        <p className="section-kicker">Pemeriksaan</p>
        <h2 id="dashboard-inspection-heading">
          {draft ? "Lanjutkan yang tadi?" : "Siap memeriksa hari ini?"}
        </h2>
        {draft ? (
          <p className="dash-hero-meta">
            <span className="draft-status-mark" aria-hidden="true" />
            <span>{archived ? "Salinan arsip akun" : "Draf di perangkat ini"}</span>
            <strong className="dash-hero-id">{draft.id}</strong>
          </p>
        ) : (
          <p className="dash-hero-meta">Mulai dari foto catatan timbang Anda.</p>
        )}
        <ol className="dashboard-workflow dash-progress" aria-label="Alur pemeriksaan">
          {flow.map((label, index) => (
            <li
              key={label}
              aria-current={progress?.label === label ? "step" : undefined}
              className={index < current ? "done" : index === current ? "current" : ""}
            >
              <span>{index < current ? <Icon name="check" size={14} /> : index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <div className="inspection-desk-actions">
          {progress && (
            <button type="button" className="button primary button-xl" disabled={busy} onClick={onResume}>
              Lanjutkan · {progress.label} <Icon name="arrow" />
            </button>
          )}
          <button
            type="button"
            className={`button ${draft ? "ghost-light" : "primary button-xl"}`}
            disabled={busy}
            onClick={onStart}
          >
            <Icon name={draft ? "plus" : "camera"} size={18} /> Mulai pemeriksaan baru
          </button>
        </div>
      </div>
      <div className="dash-hero-art" aria-hidden="true">
        <OmbakPintar mood={draft ? "positive" : "welcome"} size="hero" />
      </div>
    </section>
  );
}
