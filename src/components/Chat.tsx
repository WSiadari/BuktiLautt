import { useEffect, useRef, useState } from "react";
import type { Step } from "../types";
import type { InspectionContext } from "../lib/inspectionContext";
import {
  askUnifiedAgent,
  getUnifiedAgentStatus as getInspectionAgentStatus,
  UnifiedAgentError as InspectionAgentError,
} from "../services/unifiedAgent";
import { scriptedReply, type ScriptedContext } from "../services/simulation";
import { Icon, Modal } from "./ui";
import { OmbakPintar } from "./OmbakPintar";
import { VoiceInput } from "./VoiceInput";
import { readChatHistory, saveChatHistory } from "../services/accounts";
import type { ArchiveAgentAnswer } from "../services/archiveAgent";
import "../agent.css";
import { AgentTransactions } from "./AgentTransactions";
import { buildInspectionFollowUp } from "../lib/archiveDomain";
import { isInspectionFollowUp } from "../agent/contract";

import {
  validateUnifiedAgentRequest,
  validateUnifiedAgentResponse,
  type UnifiedAgentRequest,
  type UnifiedAgentResponse,
} from "../agent/unified";
import type { InspectionAgentResponse } from "../agent/contract";
import { formatRupiah } from "../lib/format";
type AgentAnswer = InspectionAgentResponse;
export type InspectionChatAction = AgentAnswer["actions"][number];
type Message = {
  role: "Anda" | "Ombak Pintar";
  text: string;
  mode: "live" | "basic";
  revision: number | null;
  answer?: AgentAnswer;
  snapshot?: InspectionContext;
  archiveAnswer?: ArchiveAgentAnswer;
  unifiedAnswer?: UnifiedAgentResponse;
  unifiedRequest?: UnifiedAgentRequest;
};
const chatMemory = new Map<string, Message[]>();
function storedMessages(
  value: unknown[],
  expectedWorkspaceId: string,
): Message[] {
  return value.filter((item): item is Message => {
    if (!item || typeof item !== "object") return false;
    const m = item as Partial<Message>;
    if (m.unifiedAnswer || m.unifiedRequest) {
      try {
        validateUnifiedAgentResponse(
          m.unifiedAnswer,
          validateUnifiedAgentRequest(m.unifiedRequest),
          expectedWorkspaceId,
        );
      } catch {
        return false;
      }
    }
    return (
      (m.role === "Anda" || m.role === "Ombak Pintar") &&
      typeof m.text === "string" &&
      (m.mode === "live" || m.mode === "basic") &&
      (m.revision === null || Number.isInteger(m.revision)) &&
      (!m.answer ||
        (Array.isArray(m.answer.referencedFindingIds) &&
          Array.isArray(m.answer.actions))) &&
      (!m.snapshot || Array.isArray(m.snapshot.findings)) &&
      (!m.archiveAnswer || Array.isArray(m.archiveAnswer.transactions))
    );
  });
}
type Props = {
  open?: boolean;
  sessionKey?: string;
  historyScope?: { accountId: string; workspaceId: string; contextId: string };
  archiveWorkspaceId?: string;
  workspaceId?: string | null;
  workspaceName?: string;
  onArchiveOpen?: (transactionId: string, revision: number) => void;
  context: string;
  examinationContext?: ScriptedContext;
  demo: boolean;
  step: Step;
  inspection?: InspectionContext;
  initialFindingId?: string | null;
  onClose: () => void;
  onSource: () => void;
  onAction: (action: InspectionChatAction, revision: number) => void;
};
const statusLabels: Record<string, string> = {
  confirmed_open: "Selisih terbuka",
  confirmed_resolved: "Selisih dijelaskan",
  confirmed_equal: "Berat sama",
  unconfirmed: "Belum dikonfirmasi",
  unmatched: "Tanpa pasangan",
  review_required: "Perlu ditinjau ulang",
  incomplete: "Data belum lengkap",
};
const weight = (value: number | null) =>
  value === null
    ? "Belum diketahui"
    : `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(value)} kg`;
const actionLabels = {
  view_finding: "Lihat pasangan",
  view_weighing_source: "Lihat Catatan Timbang",
  view_receipt_source: "Lihat Nota Penjualan",
  open_adjustment: "Buka penyesuaian",
};

function findingLabel(snapshot: InspectionContext, id: string) {
  const finding = snapshot.findings.find((item) => item.id === id);
  if (!finding) return "Pasangan tidak tersedia";
  const rows = snapshot.findings.filter((item) =>
    finding.weighId ? item.weighId !== null : item.weighId === null,
  );
  const index = rows.findIndex((item) => item.id === id) + 1;
  return finding.weighId
    ? finding.species +
        " · baris timbang " +
        index +
        " · " +
        weight(finding.weighedKg) +
        " · nota " +
        weight(finding.receiptKg)
    : finding.species +
        " · baris nota " +
        index +
        " · " +
        weight(finding.receiptKg);
}
function readableText(text: string, snapshot?: InspectionContext) {
  let output = text;
  for (const finding of snapshot?.findings || [])
    output = output.replaceAll(finding.id, findingLabel(snapshot!, finding.id));
  return output
    .replace(/(?:pair:|receipt:)[a-zA-Z0-9_-]+/g, "pasangan pemeriksaan")
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      "pemeriksaan",
    );
}

export function Chat({
  open = true,
  sessionKey = "",
  historyScope,
  archiveWorkspaceId,
  workspaceId = null,
  workspaceName,
  onArchiveOpen,
  context,
  step,
  examinationContext,
  inspection,
  initialFindingId,
  onClose,
  onAction,
}: Props) {
  const memoryKey = historyScope
    ? `${historyScope.accountId}:${historyScope.workspaceId}:${historyScope.contextId}`
    : `guest:${sessionKey || context}`;
  const [messages, setMessages] = useState<Message[]>(
    () => chatMemory.get(memoryKey) || [],
  );
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"live" | "basic">("live");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [answerReady, setAnswerReady] = useState(false);
  useEffect(() => {
    if (messages.at(-1)?.role !== "Ombak Pintar") return;
    setAnswerReady(true);
    const timer = window.setTimeout(() => setAnswerReady(false), 600);
    return () => window.clearTimeout(timer);
  }, [messages]);
  const [historyReady, setHistoryReady] = useState(!historyScope);
  const [historyError, setHistoryError] = useState("");
  const [historySaving, setHistorySaving] = useState(false);
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const historyRevision = useRef(0);
  const historyBlocked = useRef(false);
  const historyLastSaved = useRef("");
  const historyWrites = useRef(Promise.resolve());
  const historyPending = useRef(0);
  const historyLife = useRef<{
    aborted: boolean;
    controller: AbortController;
  } | null>(null);
  useEffect(() => {
    chatMemory.set(memoryKey, messages);
  }, [messages, memoryKey]);
  useEffect(() => {
    if (!historyScope) {
      setHistoryReady(true);
      return;
    }
    const life = { aborted: false, controller: new AbortController() };
    historyLife.current = life;
    setHistoryReady(false);
    setHistoryError("");
    readChatHistory(
      historyScope.contextId,
      life.controller.signal,
      historyScope.workspaceId,
    )
      .then((value) => {
        if (life.aborted) return;
        if (
          value.contextId !== historyScope.contextId ||
          !Array.isArray(value.messages) ||
          !Number.isSafeInteger(value.revision) ||
          value.revision < 0
        )
          throw new Error("Riwayat tidak sesuai konteks.");
        const loaded = storedMessages(value.messages, historyScope.workspaceId);
        historyRevision.current = value.revision;
        historyLastSaved.current = JSON.stringify(loaded);
        setMessages(loaded);
        historyBlocked.current = false;
        setHistoryReady(true);
      })
      .catch(() => {
        if (!life.aborted) {
          historyBlocked.current = true;
          setHistoryReady(true);
          setHistoryError(
            "Riwayat akun belum dapat dimuat. Percakapan baru hanya ada pada sesi ini; riwayat server tidak ditimpa.",
          );
        }
      });
    return () => {
      life.aborted = true;
      life.controller.abort();
    };
  }, [memoryKey, historyAttempt]);
  useEffect(() => {
    if (!historyScope || !historyReady || historyBlocked.current) return;
    const serialized = JSON.stringify(messages);
    if (serialized === historyLastSaved.current) return;
    const life = historyLife.current;
    historyPending.current++;
    setHistorySaving(true);
    historyWrites.current = historyWrites.current.then(async () => {
      try {
        if (!life || life.aborted || historyBlocked.current) return;
        const saved = await saveChatHistory(
          historyScope.contextId,
          JSON.parse(serialized),
          historyRevision.current,
          life.controller.signal,
          historyScope.workspaceId,
        );
        if (life.aborted) return;
        historyRevision.current = saved.revision;
        historyLastSaved.current = serialized;
        setHistoryError("");
      } catch {
        if (life && !life.aborted) {
          historyBlocked.current = true;
          setHistoryError(
            "Riwayat belum tersinkron atau berubah di perangkat lain. Percakapan sesi ini dipertahankan; tidak ada penimpaan otomatis.",
          );
        }
      } finally {
        historyPending.current--;
        if (life && !life.aborted) setHistorySaving(historyPending.current > 0);
      }
    });
  }, [messages, historyReady, memoryKey]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState<Awaited<
    ReturnType<typeof getInspectionAgentStatus>
  > | null>(null);
  const [statusError, setStatusError] = useState("");
  const [retryable, setRetryable] = useState(true);
  const [statusAttempt] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const transcript = useRef<HTMLDivElement>(null);
  const latestQuestion = useRef<{
    text: string;
    findingId?: string;
    mode: "live" | "basic";
  } | null>(null);
  const currentSignature = JSON.stringify([
    context,
    step,
    inspection,
    memoryKey,
    archiveWorkspaceId,
    workspaceId,
  ]);
  const active = useRef(currentSignature);
  active.current = currentSignature;
  const previous = useRef(currentSignature);
  const shortcutStarted = useRef<string | null>(null);
  useEffect(() => {
    setMode("live");
  }, [!!inspection, archiveWorkspaceId]);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (previous.current === currentSignature) return;
    previous.current = currentSignature;
    generation.current++;
    controller.current?.abort();
    setBusy(false);
    setError("");
    latestQuestion.current = null;
    // Beri tahu hanya bila ada percakapan yang terdampak; panel baru tidak perlu peringatan.
    setNotice(
      messages.length || busy
        ? "Pemeriksaan berubah. Jawaban tertunda dibatalkan; jawaban sebelumnya diberi tanda revisi lama."
        : "",
    );
    setVoiceOpen(false);
  }, [currentSignature, inspection]);
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    setStatus(null);
    setStatusError("");
    getInspectionAgentStatus(abort.signal)
      .then((s) => {
        if (!abort.signal.aborted) setStatus(s);
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setStatusError(
            "Status layanan belum dapat diperiksa. Panduan dasar tetap tersedia.",
          );
      });
    return () => abort.abort();
  }, [statusAttempt, open, workspaceId]);
  useEffect(() => {
    if (transcript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [messages, busy, error, notice]);
  async function ask(
    text: string,
    findingId?: string,
    retry = false,
    requestedMode = mode,
  ) {
    const question = text.trim();
    if (!question || busy || !historyReady) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const token = ++generation.current;
    const signature = currentSignature;
    const snapshot = inspection;
    latestQuestion.current = { text: question, findingId, mode: requestedMode };
    if (!retry)
      setMessages((m) => [
        ...m,
        {
          role: "Anda",
          text: question,
          mode: requestedMode,
          revision: snapshot?.revision ?? null,
        },
      ]);
    setInput("");
    setError("");
    setNotice("");
    setRetryable(true);
    if (requestedMode === "basic") {
      const followUp =
        inspection && isInspectionFollowUp(question)
          ? buildInspectionFollowUp(inspection)
          : null;
      setMessages((m) => [
        ...m,
        {
          role: "Ombak Pintar",
          text: followUp
            ? `Pada revisi ${followUp.revision}: ${followUp.confirmedPairCount} pasangan dikonfirmasi, ${followUp.pendingDecisionCount} keputusan menunggu, ${followUp.openDifferenceCount} selisih terbuka, ${followUp.unmatchedItemCount} item tanpa pasangan, ${followUp.reviewRequiredCount} perlu ditinjau ulang, dan ${followUp.incompleteCount} data belum lengkap. Tinjau sumber dan keputusan melalui pemeriksaan; panduan ini tidak mengubah data.`
            : scriptedReply(question, examinationContext),
          mode: "basic",
          revision: snapshot?.revision ?? null,
        },
      ]);
      return;
    }
    setBusy(true);
    try {
      const request: UnifiedAgentRequest = {
        requestId: crypto.randomUUID(),
        question,
        ...(snapshot ? { inspection: snapshot } : {}),
        ...(findingId && snapshot ? { findingId } : {}),
      };
      const answer = await askUnifiedAgent(
        request,
        workspaceId,
        abort.signal,
        status?.timeoutMs,
      );
      if (
        token !== generation.current ||
        active.current !== signature ||
        abort.signal.aborted
      )
        return;
      setMessages((m) => [
        ...m,
        {
          role: "Ombak Pintar",
          text: answer.answer,
          mode: answer.provider.name === "basic" ? "basic" : "live",
          revision: answer.inspection?.revision ?? null,
          answer: answer.inspection ?? undefined,
          snapshot: answer.inspection ? snapshot : undefined,
          unifiedAnswer: answer,
          unifiedRequest: request,
        },
      ]);
    } catch (reason) {
      if (
        token !== generation.current ||
        abort.signal.aborted ||
        active.current !== signature
      )
        return;
      setError(
        reason instanceof Error
          ? reason.message
          : "Jawaban belum tersedia. Pertanyaan tetap tersimpan.",
      );
      setRetryable(
        reason instanceof InspectionAgentError ? reason.retryable : true,
      );
    } finally {
      if (token === generation.current && active.current === signature)
        setBusy(false);
    }
  }
  useEffect(() => {
    if (!initialFindingId) {
      shortcutStarted.current = null;
      return;
    }
    if (
      !open ||
      shortcutStarted.current === initialFindingId ||
      !inspection ||
      !historyReady
    )
      return;
    shortcutStarted.current = initialFindingId;
    const finding = inspection.findings.find((f) => f.id === initialFindingId);
    if (!finding) {
      setNotice(
        "Pasangan ini tidak lagi tersedia. Pilih temuan dari revisi saat ini.",
      );
      return;
    }
    const question = `Jelaskan selisih ${finding.species} pada pasangan ini.`;
    setMode("live");
    setInput(question);
    void ask(question, finding.id, false, "live");
  }, [initialFindingId, status, inspection, open, historyReady]);
  function switchMode(next: "live" | "basic") {
    generation.current++;
    controller.current?.abort();
    setBusy(false);
    setError("");
    setMode(next);
    latestQuestion.current = null;
  }
  useEffect(() => {
    if (open) return;
    generation.current++;
    controller.current?.abort();
    setBusy(false);
    setVoiceOpen(false);
  }, [open]);
  if (!open) return null;
  return (
    <>
      <Modal title="Ombak Pintar" onClose={onClose}>
        <div className="chat-identity">
          <OmbakPintar
            mood={
              error
                ? "error"
                : busy
                  ? "thinking"
                  : answerReady
                    ? "positive"
                    : messages.length
                      ? "idle"
                      : "welcome"
            }
            size="medium"
          />
          <div>
            <strong className="agent-subtitle">
              Asisten pemeriksaan &amp; transaksi
            </strong>
            <p className="meta chat-context">
              {workspaceId
                ? "Ruang kerja: " + (workspaceName || "Aktif")
                : "Tanpa akun · draf perangkat"}
              {inspection
                ? " · Pemeriksaan aktif"
                : workspaceId
                  ? " · Arsip berizin"
                  : " · Panduan penggunaan"}
            </p>
          </div>
        </div>
        <details className="agent-privacy chat-info">
          <summary>Info &amp; data yang digunakan</summary>
          <p className="chat-disclosure">
            Kirim mengirim pertanyaan dan ringkasan pemeriksaan.
          </p>
          <p>
            Foto, rekaman audio, transkrip catatan timbang, dan catatan alasan
            tidak disertakan sebagai konteks asisten. Arsip dibaca hanya sesuai
            izin ruang kerja aktif. Pengiriman audio untuk transkripsi
            memerlukan persetujuan terpisah. Keputusan tetap melalui form Anda.
          </p>
          <p className="agent-history-status">
            {!historyReady
              ? "Memuat riwayat akun…"
              : historyError ||
                (historySaving ? "Menyimpan riwayat ke akun…" : "") ||
                (historyScope
                  ? "Riwayat terpisah menurut akun, ruang kerja, dan konteks."
                  : "Riwayat hanya pada sesi browser ini.")}
          </p>
        </details>
        {mode === "live" && (!status?.available || statusError) && (
          <div className="agent-availability" role="status">
            <p>
              {statusError ||
                (status
                  ? "Gemini belum tersedia. Pertanyaan tetap dapat dijawab oleh panduan dasar server dengan data berizin."
                  : "Memeriksa layanan…")}
            </p>
          </div>
        )}
        {mode === "basic" && (
          <div className="agent-availability" role="status">
            <p>Panduan dasar perangkat aktif.</p>
            <button className="text-button" onClick={() => switchMode("live")}>
              Coba asisten lagi
            </button>
          </div>
        )}
        {notice && (
          <p className="agent-context-notice" role="status">
            {notice}
          </p>
        )}
        {(!historyReady || historySaving || historyError) && (
          <p className="agent-history-status" role="status">
            {!historyReady
              ? "Memuat riwayat akun…"
              : historyError || "Menyimpan riwayat ke akun…"}
          </p>
        )}
        {historyError && (
          <button
            className="text-button"
            onClick={() => {
              if (
                !messages.length ||
                window.confirm(
                  "Buka riwayat server? Pesan sesi yang belum tersinkron tidak akan menimpa server.",
                )
              )
                setHistoryAttempt((n) => n + 1);
            }}
          >
            Muat riwayat server
          </button>
        )}
        <div
          ref={transcript}
          className="chat-messages agent-messages"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          data-testid="inspection-chat-log"
        >
          {!messages.length && (
            <div className="chat-welcome">
              <h3>Apa yang ingin Anda pahami?</h3>
              <p>
                Tanyakan selisih ikan, penjualan, atau langkah berikutnya. Ombak
                memakai pemeriksaan aktif dan arsip ruang kerja yang berizin.
              </p>
              <div className="chat-suggestions" aria-label="Contoh pertanyaan">
                {[
                  ...(inspection ? ["Apa yang masih perlu diperiksa?"] : []),
                  ...(workspaceId
                    ? [
                        "Total penjualan bulan ini berapa?",
                        "Ikan apa paling laku bulan ini?",
                        "Bandingkan penjualan bulan ini dengan bulan lalu",
                        "Berapa selisih berat bulan ini?",
                        "Siapa pembeli terbesar bulan ini?",
                      ]
                    : ["Bagaimana cara mengunggah nota?"]),
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={busy}
                    onClick={() => void ask(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message, index) => {
            const stale =
              message.revision !== null &&
              (!inspection ||
                message.revision !== inspection.revision ||
                (message.snapshot?.draftId &&
                  message.snapshot.draftId !== inspection.draftId));
            return (
              <div
                className={`message ${message.role === "Anda" ? "user-message" : ""}`}
                key={index}
                data-agent-mode={message.mode}
                data-answer-revision={message.revision ?? undefined}
              >
                <strong>{message.role}</strong>
                <span className="agent-answer-label">
                  {message.unifiedAnswer
                    ? (message.unifiedAnswer.kind === "inspection"
                        ? "Pemeriksaan aktif"
                        : message.unifiedAnswer.kind === "archive" ||
                            message.unifiedAnswer.kind === "aggregate"
                          ? "Arsip · " +
                            (message.unifiedAnswer.workspaceName ||
                              "Ruang kerja aktif")
                          : "Bantuan") +
                      (message.unifiedAnswer.provider.name === "basic"
                        ? " · Panduan dasar"
                        : " · AI")
                    : message.archiveAnswer
                      ? message.archiveAnswer.provider.name === "basic"
                        ? "Ringkasan arsip server · tanpa Gemini"
                        : "AI · arsip akun"
                      : message.role === "Anda"
                        ? "Pertanyaan"
                        : message.mode === "live"
                          ? "AI · pemeriksaan"
                          : "Panduan dasar"}
                  {message.revision !== null
                    ? ` · Revisi ${message.revision}`
                    : ""}
                </span>
                {stale && (
                  <p className="agent-stale">
                    Revisi lama — tanyakan kembali untuk data saat ini.
                  </p>
                )}
                <p>
                  {readableText(message.text, message.snapshot || inspection)}
                </p>
                {message.unifiedAnswer && (
                  <AgentTransactions
                    answer={message.unifiedAnswer}
                    onOpen={(id, revision) => onArchiveOpen?.(id, revision)}
                  />
                )}
                {message.archiveAnswer && (
                  <section
                    className="agent-archive-summary"
                    aria-label="Total arsip dari server"
                  >
                    <dl>
                      <div>
                        <dt>Total akhir terkonfirmasi</dt>
                        <dd>
                          {message.archiveAnswer.totalRupiah === null
                            ? "Belum diketahui"
                            : formatRupiah(message.archiveAnswer.totalRupiah)}
                        </dd>
                      </div>
                      <div>
                        <dt>Transaksi terkonfirmasi</dt>
                        <dd>{message.archiveAnswer.transactionCount}</dd>
                      </div>
                      <div>
                        <dt>Draf, tidak dijumlahkan</dt>
                        <dd>{message.archiveAnswer.draftCount}</dd>
                      </div>
                    </dl>
                    <p>
                      {message.archiveAnswer.fromDate} sampai{" "}
                      {message.archiveAnswer.toDate} · WIB
                    </p>
                    <div className="agent-actions">
                      {message.archiveAnswer.transactions.map((item, index) => (
                        <button
                          key={`${item.transactionId}:${item.revision}`}
                          className="text-button"
                          onClick={() =>
                            onArchiveOpen?.(item.transactionId, item.revision)
                          }
                        >
                          Buka transaksi {index + 1} · {item.transactionDate} ·{" "}
                          {item.totalRupiah === null
                            ? "Total belum diketahui"
                            : formatRupiah(item.totalRupiah)}
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                {message.answer?.clarification && message.snapshot && (
                  <div
                    className="agent-clarification"
                    data-testid="agent-clarification"
                    aria-label="Pilih pasangan yang dimaksud"
                  >
                    {message.answer.referencedFindingIds.map((id) => {
                      const finding = message.snapshot!.findings.find(
                        (item) => item.id === id,
                      );
                      return finding ? (
                        <button
                          key={id}
                          type="button"
                          disabled={!!stale || busy}
                          onClick={() =>
                            void ask(
                              "Jelaskan selisih " +
                                finding.species +
                                " pada baris ini.",
                              finding.id,
                            )
                          }
                        >
                          {findingLabel(message.snapshot!, finding.id)}
                        </button>
                      ) : null;
                    })}
                  </div>
                )}
                {!message.answer?.clarification &&
                  message.answer?.referencedFindingIds.map((id) => {
                    const f = message.snapshot?.findings.find(
                      (f) => f.id === id,
                    );
                    return f ? (
                      <section
                        className="agent-finding"
                        key={id}
                        aria-label={`Bukti pasangan ${f.species}`}
                      >
                        <header>
                          <strong>{f.species}</strong>
                          <span>
                            {statusLabels[f.status] || "Perlu ditinjau"}
                          </span>
                        </header>
                        <small>{findingLabel(message.snapshot!, f.id)}</small>
                        <dl>
                          <div>
                            <dt>Catatan Timbang</dt>
                            <dd>{weight(f.weighedKg)}</dd>
                          </div>
                          <div>
                            <dt>Nota Penjualan</dt>
                            <dd>{weight(f.receiptKg)}</dd>
                          </div>
                          <div>
                            <dt>Selisih awal</dt>
                            <dd>{weight(f.initialKg)}</dd>
                          </div>
                          <div>
                            <dt>Tidak terjual tersimpan</dt>
                            <dd>{weight(f.adjustmentKg)}</dd>
                          </div>
                          <div>
                            <dt>Sisa terbuka</dt>
                            <dd>{weight(f.remainingKg)}</dd>
                          </div>
                        </dl>
                      </section>
                    ) : null;
                  })}
                {message.answer && !message.answer.clarification && (
                  <div className="agent-actions">
                    {message.answer.actions.map((action, i) => (
                      <button
                        key={`${action.type}-${action.findingId}-${i}`}
                        className="text-button"
                        disabled={!!stale}
                        onClick={() =>
                          onAction(action, message.answer!.revision)
                        }
                      >
                        {actionLabels[action.type]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {busy && (
            <div
              className="chat-typing"
              role="status"
              data-testid="agent-pending"
            >
              <span className="chat-typing-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>Mengirim pertanyaan dan menunggu jawaban AI…</span>
              <button
                className="text-button"
                onClick={() => {
                  generation.current++;
                  controller.current?.abort();
                  setBusy(false);
                  setNotice(
                    "Permintaan dibatalkan. Pertanyaan dan data pemeriksaan tetap tersedia.",
                  );
                }}
              >
                Batalkan
              </button>
            </div>
          )}
          {error && (
            <div className="callout error" role="alert">
              <strong>Jawaban belum tersedia</strong>
              <p>{error}</p>
              <p>Pemeriksaan Anda tidak berubah.</p>
              {retryable && latestQuestion.current && (
                <button
                  className="text-button"
                  onClick={() => {
                    const q = latestQuestion.current!;
                    void ask(q.text, q.findingId, true, q.mode);
                  }}
                >
                  Coba lagi
                </button>
              )}
              <button
                className="text-button"
                onClick={() => switchMode("basic")}
              >
                Buka Panduan dasar
              </button>
            </div>
          )}
        </div>
        {voiceOpen && (
          <section className="chat-voice" aria-label="Rekam pertanyaan">
            <div className="chat-voice-head">
              <strong>Rekam pertanyaan</strong>
              <button
                type="button"
                className="text-button"
                onClick={() => setVoiceOpen(false)}
              >
                Tutup rekaman
              </button>
            </div>
            <VoiceInput
              purpose="question"
              autoStart
              context={{
                draftId: inspection?.draftId || "archive-question",
                revision: inspection?.revision || 0,
                sourceCapturedAt: memoryKey,
                uiKey: currentSignature + ":" + input,
              }}
              onTranscript={(text, capture) => {
                if (capture.uiKey !== currentSignature + ":" + input)
                  return false;
                setInput(text);
                setVoiceOpen(false);
                setNotice(
                  "Transkrip siap disunting. Tekan Kirim untuk menanyakan setelah Anda meninjaunya.",
                );
                requestAnimationFrame(() =>
                  document.getElementById("chat-question")?.focus(),
                );
                return true;
              }}
              onFallback={() => setVoiceOpen(false)}
            />
          </section>
        )}
        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
        >
          <label className="sr-only" htmlFor="chat-question">
            Pertanyaan Anda
          </label>
          <input
            id="chat-question"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={1000}
            placeholder="Ketik pertanyaan…"
          />
          <button
            type="button"
            className="agent-microphone"
            disabled={busy || !historyReady}
            aria-label="Rekam pertanyaan dengan mikrofon"
            aria-haspopup="dialog"
            aria-pressed={voiceOpen}
            onClick={() => setVoiceOpen(true)}
          >
            <svg
              viewBox="0 0 24 24"
              width="21"
              height="21"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <rect x="8" y="2" width="8" height="13" rx="4" />
              <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
            </svg>
          </button>
          <button
            className="button primary"
            disabled={busy || !historyReady || !input.trim()}
            aria-label="Kirim pertanyaan"
          >
            <Icon name="arrow" />
          </button>
        </form>
      </Modal>
    </>
  );
}
