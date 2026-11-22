import type { VoiceCapture } from "./components/VoiceInput";
import type { VoiceEdits } from "./components/VoiceProposalReview";
import { applyVoiceProposal } from "./lib/voiceReview";
import type { VoiceResult } from "./voice/contract";
import { compareReceiptDocument } from "./lib/receiptDocument";
import { MatchingStep } from "./components/MatchingStep";
import { ReportStep } from "./components/ReportStep";
import { SourceStep } from "./components/SourceStep";
import {
  buildMatchReviewSnapshot,
  normalizeFishName,
  validatePair,
  confirmPair,
  confirmedPairsAreValid,
} from "./lib/matching";
import { Icon, Badge, Modal } from "./components/ui";
import { Chat } from "./components/Chat";
import { AccountAuth } from "./components/AccountAuth";
import { AccountArea } from "./components/AccountArea";
import { inspectionProgress } from "./lib/inspectionProgress";
import {
  getAccountSession,
  readArchive,
  type AccountSession,
  type ArchiveEntry,
  type ArchiveDetail,
} from "./services/accounts";
import { buildInspectionContext } from "./lib/inspectionContext";
import { OmbakPintar } from "./components/OmbakPintar";
import { BootScene } from "./components/BootScene";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  calculatePair,
  calculateAdjustmentPreview,
  calculateReceiptTotals,
  parseKilograms,
} from "./lib/examination";

import type { Source, Pair, Draft, Step, PreviousReview } from "./types";
import { now, emptyDraft, demoDraft } from "./data/demo";
import { DRAFT_KEY, DEMO_KEY } from "./services/storage";
import { loadDraft, saveDraft } from "./services/indexedDb";
import {
  extractVision,
  getVisionStatus,
  VisionClientError,
} from "./services/vision";
import {
  documentCompatibility,
  type VisionStatus,
  type DocumentType,
} from "./vision/contract";
import {
  proposalIsCurrent,
  applyEligibleProposalRows,
  withProposalAssociations,
  sourceDocumentGate,
} from "./lib/visionReview";
import {
  SIMULATION_DELAY,
  simulationMessage,
  type SimulationOutcome,
} from "./services/simulation";
import {
  invalidRupiahInput,
  kg,
  money,
  rupiahValue,
  validSourceKg,
} from "./lib/fieldValues";
export default function App() {
  const [recovered, setRecovered] = useState<{
    value: Draft | null;
    warning: string;
    exists: boolean;
    persisted: boolean;
  }>({ value: null, warning: "", exists: false, persisted: false });
  const [savedUser, setSavedUser] = useState<Draft | null>(null);
  const [savedDemo, setSavedDemo] = useState<Draft | null>(null);
  const [demoRecoveryWarning, setDemoRecoveryWarning] = useState("");
  const [savedUserPersisted, setSavedUserPersisted] = useState(false);
  const [savedDemoPersisted, setSavedDemoPersisted] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [storageLoading, setStorageLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const [hasDraft, setHasDraft] = useState(false);
  const [step, setStep] = useState<Step>("home");
  const [accountSession, setAccountSession] = useState<AccountSession>({
    user: null,
    workspaces: [],
    activeWorkspaceId: null,
  });
  const accountSessionRef = useRef(accountSession);
  accountSessionRef.current = accountSession;
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountLoading, setAccountLoading] = useState(true);
  const [locationPath, setLocationPath] = useState(
    () => window.location.pathname,
  );
  const [authOrigin, setAuthOrigin] = useState<{
    step: Step;
    scrollY: number;
  } | null>(null);
  const authOpener = useRef<HTMLElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const authRoute = locationPath === "/masuk" || locationPath === "/daftar";
  const accountView =
    locationPath === "/dashboard"
      ? "dashboard"
      : locationPath === "/arsip"
        ? "archive"
        : locationPath === "/tim"
          ? "team"
          : null;

  function navigate(path: string, replace = false) {
    const target = new URL(path, location.origin);
    if (
      (target.pathname === "/masuk" || target.pathname === "/daftar") &&
      !authRoute
    ) {
      const publicOrigin =
        locationPath === "/" &&
        !accountView &&
        !accountSessionRef.current.user &&
        !cloudArchiveRef.current;
      setAuthOrigin(publicOrigin ? { step, scrollY: window.scrollY } : null);
      authOpener.current =
        publicOrigin && document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setChatOpen(false);
      setSourceModal(null);
    }
    if (
      location.pathname + location.search !==
      target.pathname + target.search
    ) {
      history[replace ? "replaceState" : "pushState"](null, "", target);
      setLocationPath(target.pathname);
      if (target.pathname !== "/masuk" && target.pathname !== "/daftar")
        window.scrollTo({ top: 0 });
    }
    setMenuOpen(false);
  }

  function closeAuth() {
    setStep(authOrigin?.step || "home");
    navigate("/");
    requestAnimationFrame(() => {
      window.scrollTo({ top: authOrigin?.scrollY || 0 });
      if (authOpener.current?.isConnected)
        authOpener.current.focus({ preventScroll: true });
    });
  }

  useEffect(() => {
    if (!authRoute) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [authRoute]);

  const wasAuthRoute = useRef(authRoute);
  useEffect(() => {
    if (wasAuthRoute.current && !authRoute && locationPath === "/") {
      requestAnimationFrame(
        () =>
          authOpener.current?.isConnected &&
          authOpener.current.focus({ preventScroll: true }),
      );
    }
    wasAuthRoute.current = authRoute;
  }, [authRoute, locationPath]);

  useEffect(() => {
    function onPopState() {
      setLocationPath(location.pathname);
      setMenuOpen(false);
      setAccountOpen(false);
      setChatOpen(false);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (accountLoading) return;
    if (accountView && !accountSession.user) navigate("/masuk", true);
    if (authRoute && accountSession.user) navigate("/dashboard", true);
  }, [accountLoading, accountView, authRoute, accountSession.user]);

  const [archiveChat, setArchiveChat] = useState(false);
  const [cloudArchive, setCloudArchive] = useState<{
    entry: ArchiveEntry;
    userId: string;
    workspaceId: string;
    syncedAt: string;
  } | null>(null);
  const cloudArchiveRef = useRef(cloudArchive);
  cloudArchiveRef.current = cloudArchive;
  const guestSnapshot = useRef<{
    draft: Draft;
    saveStatus: "idle" | "saving" | "saved" | "error";
    storageError: string;
    hasDraft: boolean;
  } | null>(null);
  useEffect(() => {
    if (!cloudArchive || cloudArchive.syncedAt === draft.savedAt) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [cloudArchive, draft.savedAt]);
  useEffect(() => {
    const controller = new AbortController();
    getAccountSession(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setAccountSession(value);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setAccountLoading(false);
      });
    return () => controller.abort();
  }, []);

  const [storageError, setStorageError] = useState("");
  const [notice, setNotice] = useState("");
  const [sourceModal, setSourceModal] = useState<"weighing" | "receipt" | null>(
    null,
  );
  const [resetModal, setResetModal] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatFindingId, setChatFindingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"data" | "source">("data");
  const [mode, setMode] = useState<"text" | "photo" | "voice">("text");
  const [reading, setReading] = useState(false);
  const [readMessage, setReadMessage] = useState("");
  const [readOutcome, setReadOutcome] = useState<SimulationOutcome>("success");
  const [readFailed, setReadFailed] = useState(false);
  const [pairErrors, setPairErrors] = useState<Record<string, string>>({});
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [adjustValue, setAdjustValue] = useState("");
  const [explanation, setExplanation] = useState("");
  const [uploading, setUploading] = useState<"weighing" | "receipt" | null>(
    null,
  );
  const request = useRef(0);
  const visionAbort = useRef<AbortController | null>(null);
  const simulationTimer = useRef<number | null>(null);
  const saveSequence = useRef(0);
  const activeSession = useRef(0);
  const [readingMode, setReadingMode] = useState<"real" | "demo">("demo");
  const [visionStatus, setVisionStatus] = useState<VisionStatus | null>(null);
  const [visionStatusMessage, setVisionStatusMessage] = useState(
    "Memeriksa ketersediaan API lokal…",
  );
  const [consentKind, setConsentKind] = useState<DocumentType | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentedSource, setConsentedSource] = useState("");
  const [readRetryable, setReadRetryable] = useState(true);
  const [sourceConfirming, setSourceConfirming] = useState<DocumentType | null>(
    null,
  );
  const [adjustmentSaving, setAdjustmentSaving] = useState(false);
  const [retryWait, setRetryWait] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRequest = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  function cancelVision() {
    visionAbort.current?.abort();
    visionAbort.current = null;
    if (simulationTimer.current) clearTimeout(simulationTimer.current);
    simulationTimer.current = null;
    request.current++;
  }
  useEffect(() => {
    let active = true;
    (async () => {
      const results = await Promise.allSettled([
        loadDraft(DRAFT_KEY),
        loadDraft(DEMO_KEY),
      ]);
      if (!active) return;
      const user =
        results[0].status === "fulfilled"
          ? results[0].value
          : {
              value: null,
              warning:
                "Draf belum dapat dipulihkan dari penyimpanan perangkat. Data lama tidak dihapus.",
              exists: true,
              persisted: false,
            };
      const demo =
        results[1].status === "fulfilled"
          ? results[1].value
          : {
              value: null,
              warning: "Contoh tersimpan belum dapat dipulihkan.",
              exists: false,
              persisted: false,
            };
      setRecovered(user);
      setSavedUserPersisted(user.persisted);
      setSavedDemoPersisted(demo.persisted);
      setSavedUser(user.value);
      setSavedDemo(demo.value);
      setDemoRecoveryWarning(demo.warning);
      setHasDraft(user.exists);
      setNotice([user.warning, demo.warning].filter(Boolean).join(" "));
      if (user.value) {
        latestDraft.current = user.value;
        setDraft(user.value);
        setSaveStatus(user.persisted ? "saved" : "error");
        if (!user.persisted)
          setStorageError(
            user.warning ||
              "Draf pulih belum tersimpan di IndexedDB. Coba simpan lagi.",
          );
      }
      setStorageLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    refreshVisionStatus(controller.signal);
    return () => controller.abort();
  }, []);
  useEffect(
    () => () => {
      visionAbort.current?.abort();
      request.current++;
      fileRequest.current++;
      if (simulationTimer.current) clearTimeout(simulationTimer.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );
  const consentSource = consentKind
    ? draft.sources[consentKind].capturedAt
    : "";
  useEffect(() => {
    setConsentAccepted(false);
    setConsentedSource("");
  }, [consentKind, consentSource]);
  async function refreshVisionStatus(signal?: AbortSignal) {
    try {
      const status = await getVisionStatus(signal);
      if (signal?.aborted) return;
      setVisionStatus(status);
      setVisionStatusMessage(
        status.available
          ? "Layanan tersedia. Sumber hanya dikirim setelah persetujuan Anda."
          : status.reason ||
              "AI belum dikonfigurasi. Isi manual tetap tersedia.",
      );
    } catch {
      if (signal?.aborted) return;
      setVisionStatus(null);
      setVisionStatusMessage(
        "API lokal belum dapat dihubungi. Periksa layanan server atau lanjutkan isi manual.",
      );
    }
  }
  const steps: Step[] = ["weighing", "receipt", "matching", "report"];
  useEffect(() => {
    if (step !== "home") heading.current?.focus();
    setTab("data");
    setReadMessage("");
    setReadFailed(false);
    cancelVision();
    fileRequest.current++;
    setReading(false);
    setUploading(null);
    window.scrollTo({ top: 0 });
  }, [step]);
  useEffect(() => {
    const titles: Record<string, string> = {
      "/masuk": "Masuk",
      "/daftar": "Buat akun",
      "/dashboard": "Dashboard",
      "/arsip": "Arsip Transaksi",
      "/tim": "Ruang kerja tim",
    };
    document.title = `${titles[locationPath] || { home: "Catat Hasil Timbang", weighing: "Catatan timbang", receipt: "Nota penjualan", matching: "Periksa pasangan", report: "Laporan" }[step]} · BuktiLaut`;
  }, [locationPath, step]);

  const inspectionDraft = cloudArchive
    ? draft
    : !draft.demo && hasDraft && draft.savedAt
      ? draft
      : savedUser;
  function goInspection() {
    if (saveStatus === "saving") {
      setNotice("Penyimpanan masih berjalan. Tunggu hingga selesai.");
      return;
    }
    if (!inspectionDraft) {
      startNew();
      return;
    }
    if (cloudArchive) setStep(inspectionProgress(inspectionDraft).step);
    else
      resumeDraft(
        inspectionDraft,
        recovered.warning,
        inspectionDraft === draft ? saveStatus !== "error" : savedUserPersisted,
      );
    navigate("/");
  }
  function leaveMenu() {
    setMenuOpen(false);
  }

  function leaveCloud() {
    if (!cloudArchiveRef.current) return;
    activeSession.current++;
    saveSequence.current++;
    cancelVision();
    fileRequest.current++;
    cloudArchiveRef.current = null;
    setCloudArchive(null);
    setChatOpen(false);
    setChatFindingId(null);
    setArchiveChat(false);
    const previous = guestSnapshot.current;
    guestSnapshot.current = null;
    const value = previous?.draft || savedUser || emptyDraft();
    latestDraft.current = value;
    setDraft(value);
    setSaveStatus(
      previous?.saveStatus === "saving"
        ? "idle"
        : previous?.saveStatus || "idle",
    );
    setStorageError(previous?.storageError || "");
    setHasDraft(previous?.hasDraft || !!value.savedAt);
    setStep("home");
  }
  function canLeaveCloud() {
    const current = cloudArchiveRef.current;
    return (
      !current ||
      current.syncedAt === latestDraft.current.savedAt ||
      window.confirm(
        "Perubahan arsip belum disinkronkan. Tutup salinan sesi ini tanpa mengunggah perubahan?",
      )
    );
  }
  function changeAccount(value: AccountSession) {
    setAuthOrigin(null);
    authOpener.current = null;
    accountSessionRef.current = value;
    leaveCloud();
    activeSession.current++;
    setChatOpen(false);
    setChatFindingId(null);
    setArchiveChat(false);
    setAccountSession(value);
  }
  function openCloud(detail: ArchiveDetail, report = false) {
    if (!accountSession.user || !accountSession.activeWorkspaceId) return;
    if (!cloudArchiveRef.current)
      guestSnapshot.current = {
        draft: latestDraft.current,
        saveStatus,
        storageError,
        hasDraft,
      };
    activeSession.current++;
    saveSequence.current++;
    cancelVision();
    fileRequest.current++;
    const next = {
      entry: detail.entry,
      userId: accountSession.user.id,
      workspaceId: accountSession.activeWorkspaceId,
      syncedAt: detail.draft.savedAt,
    };
    cloudArchiveRef.current = next;
    setCloudArchive(next);
    latestDraft.current = detail.draft;
    setDraft(detail.draft);
    setSaveStatus("saved");
    setStorageError("");
    setHasDraft(true);
    setReading(false);
    setUploading(null);
    setChatOpen(false);
    setChatFindingId(null);
    setArchiveChat(false);
    setAccountOpen(false);
    navigate("/");
    setMode("text");
    setStep(
      report
        ? "report"
        : detail.draft.weighingConfirmed
          ? detail.draft.receiptConfirmed
            ? "matching"
            : "receipt"
          : "weighing",
    );
    setNotice(
      "Arsip privat dibuka. Perubahan berikutnya hanya ada di sesi ini sampai Anda menyinkronkannya ke akun.",
    );
  }
  async function prepareArchive() {
    const current = latestDraft.current;
    if (cloudArchiveRef.current) return current;
    const value = current.transactionKey
      ? current
      : { ...current, transactionKey: crypto.randomUUID() };
    latestDraft.current = value;
    setDraft(value);
    if (!(await persist(value)))
      throw new Error(
        "Identitas transaksi belum tersimpan di perangkat. Coba lagi; belum ada arsip yang diunggah.",
      );
    if (latestDraft.current.id !== value.id)
      throw new Error(
        "Pemeriksaan berubah. Buka kembali penyimpanan arsip untuk konteks aktif.",
      );
    return latestDraft.current;
  }
  async function persist(next: Draft): Promise<boolean> {
    if (cloudArchiveRef.current) {
      setSaveStatus("saved");
      setStorageError("");
      setHasDraft(true);
      return true;
    }

    const sequence = ++saveSequence.current;
    const session = activeSession.current;
    setSaveStatus("saving");
    setStorageError("");
    try {
      const persisted = withProposalAssociations(next);
      await saveDraft(persisted);
      if (
        sequence !== saveSequence.current ||
        session !== activeSession.current
      )
        return false;
      setSaveStatus("saved");
      setStorageError("");
      setHasDraft(true);
      if (next.demo) {
        setSavedDemo(persisted);
        setSavedDemoPersisted(true);
        setDemoRecoveryWarning("");
      } else {
        setSavedUser(persisted);
        setSavedUserPersisted(true);
        setRecovered({
          value: persisted,
          warning: "",
          exists: true,
          persisted: true,
        });
      }
      return true;
    } catch {
      if (
        sequence !== saveSequence.current ||
        session !== activeSession.current
      )
        return false;
      setSaveStatus("error");
      setStorageError(
        "Perubahan belum tersimpan di IndexedDB. Penyimpanan mungkin penuh atau akses ditolak. Isian tetap tersedia; pertahankan halaman ini lalu coba simpan lagi.",
      );
      return false;
    }
  }
  function update(next: Draft) {
    setPairErrors({});
    setReading(false);
    setUploading(null);
    cancelVision();
    fileRequest.current++;
    const value = withProposalAssociations({ ...next, savedAt: now() });
    latestDraft.current = value;
    setDraft(value);
    setHasDraft(true);
    void persist(value);
  }
  function reviewSnapshot(current: Draft): PreviousReview | undefined {
    if (
      !current.pairs.some(
        (p) =>
          p.decision !== "pending" ||
          p.reviewIssue ||
          p.adjustment ||
          p.explanation,
      )
    )
      return current.previousReview;
    return buildMatchReviewSnapshot(current);
  }
  function invalidate(next: Draft): Draft {
    const previousReview = reviewSnapshot(latestDraft.current);
    if (latestDraft.current.pairs.some((p) => p.decision !== "pending"))
      setNotice(
        "Data berubah. Keputusan dan penyesuaian sebelumnya perlu ditinjau ulang; salinan terakhir tetap tersedia di pemeriksaan.",
      );
    return {
      ...next,
      previousReview,
      confirmedSnapshots: {
        ...(next.weighingConfirmed && next.confirmedSnapshots?.weighing
          ? { weighing: next.confirmedSnapshots.weighing }
          : {}),
        ...(next.receiptConfirmed && next.confirmedSnapshots?.receipt
          ? { receipt: next.confirmedSnapshots.receipt }
          : {}),
      },
      pairs: [],
      unmatchedReceipts: [],
      revision: next.revision + 1,
    };
  }
  function editRow(
    kind: "weighing" | "receipt",
    id: string,
    field: "name" | "kg" | "price" | "sourceSubtotal",
    value: string,
  ) {
    cancelVision();
    fileRequest.current++;
    setReading(false);
    update(
      invalidate({
        ...draft,
        [kind]: draft[kind].map((r) =>
          r.id === id
            ? {
                ...r,
                [field]: value,
                provenance:
                  r.provenance === "Usulan AI simulasi" ||
                  r.provenance === "Hasil AI"
                    ? "Dikoreksi pengguna"
                    : r.provenance,
              }
            : r,
        ),
        [`${kind}Confirmed`]: false,
      }),
    );
  }
  function begin(demo: boolean) {
    if (!canLeaveCloud()) return;
    leaveCloud();
    if (saveStatus === "saving") {
      setNotice(
        "Penyimpanan masih berjalan. Tunggu hingga selesai sebelum membuka pemeriksaan lain.",
      );
      return;
    }
    activeSession.current++;
    if (demo && !draft.demo && draft.savedAt && storageError) {
      setNotice(
        "Draf Anda belum tersimpan. Coba simpan kembali sebelum membuka contoh agar perubahan tidak hilang.",
      );
      return;
    }
    cancelVision();
    fileRequest.current++;
    setNotice("");
    const next = demo ? demoDraft() : emptyDraft();
    update(next);
    navigate("/");
    setStep("weighing");
    // Draf baru dimulai dari kamera; contoh memakai sumber teks sintetis.
    setMode(demo ? "text" : "photo");
  }
  function resumeDraft(next: Draft, warning = "", persisted = true) {
    if (!canLeaveCloud()) return;
    leaveCloud();
    if (saveStatus === "saving") return;
    if (!draft.demo && draft.savedAt && storageError && next.demo) {
      setNotice(
        "Draf Anda belum tersimpan. Selesaikan penyimpanan sebelum berpindah ke contoh.",
      );
      return;
    }
    activeSession.current++;
    cancelVision();
    fileRequest.current++;
    const same = next === latestDraft.current;
    latestDraft.current = next;
    setDraft(next);
    if (!same) {
      setSaveStatus(persisted ? "saved" : "error");
      setStorageError(
        persisted
          ? ""
          : warning ||
              "Draf pulih belum tersimpan di IndexedDB. Coba simpan lagi.",
      );
    }
    setStep(inspectionProgress(next).step);
  }
  function startNew() {
    if (saveStatus === "saving") {
      setNotice("Penyimpanan masih berjalan. Tunggu hingga selesai.");
      return;
    }
    if (hasDraft) setResetModal(true);
    else begin(false);
  }
  function changeSource(kind: "weighing" | "receipt", source: Source) {
    cancelVision();
    fileRequest.current++;
    setReading(false);
    update(
      invalidate({
        ...latestDraft.current,
        sources: { ...latestDraft.current.sources, [kind]: source },
        [`${kind}Confirmed`]: false,
      }),
    );
    setReadMessage(
      "Sumber berubah. Periksa kembali isian dan konfirmasikan sebelum melanjutkan.",
    );
  }
  async function readReal(kind: DocumentType) {
    const current = latestDraft.current;
    if (current.demo) return;
    if (
      !consentAccepted ||
      consentKind !== kind ||
      consentedSource !== current.sources[kind].capturedAt ||
      !visionStatus?.available
    ) {
      setReadMessage(
        "Sumber atau ketersediaan layanan berubah. Tinjau dan setujui sumber saat ini sebelum mengirim.",
      );
      return;
    }
    const source = current.sources[kind];
    if (!source.image && !source.text.trim()) {
      setReadFailed(true);
      setReadRetryable(false);
      setReadMessage(
        "Tambahkan foto atau teks sumber sebelum meminta pembacaan.",
      );
      return;
    }
    cancelVision();
    const token = ++request.current;
    const controller = new AbortController();
    visionAbort.current = controller;
    const requestId = crypto.randomUUID();
    const sourceId = current.id + ":" + kind + ":" + source.capturedAt;
    const sourceRevision = String(current.revision);
    setReadingMode("real");
    setTab("data");
    setReading(true);
    setReadFailed(false);
    setReadMessage("");
    setConsentKind(null);
    try {
      const result = await extractVision(
        {
          documentType: kind,
          requestId,
          sourceId,
          sourceRevision,
          ...(source.image
            ? { imageDataUrl: source.image }
            : { text: source.text }),
        },
        controller.signal,
        visionStatus.timeoutMs,
      );
      if (
        controller.signal.aborted ||
        request.current !== token ||
        latestDraft.current.revision !== current.revision ||
        latestDraft.current.sources[kind].capturedAt !== source.capturedAt
      )
        return;
      if (
        result.requestId !== requestId ||
        result.sourceId !== sourceId ||
        result.sourceRevision !== sourceRevision ||
        result.documentType !== kind
      )
        throw new VisionClientError(
          "INVALID_OUTPUT",
          "Identitas hasil tidak sesuai permintaan.",
          false,
        );
      const compatibility = documentCompatibility(result, kind);
      const received: Draft = {
        ...latestDraft.current,
        rawExtractions: {
          ...latestDraft.current.rawExtractions,
          [kind]: {
            result,
            receivedAt: now(),
            sourceCapturedAt: source.capturedAt,
          },
        },
      };
      update(
        compatibility.canImport
          ? received
          : invalidate({ ...received, [kind + "Confirmed"]: false }),
      );

      setReadMessage(
        compatibility.message +
          " Tidak ada isian yang otomatis diganti atau dikonfirmasi.",
      );
    } catch (error) {
      if (controller.signal.aborted || request.current !== token) return;
      setReading(false);
      const issue = error instanceof VisionClientError ? error : null;
      setReadFailed(true);
      setReadRetryable(!!issue?.retryable);
      setReadMessage(
        issue?.message ||
          "Pembacaan belum berhasil. Sumber dan isian tetap utuh. Coba lagi atau gunakan isi manual.",
      );
      if (issue?.retryAfterSeconds) {
        setRetryWait(true);
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(
          () => setRetryWait(false),
          issue.retryAfterSeconds * 1000,
        );
      }
    } finally {
      if (request.current === token) {
        setReading(false);
        visionAbort.current = null;
      }
    }
  }
  function receiveVoice(result: VoiceResult, capture: VoiceCapture): boolean {
    const current = latestDraft.current;
    if (
      current.demo ||
      current.id !== capture.draftId ||
      current.revision !== capture.revision ||
      current.sources.weighing.capturedAt !== capture.sourceCapturedAt ||
      capture.uiKey !== `${step}:${tab}:${mode}` ||
      result.vision.sourceId !== `${current.id}:weighing:${capture.capturedAt}`
    )
      return false;
    cancelVision();
    const next = invalidate({
      ...current,
      weighingConfirmed: false,
      sources: {
        ...current.sources,
        weighing: {
          text: result.transcript,
          filename: "Catatan suara · transkrip AI",
          capturedAt: capture.capturedAt,
        },
      },
      voiceExtraction: {
        result,
        receivedAt: now(),
        sourceCapturedAt: capture.capturedAt,
      },
      rawExtractions: {
        ...current.rawExtractions,
        weighing: {
          result: result.vision,
          receivedAt: now(),
          sourceCapturedAt: capture.capturedAt,
        },
      },
    });
    update(next);
    setReadMessage("");
    return true;
  }
  function importVoice(indices: number[], edits: VoiceEdits) {
    const current = latestDraft.current;
    const next = applyVoiceProposal(current, indices);
    if (next === current) return;
    const existing = new Set(current.weighing.map((row) => row.id));
    next.weighing = next.weighing.map((row) => {
      if (existing.has(row.id) || row.extractionItemIndex === undefined)
        return row;
      const edit = edits[row.extractionItemIndex];
      if (!edit) return row;
      const weight = parseKilograms(edit.kg);
      if (
        (edit.name.trim() && !normalizeFishName(edit.name)) ||
        (edit.kg.trim() && (weight === null || weight <= 0))
      )
        return row;
      return {
        ...row,
        name: edit.name.trim(),
        kg: edit.kg.trim() ? String(weight) : "",
        provenance:
          edit.name.trim() !== row.name ||
          (edit.kg.trim() ? String(weight) : "") !== row.kg
            ? ("Dikoreksi pengguna" as const)
            : row.provenance,
      };
    });
    update(next);
    setReadMessage(
      "Usulan suara terpilih ditambahkan. Periksa form lalu konfirmasikan secara terpisah.",
    );
  }
  function applyProposal(kind: DocumentType, indices: number[]) {
    const current = latestDraft.current;
    if (
      !proposalIsCurrent(current, kind) ||
      !sourceDocumentGate(current, kind).canConfirm
    )
      return;
    const extraction = current.rawExtractions![kind]!;
    const nextRows = applyEligibleProposalRows(
      current[kind],
      extraction.result,
      indices,
    );
    const existingIds = new Set(current[kind].map((row) => row.id));
    if (!nextRows.some((row) => !existingIds.has(row.id))) return;
    update(
      invalidate({ ...current, [kind]: nextRows, [kind + "Confirmed"]: false }),
    );
    setReadMessage(
      "Butir terpilih ditambahkan satu kali tanpa menimpa isian sebelumnya. Tinjau dan konfirmasikan secara eksplisit.",
    );
    setReadFailed(false);
  }
  function simulate(_kind: "weighing" | "receipt") {
    if (!draft.demo) {
      setReadFailed(false);
      setReadMessage(
        "Pembacaan AI belum tersedia pada prototipe ini. Isi data secara manual berdasarkan sumber Anda.",
      );
      return;
    }
    cancelVision();
    const token = ++request.current;
    setReadingMode("demo");
    setTab("data");
    setReading(true);
    setReadMessage("");
    setReadFailed(false);
    simulationTimer.current = window.setTimeout(() => {
      if (request.current !== token) return;
      setReading(false);
      setReadMessage(simulationMessage(readOutcome));
      setReadFailed(
        ["empty", "timeout", "quota", "invalid"].includes(readOutcome),
      );
    }, SIMULATION_DELAY);
  }
  async function confirmSource(kind: DocumentType) {
    if (!sourceValid(kind) || sourceConfirming) return;
    const documentGate = sourceDocumentGate(latestDraft.current, kind);
    if (!documentGate.canConfirm) {
      setReadMessage(documentGate.message);
      return;
    }
    const baseline = latestDraft.current;
    const session = activeSession.current;
    const next: Draft = {
      ...baseline,
      savedAt: now(),
      [kind + "Confirmed"]: true,
      confirmedSnapshots: {
        ...baseline.confirmedSnapshots,
        [kind]: {
          revision: baseline.revision,
          confirmedAt: now(),
          sourceCapturedAt: baseline.sources[kind].capturedAt,
          rows: baseline[kind].map((r) => ({
            ...r,
            extractionIssues: r.extractionIssues
              ? [...r.extractionIssues]
              : undefined,
          })),
          deduction: baseline.deduction,
          charges: baseline.charges,
        },
      },
    };
    if (kind === "receipt" && !baseline.pairs.length) {
      const reserved = new Set<string>();
      next.pairs = baseline.weighing.map((w) => {
        const name = normalizeFishName(w.name);
        const candidate = baseline.receipt.find(
          (r) =>
            name !== null &&
            normalizeFishName(r.name) === name &&
            !reserved.has(r.id),
        );
        if (candidate) reserved.add(candidate.id);
        return {
          weighId: w.id,
          receiptId: candidate?.id || "",
          decision: "pending",
          adjustment: "",
          explanation: "",
        };
      });
    }
    setSourceConfirming(kind);
    const ok = await persist(next);
    setSourceConfirming(null);
    if (
      !ok ||
      session !== activeSession.current ||
      latestDraft.current !== baseline
    )
      return;
    latestDraft.current = next;
    setDraft(next);
    if (kind === "weighing" && mode === "voice")
      setMode(next.demo ? "text" : "photo");
    setStep(kind === "weighing" ? "receipt" : "matching");
  }
  function sourceValid(kind: "weighing" | "receipt") {
    return (
      !!(draft.sources[kind].text.trim() || draft.sources[kind].image) &&
      sourceDocumentGate(draft, kind).canConfirm &&
      draft[kind].length > 0 &&
      (kind === "weighing" ||
        (!invalidRupiahInput(draft.deduction) &&
          !invalidRupiahInput(draft.charges))) &&
      draft[kind].every(
        (r) =>
          r.name.trim() &&
          validSourceKg(r.kg) &&
          (kind === "weighing" ||
            r.price.trim() === "" ||
            rupiahValue(r.price) !== null) &&
          (kind === "weighing" ||
            !r.sourceSubtotal?.trim() ||
            rupiahValue(r.sourceSubtotal) !== null),
      )
    );
  }
  function changePair(weighId: string, patch: Partial<Pair>) {
    const current = latestDraft.current;
    const pair = current.pairs.find((p) => p.weighId === weighId);
    if (!pair) return;
    const receiptId = patch.receiptId ?? pair.receiptId;
    const previousReview =
      pair.adjustment || pair.explanation || pair.reviewIssue
        ? reviewSnapshot(current)
        : current.previousReview;
    const base = { ...current, previousReview };
    if (patch.decision === "confirmed") {
      const confirmation = confirmPair(base, weighId, receiptId);
      if (!confirmation.ok) {
        setPairErrors((errors) => ({
          ...errors,
          [weighId]: confirmation.validation.message,
        }));
        return;
      }
      update({ ...confirmation.draft, revision: current.revision + 1 });
      return;
    }
    if (receiptId && patch.decision !== "unmatched") {
      const validation = validatePair(current, weighId, receiptId);
      if (!validation.valid) {
        setPairErrors((errors) => ({
          ...errors,
          [weighId]: validation.message,
        }));
        return;
      }
    }
    update({
      ...base,
      revision: current.revision + 1,
      pairs: current.pairs.map((p) => {
        if (p.weighId !== weighId) return p;
        const { reviewIssue, ...rest } = p;
        return { ...rest, ...patch, adjustment: "", explanation: "" };
      }),
    });
  }
  const pairResult = useCallback((p: Pair) => {
    const validation = validatePair(draft, p.weighId, p.receiptId);
    const input = {
      weighedKg: parseKilograms(
        draft.weighing.find((w) => w.id === p.weighId)?.kg || "",
      ),
      receiptKg: parseKilograms(
        draft.receipt.find((r) => r.id === p.receiptId)?.kg || "",
      ),
      weighedName: draft.weighing.find((w) => w.id === p.weighId)?.name || null,
      receiptName:
        draft.receipt.find((r) => r.id === p.receiptId)?.name || null,
      confirmed:
        p.decision === "confirmed" && !p.reviewIssue && validation.valid,
      savedAdjustmentKg: p.adjustment ? parseKilograms(p.adjustment) : null,
    };
    const result = calculatePair(input);
    return p.decision === "confirmed" && (!validation.valid || p.reviewIssue)
      ? {
          ...result,
          status: "invalid" as const,
          error: p.reviewIssue || validation.message,
        }
      : result;
  }, [draft]);
  const findings = draft.pairs.filter(
    (p) =>
      p.decision === "confirmed" &&
      pairResult(p).status === "ready" &&
      pairResult(p).remainingKg !== 0,
  );
  const unpairedReceipt = draft.receipt.filter(
    (r) =>
      !draft.pairs.some(
        (p) => p.receiptId === r.id && p.decision !== "unmatched",
      ),
  );
  const allReviewed =
    saveStatus === "saved" &&
    !storageError &&
    draft.weighingConfirmed &&
    draft.receiptConfirmed &&
    confirmedPairsAreValid(draft) &&
    sourceValid("weighing") &&
    sourceValid("receipt") &&
    draft.pairs
      .filter((p) => p.decision === "confirmed")
      .every((p) => pairResult(p).status === "ready") &&
    draft.pairs.length === draft.weighing.length &&
    draft.pairs.every((p) => p.decision !== "pending" && !p.reviewIssue) &&
    unpairedReceipt.every((r) => draft.unmatchedReceipts.includes(r.id));
  const total = calculateReceiptTotals(
    draft.receipt.map((r) => ({
      receiptKg: parseKilograms(r.kg),
      pricePerKg: rupiahValue(r.price),
    })),
    rupiahValue(draft.deduction),
    rupiahValue(draft.charges),
  );
  const documentComparison = compareReceiptDocument(draft);
  const confirmedWeightContext = draft.pairs
    .filter((p) => p.decision === "confirmed")
    .map((p) => {
      const w = draft.weighing.find((r) => r.id === p.weighId)!;
      const r = draft.receipt.find((r) => r.id === p.receiptId);
      const result = pairResult(p);
      return result.status === "ready"
        ? w.name +
            ": sumber timbang " +
            kg(parseKilograms(w.kg)) +
            ", nota " +
            kg(r ? parseKilograms(r.kg) : null) +
            ", selisih awal " +
            kg(result.initialKg) +
            (p.adjustment
              ? ", penyesuaian tersimpan " + kg(parseKilograms(p.adjustment))
              : ", belum ada penyesuaian tersimpan") +
            ", sisa " +
            kg(result.remainingKg) +
            "."
        : w.name + ": selisih belum dapat dihitung.";
    });
  const examinationContext =
    step === "home"
      ? undefined
      : {
          weights:
            (confirmedWeightContext.join(" ") ||
              "Belum ada pasangan dikonfirmasi; selisih belum dapat dinyatakan.") +
            (draft.pairs.some((p) => p.decision === "pending")
              ? " Masih ada pasangan menunggu keputusan."
              : ""),
          receipt:
            "Subtotal item terhitung saat ini " +
            money(total.subtotalRupiah) +
            ". Total akhir nota terhitung " +
            money(total.totalRupiah) +
            "." +
            (total.status !== "ready"
              ? " Sebagian nilai uang belum diketahui atau tidak valid; jangan menganggapnya nol."
              : ""),
          nextStep:
            step === "weighing"
              ? "Tinjau isian catatan timbang terhadap sumber sebelum konfirmasi."
              : step === "receipt"
                ? "Periksa nilai nota yang belum diketahui, lalu konfirmasikan isian."
                : step === "matching"
                  ? "Tinjau keputusan pada kedua sumber. Penyesuaian baru berlaku setelah berhasil disimpan."
                  : "Laporan mengikuti revisi aktif " +
                    draft.revision +
                    ". Sumber tidak berubah karena penyesuaian.",
        };
  const receiptAmountHint =
    invalidRupiahInput(draft.deduction) || invalidRupiahInput(draft.charges)
      ? "Potongan atau biaya tambahan tidak valid. Gunakan Rupiah bulat 0 atau lebih."
      : draft.receipt.some(
            (row) =>
              (!!row.kg.trim() && !validSourceKg(row.kg)) ||
              invalidRupiahInput(row.price) ||
              invalidRupiahInput(row.sourceSubtotal || ""),
          )
        ? "Berat, harga, atau subtotal isian item tidak valid. Periksa bidang yang ditandai sebelum konfirmasi."
        : total.status === "invalid"
          ? total.error || "Nominal nota tidak valid."
          : total.subtotalRupiah === null
            ? "Berat atau harga item belum lengkap; subtotal belum dapat dipastikan."
            : total.totalRupiah === null
              ? "Potongan atau biaya tambahan belum dipastikan."
              : "Total akhir berasal dari subtotal item, dikurangi potongan, ditambah biaya yang telah diisi.";
  const activePair = draft.pairs.find((p) => p.weighId === adjusting);
  const preview = activePair
    ? calculateAdjustmentPreview(
        {
          weighedKg: parseKilograms(
            draft.weighing.find((r) => r.id === adjusting)?.kg || "",
          ),
          receiptKg: parseKilograms(
            draft.receipt.find((r) => r.id === activePair.receiptId)?.kg || "",
          ),
          weighedName:
            draft.weighing.find((r) => r.id === activePair.weighId)?.name ||
            null,
          receiptName:
            draft.receipt.find((r) => r.id === activePair.receiptId)?.name ||
            null,
          confirmed:
            activePair.decision === "confirmed" &&
            !activePair.reviewIssue &&
            validatePair(draft, activePair.weighId, activePair.receiptId).valid,
          savedAdjustmentKg: activePair.adjustment
            ? parseKilograms(activePair.adjustment)
            : null,
        },
        parseKilograms(adjustValue),
      )
    : null;
  async function saveAdjustment() {
    if (
      !activePair ||
      activePair.reviewIssue ||
      !validatePair(
        latestDraft.current,
        activePair.weighId,
        activePair.receiptId,
      ).valid ||
      !preview ||
      preview.status !== "ready" ||
      !explanation.trim() ||
      adjustmentSaving
    )
      return;
    const baseline = latestDraft.current;
    const session = activeSession.current;
    const next = {
      ...baseline,
      revision: baseline.revision + 1,
      savedAt: now(),
      pairs: baseline.pairs.map((p) =>
        p.weighId === adjusting
          ? { ...p, adjustment: adjustValue, explanation }
          : p,
      ),
    };
    setAdjustmentSaving(true);
    const ok = await persist(next);
    setAdjustmentSaving(false);
    if (
      !ok ||
      session !== activeSession.current ||
      latestDraft.current !== baseline
    )
      return;
    latestDraft.current = next;
    setDraft(next);
    setAdjusting(null);
    setNotice("Penyesuaian tersimpan. Nilai sumber tetap dipertahankan.");
  }
  async function upload(kind: "weighing" | "receipt", file?: File) {
    if (!file) return;
    cancelVision();
    const token = ++fileRequest.current;
    setUploading(null);
    setReading(false);
    setReadFailed(false);
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size === 0 ||
      file.size > 4 * 1024 * 1024
    ) {
      setReadFailed(true);
      setReadRetryable(false);
      setTab("data");
      setReadMessage(
        "Pilih foto JPG, PNG, atau WebP hingga 4 MB. Anda juga bisa memakai sumber teks.",
      );
      return;
    }
    setUploading(kind);
    const reader = new FileReader();
    reader.onload = () => {
      if (fileRequest.current !== token) return;
      const dataUrl = String(reader.result);
      const previewImage = new Image();
      const release = () => {
        previewImage.onload = null;
        previewImage.onerror = null;
      };
      previewImage.onload = () => {
        if (fileRequest.current !== token) {
          release();
          return;
        }
        if (!previewImage.naturalWidth || !previewImage.naturalHeight) {
          release();
          setUploading(null);
          setReadFailed(true);
          setReadRetryable(false);
          setTab("data");
          setReadMessage(
            "Foto kosong atau rusak. Sumber sebelumnya dan isian tetap dipertahankan.",
          );
          return;
        }
        release();
        setUploading(null);
        changeSource(kind, {
          text: "",
          image: dataUrl,
          filename: file.name,
          capturedAt: now(),
        });
        setReadFailed(false);
        setReadMessage(
          "Foto siap sebagai sumber. Belum ada pengiriman atau pembacaan AI. Isi manual atau pilih Baca dengan AI dan berikan persetujuan. Status simpan mengikuti pemberitahuan draf.",
        );
      };
      previewImage.onerror = () => {
        release();
        if (fileRequest.current !== token) return;
        setUploading(null);
        setReadFailed(true);
        setReadRetryable(false);
        setTab("data");
        setReadRetryable(false);
        setReadMessage(
          "Foto tidak dapat ditampilkan karena rusak atau formatnya tidak sesuai. Pilih foto lain atau sumber teks; isian dan sumber sebelumnya tetap dipertahankan.",
        );
      };
      previewImage.src = dataUrl;
    };
    reader.onerror = () => {
      if (fileRequest.current !== token) return;
      setUploading(null);
      setReadFailed(true);
      setReadRetryable(false);
      setTab("data");
      setReadMessage("Foto tidak dapat dibuka. Pilih ulang atau gunakan teks.");
    };
    reader.readAsDataURL(file);
  }
  function sourceView(kind: "weighing" | "receipt") {
    const source = draft.sources[kind];
    return (
      <div className="source-content">
        {source.image ? (
          <img
            className="source-photo"
            src={source.image}
            alt={`Sumber ${kind === "weighing" ? "catatan timbang" : "nota penjualan"}: ${source.filename}`}
          />
        ) : source.text ? (
          <pre>{source.text}</pre>
        ) : (
          <div className="empty-source">
            <OmbakPintar mood="empty" size="medium" />
            <p>Tambahkan sumber terlebih dahulu.</p>
          </div>
        )}
        <div className="source-caption">
          <Icon name="source" size={16} />
          <span>
            {source.filename || "Belum ada sumber"}
            {source.filename && (
              <small>Snapshot sumber · isian diperiksa secara terpisah</small>
            )}
          </span>
        </div>
      </div>
    );
  }
  function replaceDocument(kind: DocumentType) {
    cancelVision();
    fileRequest.current++;
    setReading(false);
    setUploading(null);
    setTab("source");
    setMode(draft.sources[kind].image ? "photo" : "text");
    setReadMessage(
      "Pilih sumber pengganti untuk langkah ini. Sumber lama tetap disimpan sampai sumber baru dipilih dan dapat dibuka.",
    );
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLInputElement | HTMLTextAreaElement>(
          ".source-panel input[type=file], .source-panel textarea",
        )
        ?.focus(),
    );
  }
  if (accountView && (accountLoading || !accountSession.user))
    return (
      <main className="storage-boot boot-v2" role="status">
        <BootScene />
        <p className="boot-title">Memuat sesi BuktiLaut…</p>
        <p className="boot-sub">Ombak sedang menyiapkan ruang kerja Anda</p>
      </main>
    );

  if (storageLoading)
    return (
      <main className="storage-boot boot-v2" role="status">
        <BootScene />
        <h1 className="boot-title">Memulihkan draf…</h1>
        <p className="boot-sub">Menunggu penyimpanan di perangkat ini</p>
      </main>
    );
  return (
    <>
      <div
        className={authRoute ? "auth-background" : undefined}
        inert={authRoute}
        aria-hidden={authRoute || undefined}
      >
        <a className="skip-link" href="#main-content">
          Lewati ke isi utama
        </a>
        <header className="site-header new-site-header no-print">
          <div
            className="header-inner"
            onKeyDown={(event) => {
              if (event.key === "Escape" && menuOpen) {
                leaveMenu();
                event.currentTarget
                  .querySelector<HTMLButtonElement>(".header-menu-toggle")
                  ?.focus();
              }
            }}
          >
            <button
              className="brand-button"
              aria-label="Beranda BuktiLaut"
              onClick={() => {
                navigate("/");
                setStep("home");
              }}
            >
              <img src="/brand/buktilaut-horizontal.svg" alt="BuktiLaut" />
            </button>
            <nav
              id="primary-nav"
              data-expanded={menuOpen}
              aria-label="Navigasi utama"
            >
              <button
                className={!accountView && step !== "home" ? "active" : ""}
                onClick={goInspection}
              >
                Pemeriksaan
              </button>
              {accountSession.user && (
                <button
                  className={accountView === "archive" ? "active" : ""}
                  onClick={() => navigate("/arsip")}
                >
                  Arsip Transaksi
                </button>
              )}
              {!accountSession.user && (
                <button
                  className="header-register"
                  onClick={() => navigate("/daftar")}
                >
                  Buat akun
                </button>
              )}
            </nav>
            <div
              className={`header-account-tools${accountSession.user ? " signed-in" : ""}`}
            >
              {!accountSession.user && (
                <button
                  className="header-account-cta"
                  onClick={() => navigate("/masuk")}
                >
                  <Icon name="user" size={17} />{" "}
                  <span className="cta-label">Masuk</span>
                </button>
              )}
              <button
                className="header-menu-toggle"
                type="button"
                aria-label={menuOpen ? "Tutup navigasi" : "Buka navigasi"}
                aria-controls="primary-nav"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((value) => !value)}
              >
                <Icon name={menuOpen ? "close" : "menu"} />
              </button>
            </div>
          </div>
        </header>
        {!accountView &&
          ((authRoute ? authOrigin?.step || "home" : step) === "home" ? (
            <main id="main-content" className="landing">
              {accountSession.user && (
                <div className="landing-account-navigation no-print">
                  <button
                    type="button"
                    className="dashboard-back"
                    onClick={() => navigate("/dashboard")}
                  >
                    <Icon name="arrow-left" size={17} /> Kembali ke Dashboard
                  </button>
                </div>
              )}
              {notice && (
                <div className="landing-notice callout info" role="status">
                  {notice}
                </div>
              )}
              <section className="hero-v2">
                <div className="hero-sea" aria-hidden="true">
                  <svg className="sea-waves" viewBox="0 0 1440 220" preserveAspectRatio="none">
                    <path className="wave wave-front" d="M0 180c120-20 240-20 360 0s240 20 360 0 240-20 360 0 240 20 360 0v40H0z" />
                  </svg>
                </div>
                <div className="hero-v2-inner">
                  <div className="hero-v2-copy">
                    <h1 ref={heading} tabIndex={-1}>
                      Catat Hasil Timbang.
                      <br />
                      Periksa Nota Penjualan.
                    </h1>
                    <p className="hero-v2-lead">
                      Untuk nelayan, pengepul, dan pencatat TPI. Foto catatan
                      timbang dan nota. BuktiLaut menyusun pasangan baris, Anda
                      mengonfirmasinya, dan selisih tampil tanpa mengubah angka
                      asli.
                    </p>
                    <div className="hero-v2-actions">
                      <button
                        className="button primary button-xl"
                        disabled={saveStatus === "saving"}
                        onClick={startNew}
                      >
                        <Icon name="camera" /> Mulai periksa
                      </button>
                      <button
                        className="button ghost button-xl"
                        onClick={() => begin(true)}
                        disabled={saveStatus === "saving"}
                      >
                        <Icon name="play" size={18} /> Buka contoh
                      </button>
                    </div>
                    <ul className="hero-trust" aria-label="Keunggulan">
                      <li>
                        <Icon name="check" size={16} /> Tanpa akun
                      </li>
                      <li>
                        <Icon name="check" size={16} /> Tersimpan di HP
                      </li>
                      <li>
                        <Icon name="check" size={16} /> Angka asli aman
                      </li>
                    </ul>
                    {(savedUser ||
                      (!cloudArchive && !draft.demo && draft.savedAt)) && (
                      <button
                        className="resume-draft"
                        disabled={saveStatus === "saving"}
                        onClick={() =>
                          resumeDraft(
                            !cloudArchive && !draft.demo && draft.savedAt
                              ? draft
                              : savedUser!,
                            recovered.warning,
                            savedUserPersisted,
                          )
                        }
                      >
                        <span className="resume-icon">
                          <Icon name="source" />
                        </span>
                        <span>
                          <small>Lanjutkan draf</small>
                          <strong>{savedUser?.id || draft.id}</strong>
                        </span>
                        <Icon name="arrow" />
                      </button>
                    )}
                    {savedDemo && (
                      <button
                        className="resume-draft"
                        disabled={saveStatus === "saving"}
                        onClick={() =>
                          resumeDraft(
                            !cloudArchive && draft.demo && draft.savedAt
                              ? draft
                              : savedDemo,
                            demoRecoveryWarning,
                            savedDemoPersisted,
                          )
                        }
                      >
                        <span className="resume-icon">
                          <Icon name="play" size={18} />
                        </span>
                        <span>
                          <small>Lanjutkan contoh</small>
                          <strong>BL-006</strong>
                        </span>
                        <Icon name="arrow" />
                      </button>
                    )}
                  </div>
                  <p className="sr-only">
                    Contoh: Teri 12 kg di catatan timbang dan 10 kg di nota,
                    selisih 2 kg. Angka bisa dibaca dari foto atau suara.
                  </p>
                  <div className="hero-v2-stage" aria-hidden="true">
                    <OmbakPintar mood="welcome" size="hero" />
                    <span className="float-chip chip-weigh">
                      <Icon name="scale" size={16} />
                      <span>
                        <small>Timbang · Teri</small>
                        <strong>12 kg</strong>
                      </span>
                    </span>
                    <span className="float-chip chip-receipt">
                      <Icon name="receipt" size={16} />
                      <span>
                        <small>Nota · Teri</small>
                        <strong>10 kg</strong>
                      </span>
                    </span>
                    <span className="float-chip chip-diff">
                      <Icon name="alert" size={16} />
                      <span>
                        <small>Selisih</small>
                        <strong>2 kg</strong>
                      </span>
                    </span>
                    <span className="float-chip chip-photo">
                      <Icon name="camera" size={16} />
                      <span>
                        <small>Foto nota terbaca</small>
                        <strong>2 baris</strong>
                      </span>
                    </span>
                    <span className="float-chip chip-voice">
                      <Icon name="mic" size={16} />
                      <span>
                        <small>Suara</small>
                        <strong>“Tongkol delapan kilo”</strong>
                      </span>
                    </span>
                  </div>
                </div>
              </section>
              <section className="how-v2" aria-labelledby="how-heading">
                <h2 id="how-heading">Cara pakai</h2>
                <ol className="how-steps">
                  {[
                    ["camera", "Foto", "Potret catatan timbang dan nota penjualan."],
                    ["compare", "Cocokkan", "Selisih per jenis ikan langsung terlihat."],
                    ["report", "Laporan", "Jelaskan selisih, simpan, dan cetak PDF."],
                  ].map(([icon, title, copy], index) => (
                    <li key={title} style={{ ["--i" as string]: index }}>
                      <span className="how-icon">
                        <Icon name={icon} size={24} />
                      </span>
                      <span className="how-num">0{index + 1}</span>
                      <h3>{title}</h3>
                      <p>{copy}</p>
                    </li>
                  ))}
                </ol>
                <button
                  type="button"
                  className="example-strip"
                  onClick={() => begin(true)}
                  disabled={saveStatus === "saving"}
                >
                  <span className="example-figures" aria-hidden="true">
                    <b>12</b>
                    <i>vs</i>
                    <b>10</b>
                    <em>2 kg</em>
                  </span>
                  <span className="example-copy">
                    <strong>Coba contoh Teri</strong>
                    <small>Lihat selisih 2 kg dijelaskan sampai laporan</small>
                  </span>
                  <Icon name="arrow" />
                </button>
              </section>
              <footer className="landing-footer footer-v2">
                <img src="/brand/buktilaut-horizontal.svg" alt="BuktiLaut" />
                <p>Catatan yang jelas untuk usaha perikanan.</p>
                <span>IT RUSH 2026</span>
              </footer>
            </main>
          ) : (
            <main
              id="main-content"
              className={`workspace ${step === "report" ? "report-workspace" : ""}`}
            >
              {accountSession.user && (
                <button
                  type="button"
                  className="dashboard-back no-print"
                  onClick={() => navigate("/dashboard")}
                >
                  <Icon name="arrow-left" size={17} /> Kembali ke Dashboard
                </button>
              )}
              <div className="context-row no-print">
                <button className="text-button" onClick={() => setStep("home")}>
                  Beranda
                </button>
                <span>/</span>
                <strong>{draft.id}</strong>
                <Badge tone={draft.demo ? "info" : ""}>
                  {cloudArchive
                    ? "Arsip akun · salinan sesi"
                    : draft.demo
                      ? "Data contoh (sintetis)"
                      : "Draf di perangkat ini"}
                </Badge>
                <span className="revision">
                  Revisi {draft.revision} ·{" "}
                  {cloudArchive
                    ? cloudArchive.syncedAt === draft.savedAt
                      ? "Tersimpan di akun"
                      : "Perubahan sesi belum disinkronkan"
                    : storageError
                      ? "Belum tersimpan"
                      : saveStatus === "saving"
                        ? "Menyimpan ke perangkat…"
                        : saveStatus === "saved"
                          ? "Tersimpan di perangkat"
                          : "Belum tersimpan"}
                </span>
              </div>
              {cloudArchive && (
                <div className="cloud-sync-banner no-print">
                  <span>
                    {cloudArchive.syncedAt === draft.savedAt
                      ? "Salinan revisi arsip akun. Draf lokal perangkat tidak diganti."
                      : "Perubahan hanya ada di sesi ini. Sinkronkan sebelum menutup halaman agar tersimpan ke akun."}
                  </span>
                  <button
                    className="text-button"
                    onClick={() => setAccountOpen(true)}
                  >
                    Simpan ke akun
                  </button>
                </div>
              )}
              {accountSession.user && !cloudArchive && (
                <button
                  className="button secondary account-save-button no-print"
                  onClick={() => setAccountOpen(true)}
                >
                  <Icon name="report" size={16} /> Simpan pemeriksaan aktif
                </button>
              )}
              <ol className="stepper no-print">
                {steps.map((s, i) => (
                  <li
                    key={s}
                    className={`${step === s ? "current" : ""} ${steps.indexOf(step) > i ? "done" : ""}`}
                  >
                    <button
                      disabled={
                        (s === "receipt" && !draft.weighingConfirmed) ||
                        (s === "matching" && !draft.receiptConfirmed) ||
                        (s === "report" && !allReviewed)
                      }
                      aria-current={step === s ? "step" : undefined}
                      onClick={() => setStep(s)}
                    >
                      <span className="step-number">
                        {steps.indexOf(step) > i ? (
                          <Icon name="check" size={16} />
                        ) : (
                          i + 1
                        )}
                      </span>
                      <span>
                        {
                          [
                            "Catatan timbang",
                            "Nota penjualan",
                            "Periksa pasangan",
                            "Laporan",
                          ][i]
                        }
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              {storageError && (
                <div className="callout error no-print" role="alert">
                  <Icon name="alert" />
                  <div>
                    <strong>Perubahan belum tersimpan</strong>
                    <p>{storageError}</p>
                    <button
                      className="text-button"
                      onClick={() => persist({ ...draft, savedAt: now() })}
                    >
                      Coba simpan lagi
                    </button>
                  </div>
                </div>
              )}
              {notice && (
                <div className="callout success no-print" role="status">
                  <OmbakPintar
                    mood={
                      notice.startsWith("Penyesuaian tersimpan")
                        ? "positive"
                        : "idle"
                    }
                  />
                  {notice}
                  <button
                    className="icon-button"
                    aria-label="Tutup pemberitahuan"
                    onClick={() => setNotice("")}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              )}
              {(step === "weighing" || step === "receipt") && (
                <div key={step} className="workflow-content">
                  <SourceStep
                    kind={step}
                    draft={draft}
                    step={step}
                    setStep={setStep}
                    setSourceModal={setSourceModal}
                    tab={tab}
                    setTab={setTab}
                    mode={mode}
                    setMode={setMode}
                    reading={reading}
                    setReading={setReading}
                    readMessage={readMessage}
                    setReadMessage={setReadMessage}
                    readOutcome={readOutcome}
                    setReadOutcome={setReadOutcome}
                    readFailed={readFailed}
                    setReadFailed={setReadFailed}
                    uploading={uploading}
                    setUploading={setUploading}
                    readingMode={readingMode}
                    visionStatusMessage={visionStatusMessage}
                    setConsentKind={setConsentKind}
                    readRetryable={readRetryable}
                    sourceConfirming={sourceConfirming}
                    retryWait={retryWait}
                    fileRequest={fileRequest}
                    heading={heading}
                    cancelVision={cancelVision}
                    update={update}
                    invalidate={invalidate}
                    editRow={editRow}
                    changeSource={changeSource}
                    receiveVoice={receiveVoice}
                    importVoice={importVoice}
                    applyProposal={applyProposal}
                    simulate={simulate}
                    confirmSource={confirmSource}
                    sourceValid={sourceValid}
                    total={total}
                    documentComparison={documentComparison}
                    receiptAmountHint={receiptAmountHint}
                    upload={upload}
                    sourceView={sourceView}
                    replaceDocument={replaceDocument}
                  />
                </div>
              )}
              {step === "matching" && (
                <MatchingStep
                  draft={draft}
                  setStep={setStep}
                  setArchiveChat={setArchiveChat}
                  setSourceModal={setSourceModal}
                  setChatOpen={setChatOpen}
                  setChatFindingId={setChatFindingId}
                  pairErrors={pairErrors}
                  setAdjusting={setAdjusting}
                  setAdjustValue={setAdjustValue}
                  setExplanation={setExplanation}
                  heading={heading}
                  update={update}
                  changePair={changePair}
                  pairResult={pairResult}
                  findings={findings}
                  unpairedReceipt={unpairedReceipt}
                  allReviewed={allReviewed}
                  total={total}
                  documentComparison={documentComparison}
                  receiptAmountHint={receiptAmountHint}
                />
              )}
              {step === "report" &&
                (allReviewed ? (
                  <ReportStep
                    draft={draft}
                    setStep={setStep}
                    accountSession={accountSession}
                    setAccountOpen={setAccountOpen}
                    cloudArchive={cloudArchive}
                    storageError={storageError}
                    heading={heading}
                    pairResult={pairResult}
                    findings={findings}
                    unpairedReceipt={unpairedReceipt}
                    total={total}
                    documentComparison={documentComparison}
                    receiptAmountHint={receiptAmountHint}
                  />
                ) : (
                  <div className="panel">
                    <h1>Laporan perlu ditinjau ulang</h1>
                    <p>
                      Data berubah. Konfirmasikan kembali sumber dan keputusan
                      pasangan.
                    </p>
                    <button
                      className="button primary"
                      onClick={() => setStep("weighing")}
                    >
                      Tinjau data terbaru
                    </button>
                  </div>
                ))}
            </main>
          ))}
        {!chatOpen &&
          !sourceModal &&
          !activePair &&
          !resetModal &&
          !consentKind &&
          !authRoute && (
            <button
              className={`chat-launcher ombak-fab no-print ${!accountView && step !== "home" ? "above-actions" : ""}`}
              aria-label="Buka bantuan Ombak Pintar"
              onClick={() => {
                setArchiveChat(false);
                setChatOpen(true);
              }}
            >
              <OmbakPintar
                mood={
                  step === "home"
                    ? "welcome"
                    : reading
                      ? "processing"
                      : readFailed
                        ? "error"
                        : "idle"
                }
              />
              <span className="fab-bubble" aria-hidden="true">
                Tanya Ombak
              </span>
            </button>
          )}
        {consentKind && (
          <Modal
            title="Kirim sumber untuk dibaca AI?"
            onClose={() => setConsentKind(null)}
          >
            <p>
              Sumber{" "}
              <strong>
                {draft.sources[consentKind].filename || "teks yang dipilih"}
              </strong>{" "}
              akan dikirim melalui server BuktiLaut ke penyedia Gemini. Dokumen
              mungkin memuat informasi pribadi. Unggah foto atau isi teks saja
              tidak mengirimkannya.
            </p>
            <div className="callout info">
              <p>{visionStatusMessage}</p>
            </div>
            <label className="vision-consent">
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={(event) => {
                  setConsentAccepted(event.target.checked);
                  setConsentedSource(
                    event.target.checked
                      ? draft.sources[consentKind].capturedAt
                      : "",
                  );
                }}
              />
              <span>
                Saya menyetujui pengiriman sumber yang dipilih ke layanan AI
                untuk pembacaan. Hasil tetap harus saya tinjau dan
                konfirmasikan.
              </span>
            </label>
            <p className="meta">
              AI dapat keliru. Tidak ada konfirmasi data, pasangan, penyesuaian,
              atau pembayaran otomatis.
            </p>
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={() => {
                  setConsentKind(null);
                  setReadMessage(
                    "Isi manual dipilih. Tidak ada sumber dikirim.",
                  );
                }}
              >
                Isi manual
              </button>
              <button
                className="button primary"
                disabled={!consentAccepted || !visionStatus?.available}
                onClick={() => readReal(consentKind)}
              >
                Setuju dan kirim sumber
              </button>
            </div>
            <button
              className="text-button"
              onClick={() => refreshVisionStatus()}
            >
              Periksa ketersediaan layanan
            </button>
          </Modal>
        )}
        {sourceModal && (
          <Modal
            title={
              sourceModal === "weighing"
                ? "Sumber catatan timbang"
                : "Sumber nota penjualan"
            }
            onClose={() => setSourceModal(null)}
            wide
          >
            {sourceView(sourceModal)}
            <p className="meta">
              Snapshot sumber dipisahkan dari koreksi isian pengguna.
            </p>
          </Modal>
        )}
        {resetModal && (
          <Modal
            title="Mulai pemeriksaan baru?"
            onClose={() => setResetModal(false)}
          >
            <p>
              Draf pengguna {savedUser?.id || "yang tersimpan"} di perangkat ini
              akan diganti. Cetak laporan terlebih dahulu bila ingin
              menyimpannya.
            </p>
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setResetModal(false)}
              >
                Lanjutkan draf
              </button>
              <button
                className="button primary"
                onClick={() => {
                  setResetModal(false);
                  begin(false);
                }}
              >
                Mulai baru
              </button>
            </div>
          </Modal>
        )}
        {activePair && (
          <Modal
            title="Jelaskan selisih berat"
            onClose={() => setAdjusting(null)}
            canClose={!adjustmentSaving}
          >
            <div className="adjustment-source">
              <span>Nilai sumber tetap</span>
              <strong>
                {kg(
                  parseKilograms(
                    draft.weighing.find((w) => w.id === activePair.weighId)
                      ?.kg || "",
                  ),
                )}{" "}
                timbang <span>→</span>{" "}
                {kg(
                  parseKilograms(
                    draft.receipt.find((r) => r.id === activePair.receiptId)
                      ?.kg || "",
                  ),
                )}{" "}
                nota
              </strong>
              <p>
                Hasil yang tersimpan:{" "}
                <b>{kg(pairResult(activePair).remainingKg)}</b>
              </p>
            </div>
            <label className="field">
              Alasan
              <select value="not-sold" onChange={() => {}}>
                <option value="not-sold">Tidak terjual</option>
              </select>
            </label>
            <label className="field">
              Berat tidak terjual (kg)
              <input
                autoFocus
                inputMode="decimal"
                value={adjustValue}
                onChange={(e) => setAdjustValue(e.target.value)}
                placeholder="Contoh: 2"
              />
            </label>
            <label className="field">
              Keterangan Anda
              <textarea
                rows={3}
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="Jelaskan apa yang terjadi, misalnya: Dibawa pulang."
              />
            </label>
            <div className="adjustment-preview">
              <div>
                <span>Sisa jika disimpan</span>
                <strong>
                  {preview?.status === "ready" ? kg(preview.remainingKg) : "—"}
                </strong>
              </div>
              <Badge tone="caution">Belum disimpan</Badge>
            </div>
            {adjustValue && preview?.status !== "ready" && (
              <p className="error-text" role="alert">
                {preview?.error ||
                  "Isi berat positif hingga sebesar selisih awal."}
              </p>
            )}
            <p className="meta">
              Pratinjau belum mengubah temuan atau laporan. Nilai baru berlaku
              setelah penyimpanan berhasil.
            </p>
            {storageError && (
              <div className="callout error" role="alert">
                {storageError} Isian penyesuaian tetap di sini.
              </div>
            )}
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setAdjusting(null)}
                disabled={adjustmentSaving}
              >
                Batal
              </button>
              <button
                className="button primary"
                disabled={
                  adjustmentSaving ||
                  preview?.status !== "ready" ||
                  !explanation.trim()
                }
                onClick={saveAdjustment}
              >
                {adjustmentSaving ? "Menyimpan…" : "Simpan penyesuaian"}
              </button>
            </div>
          </Modal>
        )}
        {(accountOpen || accountView) && accountSession.user && (
          <AccountArea
            key={`${accountSession.user.id}:${accountSession.activeWorkspaceId}:${accountOpen ? "save" : accountView}`}
            view={accountOpen ? "save" : accountView || "dashboard"}
            onNavigate={navigate}
            onStartInspection={startNew}
            onResumeInspection={goInspection}
            inspectionDraft={inspectionDraft}
            inspectionSaving={saveStatus === "saving"}
            session={accountSession}
            draft={draft}
            prepareArchive={prepareArchive}
            currentArchive={cloudArchive?.entry || null}
            canConfirm={allReviewed}
            onSession={changeAccount}
            onOpen={openCloud}
            canLeaveCloud={canLeaveCloud}
            onSynced={(entry, submitted) => {
              if (
                !accountSession.user ||
                !accountSession.activeWorkspaceId ||
                latestDraft.current.id !== submitted.id
              )
                return;
              if (!cloudArchiveRef.current)
                guestSnapshot.current = {
                  draft: latestDraft.current,
                  saveStatus,
                  storageError,
                  hasDraft,
                };
              const next = {
                entry,
                userId: accountSession.user.id,
                workspaceId: accountSession.activeWorkspaceId,
                syncedAt: submitted.savedAt,
              };
              cloudArchiveRef.current = next;
              setCloudArchive(next);
            }}
            onClose={() => setAccountOpen(false)}
            onAskArchive={() => {
              setAccountOpen(false);
              setArchiveChat(true);
              setChatOpen(true);
            }}
          />
        )}
        <Chat
          open={chatOpen}
          workspaceId={accountSession.activeWorkspaceId}
          workspaceName={
            accountSession.workspaces.find(
              (w) => w.id === accountSession.activeWorkspaceId,
            )?.name
          }
          sessionKey={`${accountSession.user?.id || "guest"}:${accountSession.activeWorkspaceId || "local"}:${draft.demo ? "demo" : "private"}:${draft.id}:${archiveChat ? "archive" : "inspection"}`}
          historyScope={
            accountSession.user &&
            accountSession.activeWorkspaceId &&
            (archiveChat || !draft.demo)
              ? {
                  accountId: accountSession.user.id,
                  workspaceId: accountSession.activeWorkspaceId,
                  contextId: archiveChat
                    ? "archive"
                    : "inspection:" +
                      (cloudArchive?.entry.transactionId ||
                        draft.transactionKey ||
                        draft.id),
                }
              : undefined
          }
          archiveWorkspaceId={
            archiveChat
              ? accountSession.activeWorkspaceId || undefined
              : undefined
          }
          onArchiveOpen={(id, revision) => {
            const userId = accountSession.user?.id;
            const workspaceId = accountSession.activeWorkspaceId;
            if (!userId || !workspaceId || !canLeaveCloud()) return;
            void readArchive(id, undefined, revision, workspaceId)
              .then((detail) => {
                if (
                  accountSessionRef.current.user?.id === userId &&
                  accountSessionRef.current.activeWorkspaceId === workspaceId
                )
                  openCloud(detail, detail.entry.status === "confirmed");
              })
              .catch((reason) =>
                setNotice(
                  reason instanceof Error
                    ? reason.message
                    : "Arsip belum dapat dibuka.",
                ),
              );
          }}
          key={`${accountSession.user?.id || "guest"}:${accountSession.activeWorkspaceId || "local"}:${draft.demo ? "demo" : "private"}:${draft.id}:${archiveChat ? "archive" : "inspection"}`}
          inspection={
            step === "matching" || step === "report"
              ? buildInspectionContext(draft)
              : undefined
          }
          initialFindingId={chatFindingId}
          examinationContext={examinationContext}
          context={`${draft.id} · Revisi ${draft.revision}`}
          demo={draft.demo}
          step={step}
          onClose={() => {
            setChatOpen(false);
            setChatFindingId(null);
          }}
          onAction={(action, revision) => {
            const current = latestDraft.current;
            if (
              current.id !== draft.id ||
              current.revision !== revision ||
              step !== "matching"
            ) {
              setNotice(
                "Jawaban ini merujuk revisi lama. Tanyakan kembali untuk data saat ini.",
              );
              return;
            }
            const finding = buildInspectionContext(current).findings.find(
              (item) => item.id === action.findingId,
            );
            if (!finding) {
              setNotice(
                "Pasangan tidak lagi tersedia. Tinjau pemeriksaan saat ini.",
              );
              return;
            }
            if (
              action.type === "view_weighing_source" &&
              finding.references.weighing
            ) {
              setChatOpen(false);
              setChatFindingId(null);
              setSourceModal("weighing");
            } else if (
              action.type === "view_receipt_source" &&
              finding.references.receipt
            ) {
              setChatOpen(false);
              setChatFindingId(null);
              setSourceModal("receipt");
            } else if (
              action.type === "open_adjustment" &&
              finding.references.adjustment
            ) {
              const pair = current.pairs.find(
                (item) =>
                  item.weighId === finding.references.adjustment!.weighId,
              );
              if (
                !pair ||
                !validatePair(current, pair.weighId, pair.receiptId).valid ||
                pair.decision !== "confirmed"
              )
                return;
              setChatOpen(false);
              setChatFindingId(null);
              setAdjusting(pair.weighId);
              setAdjustValue(pair.adjustment || "");
              setExplanation(pair.explanation);
            } else if (action.type === "view_finding" && finding.weighId) {
              setChatOpen(false);
              setChatFindingId(null);
              requestAnimationFrame(() => {
                const target = document.getElementById(
                  `inspection-pair-${finding.weighId}`,
                );
                if (target instanceof HTMLDetailsElement) target.open = true;
                target?.scrollIntoView({
                  block: "center",
                  behavior: window.matchMedia(
                    "(prefers-reduced-motion: reduce)",
                  ).matches
                    ? "instant"
                    : "smooth",
                });
                target?.focus({ preventScroll: true });
              });
            }
          }}
          onSource={() => {
            setChatOpen(false);
            setSourceModal(step === "weighing" ? "weighing" : "receipt");
          }}
        />
      </div>
      {authRoute && (
        <AccountAuth
          key={locationPath}
          mode={locationPath === "/daftar" ? "register" : "login"}
          onNavigate={navigate}
          onBack={closeAuth}
          onSession={(value) => {
            changeAccount(value);
            navigate("/dashboard", true);
          }}
        />
      )}
    </>
  );
}
