import { useEffect, useRef, useState } from "react";
import type { VoiceResult, VoiceStatus } from "../voice/contract";
import { MAX_VOICE_SECONDS } from "../voice/contract";
import {
  extractVoice,
  getVoiceStatus,
  prepareVoiceAudio,
  VoiceClientError,
} from "../services/voice";
import { VoiceMascot, type VoiceMood } from "./VoiceMascot";
import { Modal } from "./ui";
import { transcribeQuestion } from "../services/voiceQuestion";

export type VoiceContext = {
  draftId: string;
  revision: number;
  sourceCapturedAt: string;
  uiKey: string;
};
export type VoiceCapture = VoiceContext & { capturedAt: string };
type Props = {
  purpose?: "weighing" | "question";
  autoStart?: boolean;
  context: VoiceContext;
  restoredResult?: VoiceResult;
  onResult?: (result: VoiceResult, capture: VoiceCapture) => boolean;
  onTranscript?: (text: string, capture: VoiceCapture) => boolean;
  onReview?: () => void;
  onFallback: (mode: "text" | "photo") => void;
};
const stateLabels: Record<VoiceMood, string> = {
  ready: "Siap merekam",
  requesting: "Menunggu izin mikrofon",
  recording: "Merekam",
  preparing: "Menyiapkan rekaman di perangkat",
  processing: "Memproses rekaman",
  review: "Hasil siap ditinjau",
  error: "Rekaman perlu perhatian",
};
const clock = (seconds: number) =>
  `00:${String(Math.min(99, Math.floor(seconds))).padStart(2, "0")}`;
export function VoiceInput({
  purpose = "weighing",
  autoStart = false,
  context,
  restoredResult,
  onResult,
  onTranscript,
  onReview,
  onFallback,
}: Props) {
  const [phase, setPhase] = useState<VoiceMood>(
    restoredResult ? "review" : "ready",
  );
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [elapsed, setElapsed] = useState(0);
  const [playback, setPlayback] = useState("");
  const [prepared, setPrepared] = useState<{
    audioDataUrl: string;
    durationSeconds: number;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [statusMessage, setStatusMessage] = useState(
    "Memeriksa layanan suara…",
  );
  const [consentOpen, setConsentOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [acceptedClip, setAcceptedClip] = useState(false);
  const clipRequestId = useRef("");
  const mounted = useRef(true);
  const generation = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const clip = useRef<Blob | null>(null);
  const clipUrl = useRef("");
  const recordingStamp = useRef("");
  const startedAt = useRef(0);
  const contextRef = useRef(context);
  contextRef.current = context;
  const previous = useRef(context);
  const ownAccepted = useRef<string | null>(null);
  function setStage(next: VoiceMood) {
    phaseRef.current = next;
    setPhase(next);
  }
  function stopTracks() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (timer.current) clearInterval(timer.current);
    if (deadline.current) clearTimeout(deadline.current);
    timer.current = null;
    deadline.current = null;
  }
  function abortWork() {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    if (recorder.current) {
      const active = recorder.current;
      active.ondataavailable = null;
      active.onstop = null;
      active.onerror = null;
      if (active.state !== "inactive")
        try {
          active.stop();
        } catch {
          // Perekam sudah berhenti sendiri; tidak ada yang perlu dibersihkan.
        }
      recorder.current = null;
    }
    stopTracks();
  }
  function clearClip() {
    setAcceptedClip(false);
    clipRequestId.current = "";
    if (clipUrl.current) URL.revokeObjectURL(clipUrl.current);
    clipUrl.current = "";
    clip.current = null;
    setPlayback("");
    setPrepared(null);
  }
  useEffect(() => {
    if (!autoStart) return;
    const start = window.setTimeout(() => void startRecording(), 0);
    return () => window.clearTimeout(start);
  }, [autoStart]);
  useEffect(() => {
    mounted.current = true;
    const abort = new AbortController();
    getVoiceStatus(abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) {
          setStatus(value);
          setStatusMessage(
            value.available
              ? "Layanan tersedia. Rekaman hanya dikirim setelah persetujuan Anda."
              : value.reason ||
                  "Layanan suara belum tersedia. Teks dan Foto tetap dapat dipakai.",
          );
        }
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setStatusMessage(
            "API suara belum dapat dihubungi. Rekaman tetap lokal; gunakan Teks atau Foto.",
          );
      });
    return () => {
      mounted.current = false;
      abort.abort();
      abortWork();
      if (clipUrl.current) URL.revokeObjectURL(clipUrl.current);
    };
  }, []);
  useEffect(() => {
    const before = previous.current;
    previous.current = context;
    if (
      before.draftId === context.draftId &&
      before.revision === context.revision &&
      before.sourceCapturedAt === context.sourceCapturedAt &&
      before.uiKey === context.uiKey
    )
      return;
    const ownCommit =
      ownAccepted.current &&
      restoredResult?.vision.requestId === ownAccepted.current &&
      context.sourceCapturedAt === recordingStamp.current;
    if (ownCommit) {
      ownAccepted.current = null;
      return;
    }
    const busy = [
      "requesting",
      "recording",
      "preparing",
      "processing",
    ].includes(phaseRef.current);
    if (busy) abortWork();
    if (
      before.draftId !== context.draftId ||
      before.sourceCapturedAt !== context.sourceCapturedAt
    ) {
      clearClip();
      setStage("ready");
      setConsentOpen(false);
      setMessage(
        "Sumber berubah. Rekaman sementara dilepas; isian sebelumnya tetap tersedia.",
      );
    } else if (busy) {
      setStage(clip.current ? "ready" : restoredResult ? "review" : "ready");
      setMessage(
        "Proses suara dibatalkan karena konteks pemeriksaan berubah. Isian tetap dipertahankan.",
      );
      setConsentOpen(false);
    }
  }, [
    context.draftId,
    context.revision,
    context.sourceCapturedAt,
    context.uiKey,
    restoredResult,
  ]);
  async function finishClip(blob: Blob, token: number) {
    if (!mounted.current || generation.current !== token) return;
    if (!blob.size) {
      setStage("error");
      setMessage(
        "Rekaman kosong. Coba rekam lagi atau gunakan Teks atau Foto.",
      );
      return;
    }
    clip.current = blob;
    if (clipUrl.current) URL.revokeObjectURL(clipUrl.current);
    clipUrl.current = URL.createObjectURL(blob);
    setPlayback(clipUrl.current);
    setStage("preparing");
    const abort = new AbortController();
    controller.current = abort;
    try {
      const value = await prepareVoiceAudio(blob, abort.signal);
      if (
        !mounted.current ||
        generation.current !== token ||
        abort.signal.aborted
      )
        return;
      setPrepared(value);
      setElapsed(value.durationSeconds);
      setStage("ready");
      setMessage(
        "Rekaman siap diputar. Belum ada audio dikirim ke layanan AI.",
      );
    } catch (error) {
      if (
        !mounted.current ||
        generation.current !== token ||
        abort.signal.aborted
      )
        return;
      setStage("error");
      setMessage(
        error instanceof VoiceClientError
          ? error.message
          : "Rekaman belum dapat dibuka di browser ini. Rekam lagi atau gunakan Teks atau Foto.",
      );
    } finally {
      if (controller.current === abort) controller.current = null;
    }
  }
  function stopRecording() {
    if (phaseRef.current !== "recording") return;
    const active = recorder.current;
    if (active && active.state !== "inactive") active.stop();
    stopTracks();
    setStage("preparing");
  }
  async function startRecording() {
    abortWork();
    clearClip();
    setConsentOpen(false);
    setConsent(false);
    setMessage("");
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setStage("error");
      setMessage(
        "Perekaman suara belum didukung di browser ini. Gunakan browser terbaru melalui HTTPS/localhost, atau pilih Teks atau Foto.",
      );
      return;
    }
    const token = ++generation.current;
    setElapsed(0);
    setStage("requesting");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || generation.current !== token) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const mime = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4;codecs=mp4a.40.2",
        "audio/mp4",
      ].find(
        (type) =>
          typeof MediaRecorder.isTypeSupported !== "function" ||
          MediaRecorder.isTypeSupported(type),
      );
      const active = mime
        ? new MediaRecorder(media, { mimeType: mime })
        : new MediaRecorder(media);
      recorder.current = active;
      const chunks: BlobPart[] = [];
      active.ondataavailable = (event) => {
        if (event.data.size && generation.current === token)
          chunks.push(event.data);
      };
      active.onerror = () => {
        if (generation.current !== token || !mounted.current) return;
        abortWork();
        setStage("error");
        setMessage(
          "Perekaman terhenti. Mikrofon sudah dilepas. Coba lagi atau gunakan Teks atau Foto.",
        );
      };
      active.onstop = () => {
        stopTracks();
        if (recorder.current === active) recorder.current = null;
        if (!mounted.current || generation.current !== token) return;
        void finishClip(
          new Blob(chunks, { type: active.mimeType || mime || "audio/webm" }),
          token,
        );
      };
      recordingStamp.current = new Date().toISOString();
      clipRequestId.current = crypto.randomUUID();
      startedAt.current = performance.now();
      active.start(250);
      setStage("recording");
      timer.current = setInterval(() => {
        if (mounted.current)
          setElapsed((performance.now() - startedAt.current) / 1000);
      }, 200);
      deadline.current = setTimeout(() => {
        if (generation.current === token) {
          stopRecording();
          setMessage(
            "Batas rekaman tercapai. Bila durasi hasil melebihi 30 detik, rekam ulang lebih singkat.",
          );
        }
      }, MAX_VOICE_SECONDS * 1000);
    } catch (error) {
      if (!mounted.current || generation.current !== token) return;
      stopTracks();
      setStage("error");
      setMessage(
        error instanceof DOMException &&
          (error.name === "NotAllowedError" || error.name === "SecurityError")
          ? "Akses mikrofon belum diizinkan. Izinkan mikrofon di browser, atau lanjutkan memakai Teks atau Foto."
          : "Mikrofon belum dapat digunakan. Periksa perangkat lalu coba lagi, atau gunakan Teks atau Foto.",
      );
    }
  }
  function cancel() {
    abortWork();
    setConsentOpen(false);
    setConsent(false);
    setStage(clip.current ? "ready" : "ready");
    setMessage(
      "Rekaman atau pengiriman dibatalkan. Mikrofon dilepas dan isian sebelumnya tetap dipertahankan.",
    );
  }
  async function send() {
    if (!consent || !prepared || !clip.current || !status?.available) return;
    abortWork();
    const token = ++generation.current;
    const atSend = {
      ...contextRef.current,
      capturedAt: recordingStamp.current,
    };
    const abort = new AbortController();
    controller.current = abort;
    setConsentOpen(false);
    setConsent(false);
    setStage("processing");
    setMessage("");
    try {
      if (purpose === "question") {
        const result = await transcribeQuestion(
          {
            requestId: clipRequestId.current,
            sourceId: `${atSend.draftId}:question:${atSend.capturedAt}`,
            sourceRevision: String(atSend.revision),
            audioDataUrl: prepared.audioDataUrl,
          },
          abort.signal,
          status.timeoutMs,
        );
        if (
          !mounted.current ||
          generation.current !== token ||
          abort.signal.aborted
        )
          return;
        if (!onTranscript?.(result.transcript, atSend)) {
          setStage("error");
          setMessage(
            "Transkrip terlambat diabaikan karena konteks atau pertanyaan sudah berubah.",
          );
          return;
        }
        setAcceptedClip(true);
        setStage("review");
        setMessage(
          "Transkrip masuk ke kolom pertanyaan. Periksa dan sunting, lalu tekan Kirim. Belum ada pertanyaan yang dikirim otomatis.",
        );
        return;
      }
      const result = await extractVoice(
        {
          requestId: clipRequestId.current,
          sourceId: `${atSend.draftId}:weighing:${atSend.capturedAt}`,
          sourceRevision: String(atSend.revision),
          audioDataUrl: prepared.audioDataUrl,
        },
        abort.signal,
        status.timeoutMs,
      );
      if (
        !mounted.current ||
        generation.current !== token ||
        abort.signal.aborted
      )
        return;
      ownAccepted.current = result.vision.requestId;
      const accepted = onResult?.(result, atSend);
      if (!accepted) {
        ownAccepted.current = null;
        setStage("error");
        setMessage(
          "Hasil terlambat diabaikan karena sumber atau isian sudah berubah. Rekam atau kirim ulang setelah memeriksa konteks.",
        );
        return;
      }
      setAcceptedClip(true);
      setStage("review");
      setMessage(
        "Transkrip dan usulan diterima. Belum ada baris yang otomatis ditambahkan atau dikonfirmasi.",
      );
    } catch (error) {
      if (
        !mounted.current ||
        generation.current !== token ||
        abort.signal.aborted
      )
        return;
      setStage("error");
      setMessage(
        error instanceof VoiceClientError
          ? error.message
          : "Pemrosesan rekaman belum berhasil. Audio sementara dan isian tetap tersedia; coba kirim lagi atau gunakan Teks atau Foto.",
      );
    } finally {
      if (controller.current === abort) controller.current = null;
    }
  }
  const busy = ["requesting", "recording", "preparing", "processing"].includes(
    phase,
  );
  return (
    <section
      className="voice-input"
      data-testid="voice-input"
      data-state={phase}
      aria-label={
        purpose === "question"
          ? "Pertanyaan dari suara"
          : "Catatan timbang dari suara"
      }
    >
      <div className="voice-state-heading">
        <VoiceMascot state={phase} />
        <div>
          <p className="eyebrow">
            {purpose === "question"
              ? "PERTANYAAN · SUARA"
              : "CATATAN TIMBANG · SUARA"}
          </p>
          <h3 role="status">{stateLabels[phase]}</h3>
          <p>
            {purpose === "question"
              ? "Ucapkan pertanyaan Anda. Transkrip dapat disunting sebelum Anda menekan Kirim."
              : "Ucapkan jenis ikan dan beratnya, misalnya “Teri dua belas kilo, Tongkol delapan kilo.”"}
          </p>
        </div>
      </div>
      {phase === "recording" && (
        <div className="voice-recording-clock">
          <span className="voice-recording-dot" aria-hidden="true" />
          <strong aria-label="Durasi rekaman" role="timer">
            {clock(elapsed)}
          </strong>
          <span>Maksimal 30 detik</span>
        </div>
      )}
      {message && (
        <p
          className={`voice-feedback ${phase === "error" ? "error-text" : ""}`}
          role={phase === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      )}
      <div className="voice-controls">
        {phase === "recording" ? (
          <>
            <button
              className="button primary"
              data-voice-action="stop"
              onClick={stopRecording}
            >
              Hentikan rekaman
            </button>
            <button
              className="button secondary"
              data-voice-action="cancel"
              onClick={cancel}
            >
              Batalkan
            </button>
          </>
        ) : busy ? (
          <button
            className="button secondary full"
            data-voice-action="cancel"
            onClick={cancel}
          >
            Batalkan {phase === "processing" ? "pemrosesan" : "perekaman"}
          </button>
        ) : (
          <button
            className="button secondary"
            data-voice-action={playback ? "rerecord" : "start"}
            onClick={startRecording}
          >
            {playback ? "Rekam lagi" : "Mulai rekam"}
          </button>
        )}
      </div>
      {playback && (
        <div className="voice-playback">
          <label>Dengarkan rekaman Anda</label>
          <audio
            controls
            src={playback}
            preload="metadata"
            aria-label="Putar rekaman suara"
            data-testid="voice-playback"
          />
          <p>
            Audio hanya ada pada sesi ini. Transkrip dan isian dapat disimpan;
            audio tidak dipulihkan setelah halaman ditutup.
          </p>
        </div>
      )}
      {prepared && !busy && !acceptedClip && (
        <button
          className="button primary full"
          data-voice-action="send"
          onClick={() => {
            setConsent(false);
            setConsentOpen(true);
          }}
        >
          Tinjau persetujuan pengiriman
        </button>
      )}
      <p className="voice-service-status">{statusMessage}</p>
      {restoredResult && (
        <div className="voice-transcript">
          <h4>Transkrip pembacaan</h4>
          <p>
            {restoredResult.transcript ||
              "Ucapan belum dapat dikenali. Tidak ada kata atau angka yang diisi otomatis."}
          </p>
          <button
            className="text-button"
            data-voice-action="review"
            onClick={onReview}
          >
            Tinjau dan sunting usulan
          </button>
        </div>
      )}
      <div className="voice-fallback">
        <button
          className="text-button"
          onClick={() => {
            cancel();
            onFallback("text");
          }}
        >
          Gunakan Teks
        </button>
        {purpose !== "question" && (
          <button
            className="text-button"
            onClick={() => {
              cancel();
              onFallback("photo");
            }}
          >
            Gunakan Foto
          </button>
        )}
      </div>
      {consentOpen && (
        <Modal
          title="Kirim rekaman untuk diproses?"
          onClose={() => setConsentOpen(false)}
        >
          <p>
            Rekaman berdurasi sekitar{" "}
            {Math.ceil(prepared?.durationSeconds || 0)} detik akan dikirim
            melalui server BuktiLaut ke Gemini. Suara dapat memuat informasi
            pribadi. Merekam dan memutar audio saja tidak mengirimkannya.
          </p>
          <label className="vision-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              {purpose === "question"
                ? "Saya menyetujui pengiriman rekaman ini ke layanan AI untuk transkripsi pertanyaan. Pertanyaan belum dikirim ke asisten."
                : "Saya menyetujui pengiriman rekaman ini ke layanan AI untuk transkrip dan usulan catatan timbang."}
            </span>
          </label>
          <p className="meta">
            Hasil dapat keliru dan tetap harus ditinjau. Tidak ada penambahan
            atau konfirmasi data otomatis.
          </p>
          <p className="voice-service-status">{statusMessage}</p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setConsentOpen(false)}
            >
              Batal
            </button>
            <button
              className="button primary"
              data-voice-action="consent"
              disabled={!consent || !status?.available}
              onClick={send}
            >
              Setuju dan kirim rekaman
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
