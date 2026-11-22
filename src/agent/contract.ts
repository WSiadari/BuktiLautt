import { buildInspectionFollowUp } from "../lib/archiveDomain.ts";
import type {
  InspectionContext,
  InspectionFinding,
} from "../lib/inspectionContext.ts";
import { calculatePair, parseKilograms } from "../lib/examination.ts";
import { normalizeFishName } from "../lib/matching.ts";

export const MAX_AGENT_FINDINGS = 50;
export const MAX_AGENT_BODY_BYTES = 64 * 1024;
export const MAX_AGENT_PROVIDER_TURNS = 2;
export const MAX_AGENT_TOOL_CALLS = 4;
export type InspectionAgentRequest = {
  requestId: string;
  question: string;
  snapshot: InspectionContext;
  findingId?: string;
};
export type AgentAction = {
  type:
    | "view_finding"
    | "view_weighing_source"
    | "view_receipt_source"
    | "open_adjustment";
  findingId: string;
};
export type AgentToolCall = {
  name: "list_findings" | "read_finding";
  findingId?: string;
};
export type InspectionAgentResponse = {
  requestId: string;
  draftId: string;
  revision: number;
  answer: string;
  referencedFindingIds: string[];
  clarification: boolean;
  actions: AgentAction[];
  provider: { name: "gemini"; model: string };
  toolCalls: AgentToolCall[];
};
export type InspectionAgentStatus = {
  available: boolean;
  provider: "gemini";
  model: string;
  reason: string | null;
  timeoutMs: number;
};

export function exactAgentObject(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
function id(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value);
}
function positiveWeight(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      value > 0 &&
      parseKilograms(value) === value)
  );
}
const readyStatuses = [
  "confirmed_open",
  "confirmed_resolved",
  "confirmed_equal",
];
export function validateInspectionContext(value: unknown): InspectionContext {
  if (
    !exactAgentObject(value, ["draftId", "revision", "findings"]) ||
    !id(value.draftId) ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 1 ||
    Number(value.revision) > 1_000_000_000 ||
    !Array.isArray(value.findings) ||
    value.findings.length > MAX_AGENT_FINDINGS
  )
    throw new Error("INVALID_INPUT");
  const findingIds = new Set<string>();
  const confirmedReceiptIds = new Set<string>();
  for (const finding of value.findings) {
    if (
      !exactAgentObject(finding, [
        "id",
        "weighId",
        "receiptId",
        "species",
        "status",
        "weighedKg",
        "receiptKg",
        "initialKg",
        "adjustmentKg",
        "remainingKg",
        "references",
      ]) ||
      !id(finding.id) ||
      findingIds.has(finding.id) ||
      !(finding.weighId === null || id(finding.weighId)) ||
      !(finding.receiptId === null || id(finding.receiptId)) ||
      (!finding.weighId && !finding.receiptId) ||
      finding.id !==
        (finding.weighId
          ? "pair:" + finding.weighId
          : "receipt:" + finding.receiptId) ||
      typeof finding.species !== "string" ||
      !finding.species.trim() ||
      finding.species.length > 120 ||
      /[\u0000-\u001f\u007f]/u.test(finding.species) ||
      typeof finding.status !== "string" ||
      ![
        ...readyStatuses,
        "unconfirmed",
        "unmatched",
        "review_required",
        "incomplete",
      ].includes(finding.status) ||
      !positiveWeight(finding.weighedKg) ||
      !positiveWeight(finding.receiptKg)
    )
      throw new Error("INVALID_INPUT");
    findingIds.add(finding.id);
    const references = finding.references;
    if (!exactAgentObject(references, ["weighing", "receipt", "adjustment"]))
      throw new Error("INVALID_INPUT");
    if (
      finding.weighId
        ? !exactAgentObject(references.weighing, ["kind", "rowId"]) ||
          references.weighing.kind !== "weighing" ||
          references.weighing.rowId !== finding.weighId
        : references.weighing !== null || finding.weighedKg !== null
    )
      throw new Error("INVALID_INPUT");
    if (
      finding.receiptId
        ? !exactAgentObject(references.receipt, ["kind", "rowId"]) ||
          references.receipt.kind !== "receipt" ||
          references.receipt.rowId !== finding.receiptId
        : references.receipt !== null || finding.receiptKg !== null
    )
      throw new Error("INVALID_INPUT");
    if (readyStatuses.includes(finding.status)) {
      if (
        !finding.weighId ||
        !finding.receiptId ||
        confirmedReceiptIds.has(finding.receiptId) ||
        typeof finding.adjustmentKg !== "number"
      )
        throw new Error("INVALID_INPUT");
      confirmedReceiptIds.add(finding.receiptId);
      const result = calculatePair({
        weighedName: finding.species,
        receiptName: finding.species,
        weighedKg: finding.weighedKg as number | null,
        receiptKg: finding.receiptKg as number | null,
        confirmed: true,
        savedAdjustmentKg: finding.adjustmentKg,
      });
      if (
        result.status !== "ready" ||
        result.initialKg !== finding.initialKg ||
        result.adjustmentKg !== finding.adjustmentKg ||
        result.remainingKg !== finding.remainingKg
      )
        throw new Error("INVALID_INPUT");
      const expectedStatus =
        result.remainingKg !== 0
          ? "confirmed_open"
          : result.adjustmentKg! > 0
            ? "confirmed_resolved"
            : "confirmed_equal";
      if (finding.status !== expectedStatus) throw new Error("INVALID_INPUT");
      if (
        result.initialKg! > 0
          ? !exactAgentObject(references.adjustment, ["weighId"]) ||
            references.adjustment.weighId !== finding.weighId
          : references.adjustment !== null
      )
        throw new Error("INVALID_INPUT");
    } else if (
      finding.initialKg !== null ||
      finding.adjustmentKg !== null ||
      finding.remainingKg !== null ||
      references.adjustment !== null
    )
      throw new Error("INVALID_INPUT");
  }
  return structuredClone(value) as InspectionContext;
}
export function validateInspectionAgentRequest(
  value: unknown,
): InspectionAgentRequest {
  const hasFocus =
    !!value && typeof value === "object" && Object.hasOwn(value, "findingId");
  if (
    !exactAgentObject(value, [
      "requestId",
      "question",
      "snapshot",
      ...(hasFocus ? ["findingId"] : []),
    ]) ||
    !id(value.requestId) ||
    typeof value.question !== "string" ||
    !value.question.trim() ||
    value.question.length > 1000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value.question)
  )
    throw new Error("INVALID_INPUT");
  const snapshot = validateInspectionContext(value.snapshot);
  if (
    hasFocus &&
    (!id(value.findingId) ||
      !snapshot.findings.some((finding) => finding.id === value.findingId))
  )
    throw new Error("INVALID_INPUT");
  return {
    requestId: value.requestId,
    question: value.question,
    snapshot,
    ...(hasFocus ? { findingId: value.findingId as string } : {}),
  };
}
export type FindingTargetResolution = {
  kind: "not_found" | "general" | "single" | "multiple" | "unclear";
  targets: InspectionFinding[];
  requestedSpecies: string[];
};

const questionWords = new Set([
  "berapa", "selisih", "perbedaan", "berat", "sisa", "awal", "dari", "di",
  "pada", "untuk", "tentang", "mengenai", "apakah", "apa", "ada", "masih",
  "terbuka", "yang", "ini", "itu", "tersebut", "sekarang", "saat", "dengan",
  "setelah", "sebelum", "sudah", "belum", "terkonfirmasi", "kg", "kilo",
  "kilogram", "mohon", "tolong", "kenapa", "mengapa", "bagaimana", "gimana",
  "jelaskan", "dan", "atau", "kok", "ya", "dong", "bisa", "saja", "semua",
  "penyesuaian", "nota", "timbang", "catatan", "penjualan", "dibanding",
  "dibandingkan", "hasil", "temuan", "pemeriksaan", "pasangan",
  "hasilnya", "caranya", "cara", "penyebab", "penyebabnya", "begitu",
  "begini", "maksudnya", "kesalahan", "terjadi", "saya", "aku", "kami",
  "kita", "anda", "kamu",
]);
const knownFishLabels = [
  "teri", "tongkol", "kembung", "tuna", "kakap", "kerapu", "bandeng",
  "bawal", "cakalang", "selar", "layang", "lemuru", "kuwe", "nila",
  "lele", "gurame", "mujair", "patin", "salmon",
];
function boundedQuestionName(value: string): string | null {
  const words = value.trim().split(/\s+/u);
  const end = words.findIndex(word => questionWords.has(word));
  const candidate = words.slice(0, end === -1 ? words.length : end);
  if (!candidate.length || candidate.length > 4) return null;
  return normalizeFishName(candidate.join(" "));
}

function questionSpecies(question: string, findings: InspectionFinding[]): string[] {
  const labels = new Set(knownFishLabels);
  for (const finding of findings) {
    const label = normalizeFishName(finding.species);
    if (label) labels.add(label);
  }
  const patterns = [
    /(?:selisih|perbedaan)(?:\s+berat)?(?:\s+(?:untuk|pada))?\s+["'“]?([\p{L}][\p{L}\p{M} -]*)/gu,
    /(?:untuk|tentang|mengenai|pada|ikan)\s+["'“]?([\p{L}][\p{L}\p{M} -]*)/gu,
    /(?:dan|dengan|vs|dibanding(?:kan)?)\s+["'“]?([\p{L}][\p{L}\p{M} -]*)/gu,
    /(?:kenapa|mengapa|jelaskan|bagaimana)\s+["'“]?([\p{L}][\p{L}\p{M} -]*)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of question.matchAll(pattern)) {
      const label = boundedQuestionName(match[1]);
      if (label) labels.add(label);
    }
  }
  if (/^[\p{L}\p{M} -]+[?!.,]*$/u.test(question) &&
      [...labels].some(label => question === label || question.startsWith(label + " ") || question.startsWith(label + "-"))) {
    const label = boundedQuestionName(question.replace(/[?!.,]+$/u, ""));
    if (label) labels.add(label);
  }
  const mentions: { label: string; start: number; end: number }[] = [];
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${escaped})(?=$|[^\\p{L}\\p{N}])`, "gu");
    for (const match of question.matchAll(pattern)) {
      const start = match.index + match[1].length;
      mentions.push({ label, start, end: start + match[2].length });
    }
  }
  return [...new Set(mentions.filter(mention => !mentions.some(other =>
    other.label !== mention.label && other.start <= mention.start &&
    other.end >= mention.end && other.end - other.start > mention.end - mention.start,
  )).map(mention => mention.label))];
}

export function resolveFindingTargets(request: InspectionAgentRequest): FindingTargetResolution {
  const question = request.question.normalize("NFKC").toLocaleLowerCase("id-ID").replace(/\s+/gu, " ").trim();
  if (/[\p{L}][?/][\p{L}]/u.test(question)) {
    return { kind: "unclear", targets: [], requestedSpecies: [] };
  }
  const requestedSpecies = questionSpecies(question, request.snapshot.findings);
  const selected = request.snapshot.findings.find(finding => finding.id === request.findingId);
  if (requestedSpecies.length) {
    const missing = requestedSpecies.filter(name => !request.snapshot.findings.some(finding => normalizeFishName(finding.species) === name));
    if (missing.length) return { kind: "not_found", targets: [], requestedSpecies: missing };
    const targets = request.snapshot.findings.filter(finding => requestedSpecies.includes(normalizeFishName(finding.species) ?? ""));
    if (requestedSpecies.length === 1 && selected && targets.some(finding => finding.id === selected.id)) {
      return { kind: "single", targets: [selected], requestedSpecies };
    }
    return { kind: targets.length === 1 ? "single" : "multiple", targets, requestedSpecies };
  }
  const general = /^(?:(?:apa(?: saja)?|apakah|ada|berapa|jelaskan|lihat|tampilkan|ringkas|daftar)\s+)?(?:(?:saja|ada|semua|seluruh|daftar|ringkasan)\s+)*(?:selisih(?: berat)?|temuan|pemeriksaan|pasangan)(?:\s+(?:yang|masih|belum|sudah|terbuka|aktif|ini|sekarang|saja|ada|dijelaskan|tersisa))*[?.!]*$/u.test(question);
  const requestsAllFindings = /\b(?:apa saja|semua|seluruh|daftar|ringkas|tampilkan|lihat)\b/u.test(question);
  if (selected && !requestsAllFindings) return { kind: "single", targets: [selected], requestedSpecies: [] };
  return {
    kind: general ? "general" : "unclear",
    targets: general ? request.snapshot.findings : [],
    requestedSpecies: [],
  };
}

export function findingTargets(request: InspectionAgentRequest): InspectionFinding[] {
  return resolveFindingTargets(request).targets;
}
export function validateAgentToolCall(
  value: unknown,
  snapshot: InspectionContext,
): AgentToolCall {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("INVALID_OUTPUT");
  const call = value as Record<string, unknown>;
  if (
    call.name === "list_findings" &&
    exactAgentObject(call, ["name", "args"]) &&
    exactAgentObject(call.args, [])
  )
    return { name: "list_findings" };
  if (
    call.name === "read_finding" &&
    exactAgentObject(call, ["name", "args"]) &&
    exactAgentObject(call.args, ["id"]) &&
    typeof call.args.id === "string" &&
    snapshot.findings.some(
      (finding) => finding.id === (call.args as Record<string, unknown>).id,
    )
  )
    return { name: "read_finding", findingId: call.args.id };
  throw new Error("INVALID_OUTPUT");
}
export function agentToolResult(
  call: AgentToolCall,
  snapshot: InspectionContext,
) {
  if (call.name === "list_findings")
    return {
      findings: snapshot.findings.map((finding) => ({
        id: finding.id,
        species: finding.species,
        status: finding.status,
      })),
    };
  return {
    finding: snapshot.findings.find(
      (finding) => finding.id === call.findingId,
    )!,
  };
}
const weight = (value: number | null) =>
  value === null
    ? "belum diketahui"
    : `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(value)} kg`;
export function isInspectionFollowUp(question: string): boolean {
 return /^(?:apa(?: saja)? yang (?:masih )?perlu (?:saya )?(?:cek|periksa|tinjau|dicek|diperiksa|ditinjau)(?: sebelum laporan)?|(?:ringkas|ringkasan) tindak lanjut)[?!.]*$/iu.test(question.normalize("NFKC").trim().replace(/\s+/gu," "));
}
export function renderInspectionAnswer(
  request: InspectionAgentRequest,
  toolCalls: AgentToolCall[],
  model: string,
): InspectionAgentResponse {
  if (!toolCalls.length || toolCalls.length > MAX_AGENT_TOOL_CALLS)
    throw new Error("INVALID_OUTPUT");
  if (isInspectionFollowUp(request.question)) {
    if (!toolCalls.some(call=>call.name==="list_findings")) throw new Error("INVALID_OUTPUT");
    const summary=buildInspectionFollowUp(request.snapshot);
    const ids=summary.followUpFindingIds;
    return {requestId:request.requestId,draftId:request.snapshot.draftId,revision:request.snapshot.revision,
      answer:`Ringkasan pemeriksaan berat: ${summary.confirmedPairCount} pasangan terkonfirmasi, ${summary.pendingDecisionCount} keputusan menunggu, ${summary.openDifferenceCount} selisih terbuka, ${summary.unmatchedItemCount} item tanpa pasangan, ${summary.reviewRequiredCount} perlu ditinjau ulang, dan ${summary.incompleteCount} data belum lengkap. ${ids.length?"Buka temuan untuk meninjau sumber atau keputusan yang masih perlu diperiksa.":"Tidak ada tindak lanjut berat pada revisi ini."} Asisten tidak mengubah data atau menyimpan penyesuaian.`,
      referencedFindingIds:ids,clarification:false,actions:ids.map(findingId=>({type:request.snapshot.findings.find(f=>f.id===findingId)?.weighId?"view_finding" as const:"view_receipt_source" as const,findingId})),provider:{name:"gemini",model},toolCalls};
  }
  const resolution = resolveFindingTargets(request);
  const targets = resolution.targets;
  const readIds = new Set(
    toolCalls
      .filter((call) => call.name === "read_finding")
      .map((call) => call.findingId),
  );
  const clarification = resolution.kind === "unclear" || resolution.kind === "multiple" ||
    (resolution.kind === "general" && targets.length > 1);
  if (targets.length === 1 && !readIds.has(targets[0].id))
    throw new Error("INVALID_OUTPUT");
  if (targets.length !== 1 && !toolCalls.some((call) => call.name === "list_findings"))
    throw new Error("INVALID_OUTPUT");
  const actions: AgentAction[] = [];
  let answer: string;
  if (resolution.kind === "not_found") {
    const names = resolution.requestedSpecies.map(name => name[0].toLocaleUpperCase("id-ID") + name.slice(1));
    answer = `${names.join(", ")} tidak ditemukan di pemeriksaan ini.`;
  } else if (resolution.kind === "unclear") {
    answer = "Ikan atau baris mana yang ingin Anda periksa? Sebutkan nama ikan agar saya membaca data yang tepat.";
  } else if (!targets.length) {
    answer = "Belum ada temuan pada pemeriksaan ini. Tambahkan dan tinjau sumber sebelum meminta penjelasan selisih.";
  } else if (clarification) {
    answer = resolution.kind === "general"
      ? "Berikut temuan pada pemeriksaan aktif. Pilih baris yang ingin dijelaskan."
      : "Ada beberapa baris yang sesuai. Pilih temuan yang ingin dijelaskan agar saya membaca pasangan yang tepat.";
    for (const finding of targets)
      actions.push({ type: "view_finding", findingId: finding.id });
  } else {
    const finding = targets[0];
    const source = `${finding.species}: Catatan Timbang ${weight(finding.weighedKg)}, Nota Penjualan ${weight(finding.receiptKg)}.`;
    const nonready: Record<string, string> = {
      unconfirmed:
        "Pasangan ini belum dikonfirmasi. Selisih belum dapat dinyatakan. Tinjau sumber dan konfirmasikan pasangan melalui form.",
      unmatched:
        "Baris ini dicatat tanpa pasangan. Selisih terhadap baris lain belum dapat dihitung.",
      review_required:
        "Pasangan atau sumber perlu ditinjau ulang. Hasil lama belum menjadi hasil revisi saat ini.",
      incomplete:
        "Data pasangan belum lengkap. Lengkapi dan konfirmasikan isian sebelum melihat selisih.",
    };
    if (!readyStatuses.includes(finding.status))
      answer = source + " " + nonready[finding.status];
    else {
      answer =
        source +
        ` Selisih awal ${weight(finding.initialKg)}. Penyesuaian Tidak terjual yang tersimpan ${weight(finding.adjustmentKg)}. Sisa selisih ${weight(finding.remainingKg)}.`;
      if (finding.status === "confirmed_equal")
        answer += " Berat kedua sumber sama pada pasangan ini.";
      else if (finding.status === "confirmed_resolved")
        answer +=
          " Selisih berat sudah disesuaikan melalui isian pengguna. Kedua berat sumber tetap dipertahankan.";
      else {
        answer +=
          " Angka menunjukkan perbedaan berat; penyebabnya tetap perlu Anda pastikan.";
        if (finding.remainingKg! > 0 && finding.references.adjustment)
          answer += ` Kalau Anda sudah memastikan ${weight(finding.remainingKg)} itu tidak terjual, buka penyesuaian Tidak terjual dan catat sesuai kondisi. Angka belum berubah sampai Anda menyimpannya.`;
        if (finding.initialKg! < 0)
          answer +=
            " Berat nota lebih besar daripada catatan timbang. Tinjau kedua sumber; alasan Tidak terjual tidak berlaku untuk arah selisih ini.";
      }
    }
    actions.push({ type: "view_finding", findingId: finding.id });
    if (finding.references.weighing)
      actions.push({ type: "view_weighing_source", findingId: finding.id });
    if (finding.references.receipt)
      actions.push({ type: "view_receipt_source", findingId: finding.id });
    if (finding.references.adjustment && readyStatuses.includes(finding.status))
      actions.push({ type: "open_adjustment", findingId: finding.id });
  }
  return {
    requestId: request.requestId,
    draftId: request.snapshot.draftId,
    revision: request.snapshot.revision,
    answer,
    referencedFindingIds: targets.map((finding) => finding.id),
    clarification,
    actions,
    provider: { name: "gemini", model },
    toolCalls,
  };
}
export function validateInspectionAgentResponse(
  value: unknown,
  request: InspectionAgentRequest,
): InspectionAgentResponse {
  if (
    !exactAgentObject(value, [
      "requestId",
      "draftId",
      "revision",
      "answer",
      "referencedFindingIds",
      "clarification",
      "actions",
      "provider",
      "toolCalls",
    ]) ||
    value.requestId !== request.requestId ||
    value.draftId !== request.snapshot.draftId ||
    value.revision !== request.snapshot.revision ||
    !exactAgentObject(value.provider, ["name", "model"]) ||
    value.provider.name !== "gemini" ||
    typeof value.provider.model !== "string" ||
    !/^[a-zA-Z0-9.-]{1,100}$/.test(value.provider.model) ||
    !Array.isArray(value.toolCalls)
  )
    throw new Error("INVALID_OUTPUT");
  const calls = value.toolCalls.map((call) => {
    if (exactAgentObject(call, ["name"]) && call.name === "list_findings")
      return validateAgentToolCall(
        { name: call.name, args: {} },
        request.snapshot,
      );
    if (
      exactAgentObject(call, ["name", "findingId"]) &&
      call.name === "read_finding"
    )
      return validateAgentToolCall(
        { name: call.name, args: { id: call.findingId } },
        request.snapshot,
      );
    throw new Error("INVALID_OUTPUT");
  });
  const expected = renderInspectionAnswer(request, calls, value.provider.model);
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    for (const key of [
      "answer",
      "referencedFindingIds",
      "clarification",
      "actions",
    ] as const)
      if (JSON.stringify(value[key]) !== JSON.stringify(expected[key]))
        throw new Error("INVALID_OUTPUT");
  }
  return expected;
}
