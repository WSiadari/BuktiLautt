import { formatRupiah } from "../lib/format";
import { useEffect, useRef, useState } from "react";
import type { Draft } from "../types";
import { Modal, Badge, Icon } from "./ui";
import { GoogleMark } from "./AccountAuth";
import { DashboardInspection } from "./DashboardInspection";
import {
  AccountError,
  getGoogleAvailability,
  startGoogleAccount,
  logoutAccount,
  activateWorkspace,
  createWorkspace,
  listArchive,
  readArchive,
  saveArchive,
  inviteMember,
  acceptInvite,
  listMembers,
  type AccountSession,
  type ArchiveDetail,
  type ArchiveEntry,
} from "../services/accounts";
import "../accounts.css";
type Props = {
  view: "dashboard" | "archive" | "team" | "save";
  onNavigate: (path: string) => void;
  onStartInspection: () => void;
  onResumeInspection: () => void;
  inspectionDraft: Draft | null;
  inspectionSaving: boolean;
  session: AccountSession;
  draft: Draft;
  prepareArchive: () => Promise<Draft>;
  currentArchive: ArchiveEntry | null;
  canConfirm: boolean;
  onSession: (value: AccountSession) => void;
  onOpen: (detail: ArchiveDetail, report: boolean) => void;
  onSynced: (entry: ArchiveEntry, submitted: Draft) => void;
  onClose: () => void;
  onAskArchive: () => void;
  canLeaveCloud: () => boolean;
};
const currency = (n: number | null | undefined) => formatRupiah(n);
const displayDate = (date: string | null) =>
  date
    ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "long",
        timeZone: "Asia/Jakarta",
      }).format(new Date(`${date}T12:00:00+07:00`))
    : "Tanggal belum dikonfirmasi";
const archiveTimestamp = (value: string | null | undefined) =>
  typeof value === "string" && Number.isFinite(new Date(value).getTime())
    ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      }).format(new Date(value)) + " WIB"
    : "Belum tersedia";
export function AccountArea({
  view,
  onNavigate,
  onStartInspection,
  onResumeInspection,
  inspectionDraft,
  inspectionSaving,
  session,
  draft,
  prepareArchive,
  currentArchive,
  canConfirm,
  onSession,
  onOpen,
  onSynced,
  onClose,
  onAskArchive,
  canLeaveCloud,
}: Props) {
  const tab = view;
  const [googleAvailable, setGoogleAvailable] = useState(false);
  useEffect(() => {
    if (view !== "dashboard") return;
    const controller = new AbortController();
    getGoogleAvailability(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setGoogleAvailable(result.available);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [view]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filter, setFilter] = useState("");
  const [counterpartyFilter, setCounterpartyFilter] = useState("");
  const [referenceFilter, setReferenceFilter] = useState("");
  const [receiptFilter, setReceiptFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [detail, setDetail] = useState<ArchiveDetail | null>(null);
  const [date, setDate] = useState(currentArchive?.transactionDate || "");
  const [dateConfirmed, setDateConfirmed] = useState(
    currentArchive?.transactionDateConfirmed || false,
  );
  const [transactionTime, setTransactionTime] = useState(
    currentArchive?.transactionTime || "",
  );
  const [counterpartyName, setCounterpartyName] = useState(
    currentArchive?.counterpartyName || "",
  );
  const [receiptNumber, setReceiptNumber] = useState(
    currentArchive?.receiptNumber || "",
  );
  const [status, setStatus] = useState<"draft" | "confirmed">("draft");
  const [conflict, setConflict] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [code, setCode] = useState("");
  const [invite, setInvite] = useState<{
    code: string;
    expiresAt: string;
    invitePath: string;
  } | null>(null);
  const [members, setMembers] = useState<
    { userId: string; email: string; name: string; role: string }[]
  >([]);
  const active = session.workspaces.find(
    (w) => w.id === session.activeWorkspaceId,
  );
  const signature = `${session.user?.id || "guest"}:${session.activeWorkspaceId || ""}`;
  const activeSignature = useRef(signature);
  activeSignature.current = signature;
  const operations = useRef<AbortController | null>(null);
  useEffect(() => () => operations.current?.abort(), []);
  useEffect(() => {
    setEntries([]);
    setDetail(null);
    setError("");
    setNotice("");
    setConflict(false);
    setInvite(null);
    setMembers([]);
  }, [signature]);
  useEffect(() => {
    if (!session.user || tab !== "archive") return;
    const controller = new AbortController();
    const scope = signature;
    setLoading(true);
    setEntries([]);
    setError("");
    listArchive(
      {
        from,
        to,
        status: filter,
        counterpartyName: counterpartyFilter,
        reference: referenceFilter,
        receiptNumber: receiptFilter,
        offset,
        limit: 20,
      },
      controller.signal,
      session.activeWorkspaceId || undefined,
    )
      .then((result) => {
        if (!controller.signal.aborted && activeSignature.current === scope) {
          setEntries(result.entries);
          setHasMore(result.summary?.hasMore || false);
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted && activeSignature.current === scope) {
          setEntries([]);
          setError(
            reason instanceof Error ? reason.message : "Arsip belum tersedia.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    signature,
    tab,
    from,
    to,
    filter,
    refresh,
    counterpartyFilter,
    referenceFilter,
    receiptFilter,
    offset,
  ]);
  useEffect(() => {
    if (tab !== "team" || active?.kind !== "team") return;
    const controller = new AbortController();
    listMembers(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setMembers(result.members);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => controller.abort();
  }, [signature, tab, refresh]);
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (busy) return;
    operations.current?.abort();
    const controller = new AbortController();
    operations.current = controller;
    const scope = signature;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action(controller.signal);
    } catch (reason) {
      if (!controller.signal.aborted && activeSignature.current === scope) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Permintaan belum berhasil. Coba lagi.",
        );
        if (reason instanceof AccountError && reason.status === 409)
          setConflict(true);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function inspect(id: string, revision?: number) {
    const scope = signature;
    await run(async (signal) => {
      const next = await readArchive(
        id,
        signal,
        revision,
        session.activeWorkspaceId || undefined,
      );
      if (!signal.aborted && activeSignature.current === scope) setDetail(next);
    });
  }
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("transaksi");
    if (view !== "archive" || !id || !session.activeWorkspaceId) return;
    const controller = new AbortController();
    readArchive(id, controller.signal, undefined, session.activeWorkspaceId)
      .then((value) => {
        if (!controller.signal.aborted) setDetail(value);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => controller.abort();
  }, [view, session.activeWorkspaceId]);

  const panel = (
    <section className="account-area" data-testid="account-area">
      {error && (
        <div className="callout error" role="alert">
          <strong>
            {conflict
              ? "Revisi arsip sudah berubah"
              : "Permintaan belum selesai"}
          </strong>
          <p>{error}</p>
          {conflict && (
            <p>
              Buka versi server untuk membandingkan sebelum melanjutkan
              penyimpanan.
            </p>
          )}
        </div>
      )}
      {notice && (
        <p className="account-notice" role="status">
          {notice}
        </p>
      )}
      {view === "dashboard" && (
        <>
          <div className="dashboard-workspace-bar">
            <label className="field dashboard-workspace-field">
              Ruang kerja aktif
              <select
                value={session.activeWorkspaceId || ""}
                disabled={busy}
                onChange={(event) => {
                  const id = event.target.value;
                  if (!canLeaveCloud()) return;
                  void run(async (signal) =>
                    onSession(await activateWorkspace(id, signal)),
                  );
                }}
              >
                {session.workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
            <details
              className="dashboard-account"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.currentTarget.open = false;
                  event.currentTarget.querySelector("summary")?.focus();
                }
              }}
            >
              <summary aria-label={`Akun ${session.user?.name}`}>
                <span className="dashboard-avatar" aria-hidden="true">
                  {Array.from(
                    session.user?.name.trim() || "B",
                  )[0].toLocaleUpperCase("id-ID")}
                </span>
                <span>
                  <small>Akun Anda</small>
                  <strong>{session.user?.name}</strong>
                </span>
                <Icon name="arrow" size={17} />
              </summary>
              <div className="dashboard-account-menu">
                <strong>{session.user?.name}</strong>
                <span>{session.user?.email}</span>
                {googleAvailable && (
                  <button
                    type="button"
                    className="auth-google dashboard-google"
                    disabled={busy}
                    onClick={() =>
                      void run(async (signal) => {
                        const { authorizationUrl } = await startGoogleAccount(
                          "link",
                          signal,
                        );
                        if (!signal.aborted) location.assign(authorizationUrl);
                      })
                    }
                  >
                    <GoogleMark /> Hubungkan akun Google
                  </button>
                )}
                <button
                  type="button"
                  className="dashboard-logout"
                  disabled={busy}
                  onClick={() => {
                    if (!canLeaveCloud()) return;
                    void run(async (signal) => {
                      await logoutAccount(signal);
                      onSession({
                        user: null,
                        workspaces: [],
                        activeWorkspaceId: null,
                      });
                    });
                  }}
                >
                  Keluar dari akun <Icon name="arrow" size={17} />
                </button>
              </div>
            </details>
          </div>
          <div className="dashboard-layout">
            <DashboardInspection
              draft={inspectionDraft}
              archived={!!currentArchive}
              busy={busy || inspectionSaving}
              onStart={onStartInspection}
              onResume={onResumeInspection}
            />
            <section
              className="dashboard-archive"
              aria-labelledby="dashboard-archive-heading"
            >
              <div className="dashboard-section-heading">
                <Icon name="report" size={24} />
                <h2 id="dashboard-archive-heading">Arsip Transaksi</h2>
              </div>
              <p>Semua pemeriksaan yang sudah disimpan, lengkap dengan sumber dan revisinya.</p>
              <button
                type="button"
                className="button secondary"
                onClick={() => onNavigate("/arsip")}
              >
                Buka arsip transaksi <Icon name="arrow" size={18} />
              </button>
            </section>
            <section
              className="dashboard-team"
              aria-labelledby="dashboard-team-heading"
            >
              <div className="dashboard-section-heading">
                <Icon name="people" size={22} />
                <h2 id="dashboard-team-heading">Ruang kerja tim</h2>
              </div>
              <strong className="dashboard-team-name">
                {active?.name || "Ruang kerja belum tersedia"}
              </strong>
              {active && (
                <p>
                  {active.kind === "personal"
                    ? "Ruang pribadi · Hanya akun Anda"
                    : `Tim · ${active.role === "owner" ? "Anda pemilik ruang kerja" : "Anda anggota ruang kerja"}`}
                </p>
              )}
              <button
                type="button"
                className="dashboard-manage-link"
                onClick={() => onNavigate("/tim")}
              >
                Kelola ruang kerja <Icon name="arrow" size={18} />
              </button>
            </section>
          </div>
          <p className="dashboard-storage-note">
            <Icon name="source" size={16} />
            {currentArchive
              ? "Perubahan pada salinan arsip perlu disimpan kembali ke akun."
              : "Simpan pemeriksaan ke arsip akun untuk membukanya dari perangkat lain."}
          </p>
        </>
      )}
      {tab === "archive" && (
        <>
          <details
            className="archive-filter-panel"
            open={window.matchMedia?.("(min-width: 761px)").matches || undefined}
          >
            <summary>
              <Icon name="compare" size={18} /> Filter arsip
            </summary>
          <div className="archive-filters">
            <label className="field">
              Dari tanggal
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="field">
              Sampai tanggal
              <input
                type="date"
                min={from || undefined}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <label className="field">
              Status
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="">Semua status</option>
                <option value="confirmed">Terkonfirmasi</option>
                <option value="draft">Draf</option>
              </select>
            </label>
            <label className="field">
              Pihak transaksi
              <input
                value={counterpartyFilter}
                maxLength={160}
                onChange={(e) => setCounterpartyFilter(e.target.value)}
                placeholder="Nama pembeli, pabrik, atau koperasi"
              />
            </label>
            <label className="field">
              Referensi transaksi
              <input
                value={referenceFilter}
                maxLength={160}
                onChange={(e) => setReferenceFilter(e.target.value)}
                placeholder="BL-20261120-000001"
              />
            </label>
            <label className="field">
              Nomor nota eksternal
              <input
                value={receiptFilter}
                maxLength={160}
                onChange={(e) => setReceiptFilter(e.target.value)}
                placeholder="Contoh: NT-208"
              />
            </label>
          </div>
          <p className="meta">
            Tanggal transaksi dikonfirmasi pengguna · WIB (Asia/Jakarta).
          </p>
          </details>
          <div className="archive-toolbar">
            <button
              className="text-button"
              onClick={() => setRefresh((n) => n + 1)}
            >
              Muat ulang arsip
            </button>
            <button className="button secondary" onClick={onAskArchive}>
              Tanya total arsip
            </button>
          </div>
          {loading ? (
            <p role="status">Memuat arsip privat…</p>
          ) : !entries.length ? (
            <div className="archive-empty">
              Belum ada transaksi yang cocok dengan filter ini. Draf perangkat
              belum masuk arsip sampai Anda memilih menyimpannya ke akun.
            </div>
          ) : (
            <div className="archive-list">
              {entries.map((entry) => (
                <button
                  key={entry.transactionId}
                  className="archive-entry"
                  onClick={() => void inspect(entry.transactionId)}
                  disabled={busy}
                >
                  <span>
                    <strong>
                      {entry.reference || "Referensi belum tersedia"}
                    </strong>
                    <span>
                      {displayDate(entry.transactionDate)}
                      {entry.transactionTime
                        ? " · " + entry.transactionTime + " WIB"
                        : ""}
                    </span>
                    {entry.counterpartyName && (
                      <small>{entry.counterpartyName}</small>
                    )}
                    {entry.receiptNumber && (
                      <small>Nota: {entry.receiptNumber}</small>
                    )}
                  </span>
                  <span>
                    <Badge>
                      {entry.status === "confirmed" ? "Terkonfirmasi" : "Draf"}
                    </Badge>
                    <strong>{currency(entry.totalRupiah)}</strong>
                    <small>Revisi arsip {entry.revision}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="archive-pagination">
            <button
              className="text-button"
              disabled={loading || offset === 0}
              onClick={() => setOffset((n) => Math.max(0, n - 20))}
            >
              Sebelumnya
            </button>
            <span>Halaman {Math.floor(offset / 20) + 1}</span>
            <button
              className="text-button"
              disabled={loading || !hasMore}
              onClick={() => setOffset((n) => n + 20)}
            >
              Berikutnya
            </button>
          </div>
          {detail && (
            <section className="archive-detail" aria-label="Detail transaksi">
              <h3>{detail.entry.reference || "Referensi belum tersedia"}</h3>
              <p>
                {displayDate(detail.entry.transactionDate)}
                {detail.entry.transactionTime
                  ? " · " + detail.entry.transactionTime + " WIB"
                  : ""}
              </p>
              {detail.entry.counterpartyName && (
                <p>Pihak transaksi: {detail.entry.counterpartyName}</p>
              )}
              {detail.entry.receiptNumber && (
                <p>Nomor nota: {detail.entry.receiptNumber}</p>
              )}
              <p>Revisi arsip {detail.entry.revision}</p>
              <dl className="archive-record-audit">
                <div>
                  <dt>Dibuat di arsip</dt>
                  <dd>{archiveTimestamp(detail.entry.createdAt)}</dd>
                </div>
                <div>
                  <dt>Terakhir diperbarui</dt>
                  <dd>{archiveTimestamp(detail.entry.updatedAt)}</dd>
                </div>
                <div>
                  <dt>Revisi terkonfirmasi terbaru</dt>
                  <dd>{detail.entry.latestConfirmedRevision ?? "Belum ada"}</dd>
                </div>
              </dl>
              <p>
                Total akhir:{" "}
                <strong>{currency(detail.entry.totalRupiah)}</strong>
              </p>
              <div className="account-actions">
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => {
                    if (canLeaveCloud()) onOpen(detail, false);
                  }}
                >
                  Buka pemeriksaan
                </button>
                <button
                  className="button secondary"
                  disabled={busy || detail.entry.status !== "confirmed"}
                  onClick={() => {
                    if (canLeaveCloud()) onOpen(detail, true);
                  }}
                >
                  Buka laporan
                </button>
              </div>
              <h4>Riwayat revisi</h4>
              <ul>
                {detail.revisions.map((r) => (
                  <li key={r.revision}>
                    <button
                      className="text-button"
                      onClick={() =>
                        void inspect(detail.entry.transactionId, r.revision)
                      }
                    >
                      Revisi {r.revision} ·{" "}
                      {r.status === "confirmed" ? "Terkonfirmasi" : "Draf"} ·{" "}
                      {displayDate(r.transactionDate)}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {tab === "save" && (
        <form
          className="account-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async (signal) => {
              const submitted = await prepareArchive();
              if (signal.aborted) return;
              const saved = await saveArchive(
                {
                  transactionId:
                    currentArchive?.transactionId || submitted.transactionKey!,
                  transactionDate: date || null,
                  transactionTime: transactionTime || null,
                  counterpartyName: counterpartyName.trim() || null,
                  receiptNumber: receiptNumber.trim() || null,
                  transactionDateConfirmed: dateConfirmed,
                  status,
                  baseRevision: currentArchive?.revision || 0,
                  draft: submitted,
                },
                signal,
                session.activeWorkspaceId || undefined,
              );
              if (signal.aborted) return;
              onSynced(saved.entry, submitted);
              setConflict(false);
              setNotice("Revisi pemeriksaan berhasil disimpan ke arsip akun.");
              setRefresh((n) => n + 1);
            });
          }}
        >
          <h3>Simpan salinan pemeriksaan ke {active?.name}</h3>
          <p>
            Sumber, hasil baca AI, koreksi, pasangan, dan penyesuaian diunggah
            hanya saat Anda menekan simpan. Draf lokal Anda dipertahankan.
          </p>
          <label className="field">
            Tanggal transaksi pada nota
            <input
              type="date"
              required={status === "confirmed"}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setDateConfirmed(false);
              }}
            />
          </label>
          <div className="transaction-metadata-form">
            <label className="field">
              Waktu transaksi (opsional, WIB)
              <input
                type="time"
                value={transactionTime}
                onChange={(e) => setTransactionTime(e.target.value)}
              />
            </label>
            <label className="field">
              Pihak transaksi (opsional)
              <input
                maxLength={160}
                value={counterpartyName}
                onChange={(e) => setCounterpartyName(e.target.value)}
                placeholder="Pembeli, pemasok, pabrik, atau koperasi"
              />
            </label>
            <label className="field">
              Nomor nota eksternal (opsional)
              <input
                maxLength={160}
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
              />
            </label>
          </div>
          <p className="meta">
            Tanggal adalah waktu transaksi pada nota. Dibuat dan diperbarui
            menunjukkan waktu pencatatan di arsip. Metadata diisi atau
            dikonfirmasi Anda, bukan ditebak dari dokumen.
          </p>
          <label className="account-check">
            <input
              type="checkbox"
              checked={dateConfirmed}
              onChange={(e) => setDateConfirmed(e.target.checked)}
            />
            Saya mengonfirmasi tanggal ini sesuai nota penjualan (WIB).
          </label>
          <label className="field">
            Status revisi arsip
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as "draft" | "confirmed")
              }
            >
              <option value="draft">Draf — masih dikerjakan</option>
              <option value="confirmed" disabled={!canConfirm}>
                Terkonfirmasi — tinjauan selesai
              </option>
            </select>
          </label>
          {!canConfirm && (
            <p className="meta">
              Selesaikan tinjauan kedua sumber dan semua keputusan pasangan
              untuk status terkonfirmasi.
            </p>
          )}
          <button
            className="button primary"
            disabled={
              busy ||
              (status === "confirmed" &&
                (!dateConfirmed || !date || !canConfirm))
            }
          >
            {busy ? "Menyinkronkan…" : "Simpan ke arsip akun"}
          </button>
          {conflict && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                onClose();
                const id =
                  currentArchive?.transactionId ||
                  draft.transactionKey ||
                  draft.id;
                onNavigate(`/arsip?transaksi=${encodeURIComponent(id)}`);
              }}
            >
              Buka versi server tanpa menimpa isian
            </button>
          )}
        </form>
      )}
      {tab === "team" && (
        <>
          <h3>{active?.kind === "team" ? active.name : "Ruang kerja tim"}</h3>
          <p>
            Arsip tim hanya tersedia bagi pemilik dan anggota yang memiliki
            izin.
          </p>
          {active?.kind === "team" && (
            <ul className="team-members">
              {members.map((m) => (
                <li key={m.userId}>
                  <strong>{m.name}</strong>
                  <span>
                    {m.email} · {m.role === "owner" ? "Pemilik" : "Anggota"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {active?.kind === "team" && active.role === "owner" && (
            <form
              className="account-form"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async (signal) =>
                  setInvite(await inviteMember(inviteEmail, signal)),
                );
              }}
            >
              <label className="field">
                Email anggota yang diundang
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </label>
              <button className="button secondary" disabled={busy}>
                Buat undangan
              </button>
            </form>
          )}
          {invite && (
            <div className="account-invite">
              <strong>Kode undangan</strong>
              <code>{invite.code}</code>
              <p>
                Undangan terikat email dan berlaku sampai{" "}
                {new Date(invite.expiresAt).toLocaleString("id-ID", {
                  timeZone: "Asia/Jakarta",
                })}{" "}
                WIB. Tidak ada email yang dikirim otomatis.
              </p>
              <button
                className="button secondary"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(invite.code)
                    .then(() => setNotice("Kode undangan disalin."))
                    .catch(() =>
                      setError(
                        "Kode belum dapat disalin. Pilih dan salin kode di atas.",
                      ),
                    )
                }
              >
                Salin kode undangan
              </button>
            </div>
          )}
          <form
            className="account-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!canLeaveCloud()) return;
              void run(async (signal) => {
                onSession(await acceptInvite(code.trim(), signal));
                setCode("");
                setRefresh((n) => n + 1);
              });
            }}
          >
            <label className="field">
              Punya kode undangan?
              <input
                required
                autoComplete="off"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <button className="button secondary" disabled={busy}>
              Terima undangan
            </button>
          </form>
          <form
            className="account-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!canLeaveCloud()) return;
              void run(async (signal) => {
                onSession(await createWorkspace(teamName, signal));
                setTeamName("");
              });
            }}
          >
            <label className="field">
              Nama tim baru
              <input
                required
                maxLength={100}
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
              />
            </label>
            <button className="button secondary" disabled={busy}>
              Buat ruang kerja tim
            </button>
          </form>
        </>
      )}
    </section>
  );
  if (view === "save")
    return (
      <Modal title="Simpan pemeriksaan" onClose={onClose} wide canClose={!busy}>
        {panel}
      </Modal>
    );

  const title =
    view === "archive"
      ? "Arsip Transaksi"
      : view === "team"
        ? "Ruang kerja tim"
        : `Halo, ${session.user?.name?.trim().split(/\s+/)[0] || "Nelayan"}`;
  const googleStatus = new URLSearchParams(location.search).get("google");
  return (
    <main
      id="main-content"
      className={`account-page${view === "dashboard" ? " dashboard-page" : ""}`}
    >
      {view !== "dashboard" && (
        <button
          type="button"
          className="dashboard-back"
          onClick={() => onNavigate("/dashboard")}
        >
          <Icon name="arrow-left" size={17} /> Kembali ke Dashboard
        </button>
      )}
      <h1>{title}</h1>
      <p className="account-page-intro">
        {view === "dashboard"
          ? "Ini ringkasan pemeriksaan dan arsip Anda."
          : active?.name}
      </p>
      {view === "dashboard" && googleStatus === "terhubung" && (
        <p className="account-notice" role="status">
          Akun Google sudah terhubung.
        </p>
      )}
      {view === "dashboard" &&
        (googleStatus === "gagal" || googleStatus === "dibatalkan") && (
          <p className="auth-error" role="alert">
            Akun Google belum terhubung. Gunakan akun Google dengan email
            BuktiLaut Anda, lalu coba lagi.
          </p>
        )}
      {panel}
    </main>
  );
}
