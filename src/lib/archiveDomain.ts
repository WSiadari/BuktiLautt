import type { Draft } from "../types.ts";
import type { InspectionContext } from "./inspectionContext.ts";
import { calculatePair, calculateReceiptTotals, parseKilograms } from "./examination.ts";
import { sourceDocumentGate } from "./documentValidation.ts";
import { confirmedPairsAreValid } from "./matching.ts";

export type ArchiveRevision = {
  transactionId: string;
  revision: number;
  status: "draft" | "confirmed";
  transactionDate: string | null;
  transactionDateConfirmed: boolean;
  reference?: string;
  workspaceId?: string;
  transactionTime?: string | null;
  counterpartyName?: string | null;
  receiptNumber?: string | null;
  createdAt?: string;
  updatedAt?: string;
  draft: Draft;
};
export type ArchiveQuery = {
  fromDate?: string; toDate?: string;
  status?: "confirmed" | "draft" | "all";
  counterpartyName?: string; reference?: string; receiptNumber?: string; transactionId?: string;
  offset?: number; limit?: number;
};
export type ArchiveTransactionCard = {
  transactionId: string; reference: string | null; revision: number; status: "draft" | "confirmed";
  transactionDate: string | null; transactionDateConfirmed: boolean; transactionTime: string | null;
  counterpartyName: string | null; receiptNumber: string | null; workspaceId: string | null;
  latestConfirmedRevision: number | null; totalRupiah: number | null;
  createdAt: string | null; updatedAt: string | null;
};
export type ArchiveQuerySummary = {
  timezone: "Asia/Jakarta"; fromDate: string | null; toDate: string | null;
  statusFilter: "confirmed" | "draft" | "all";
  status: "none" | "known" | "incomplete" | "overflow"; totalRupiah: number | null;
  transactionCount: number; confirmedCount: number; draftCount: number; unknownTotalCount: number;
  offset: number; limit: number; hasMore: boolean;
};

export function validateArchiveQuery(value: unknown): ArchiveQuery {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_ARCHIVE_QUERY");
  const query = value as Record<string, unknown>;
  const allowed = ["fromDate", "toDate", "status", "counterpartyName", "reference", "receiptNumber", "transactionId", "offset", "limit"];
  if (Object.keys(query).some(key => !allowed.includes(key))) throw new Error("INVALID_ARCHIVE_QUERY");
  for (const key of ["fromDate", "toDate"] as const) if (query[key] !== undefined && !archiveDateKey(query[key])) throw new Error("INVALID_ARCHIVE_QUERY");
  if (query.fromDate && query.toDate && String(query.fromDate) > String(query.toDate)) throw new Error("INVALID_ARCHIVE_QUERY");
  if (query.status !== undefined && (typeof query.status !== "string" || !["confirmed", "draft", "all"].includes(query.status))) throw new Error("INVALID_ARCHIVE_QUERY");
  for (const key of ["counterpartyName", "reference", "receiptNumber", "transactionId"] as const) {
    if (query[key] !== undefined && (typeof query[key] !== "string" || !query[key].trim() || query[key].length > 160 || /[\u0000-\u001f\u007f]/u.test(query[key]))) throw new Error("INVALID_ARCHIVE_QUERY");
  }
  for (const [key, maximum] of [["offset", 1_000_000], ["limit", 50]] as const) if (query[key] !== undefined && (!Number.isSafeInteger(query[key]) || Number(query[key]) < (key === "limit" ? 1 : 0) || Number(query[key]) > maximum)) throw new Error("INVALID_ARCHIVE_QUERY");
  return { ...query } as ArchiveQuery;
}

function searchKey(value: string): string { return value.normalize("NFKC").trim().toLocaleLowerCase("id-ID").replace(/\s+/gu, " "); }

export function queryArchive(records: ArchiveRevision[], input: ArchiveQuery = {}): { entries: ArchiveTransactionCard[]; summary: ArchiveQuerySummary } {
  const query = validateArchiveQuery(input);
  const statusFilter = query.status ?? "confirmed", offset = query.offset ?? 0, limit = query.limit ?? 20;
  const workspaces = new Set(records.map(record => record.workspaceId).filter(Boolean));
  if (workspaces.size > 1) throw new Error("MIXED_ARCHIVE_WORKSPACES");
  const latest = new Map<string, ArchiveRevision>(), confirmed = new Map<string, ArchiveRevision>();
  const versions = new Map<string, string>();
  const identity = new Map<string, { reference?: string; workspaceId?: string }>();
  const references = new Map<string, string>();
  for (const record of records) {
    if (!validateArchiveRevision(record)) throw new Error("INVALID_ARCHIVE_REVISION");
    const oldIdentity = identity.get(record.transactionId);
    if (oldIdentity && ((oldIdentity.reference && record.reference && oldIdentity.reference !== record.reference) || (oldIdentity.workspaceId && record.workspaceId && oldIdentity.workspaceId !== record.workspaceId))) throw new Error("CHANGED_ARCHIVE_IDENTITY");
    identity.set(record.transactionId, { reference: record.reference ?? oldIdentity?.reference, workspaceId: record.workspaceId ?? oldIdentity?.workspaceId });
    if (record.reference && references.has(record.reference) && references.get(record.reference) !== record.transactionId) throw new Error("DUPLICATE_ARCHIVE_REFERENCE");
    if (record.reference) references.set(record.reference, record.transactionId);
    const versionKey = `${record.transactionId}:${record.revision}`;
    const signature = JSON.stringify(record);
    if (versions.has(versionKey) && versions.get(versionKey) !== signature) throw new Error("CONFLICTING_ARCHIVE_REVISION");
    versions.set(versionKey, signature);
    if (!latest.has(record.transactionId) || latest.get(record.transactionId)!.revision < record.revision) latest.set(record.transactionId, record);
    if (record.status === "confirmed" && (!confirmed.has(record.transactionId) || confirmed.get(record.transactionId)!.revision < record.revision)) confirmed.set(record.transactionId, record);
  }
  const selected = statusFilter === "confirmed" ? confirmed : latest;
  const entries = [...selected.values()].filter(record => {
    if (statusFilter !== "all" && record.status !== statusFilter) return false;
    if (query.fromDate && (!record.transactionDate || record.transactionDate < query.fromDate)) return false;
    if (query.toDate && (!record.transactionDate || record.transactionDate > query.toDate)) return false;
    if (query.transactionId && record.transactionId !== query.transactionId) return false;
    if (query.counterpartyName && !searchKey(record.counterpartyName ?? "").includes(searchKey(query.counterpartyName))) return false;
    if (query.reference && searchKey(record.reference ?? "") !== searchKey(query.reference)) return false;
    return !query.receiptNumber || searchKey(record.receiptNumber ?? "") === searchKey(query.receiptNumber);
  }).map(record => ({
    transactionId: record.transactionId, reference: record.reference ?? null, revision: record.revision,
    status: record.status, transactionDate: record.transactionDate, transactionDateConfirmed: record.transactionDateConfirmed,
    transactionTime: record.transactionTime ?? null, counterpartyName: record.counterpartyName ?? null,
    receiptNumber: record.receiptNumber ?? null, workspaceId: record.workspaceId ?? null,
    latestConfirmedRevision: confirmed.get(record.transactionId)?.revision ?? null,
    totalRupiah: archiveRevisionTotal(record), createdAt: record.createdAt ?? null, updatedAt: record.updatedAt ?? null,
  })).sort((a, b) => (b.transactionDate ?? "").localeCompare(a.transactionDate ?? "") || a.transactionId.localeCompare(b.transactionId));
  const unknownTotalCount = entries.filter(entry => entry.totalRupiah === null).length;
  const sum = entries.reduce((total, entry) => total + BigInt(entry.totalRupiah ?? 0), 0n);
  const status = !entries.length ? "none" : unknownTotalCount ? "incomplete" : sum > BigInt(Number.MAX_SAFE_INTEGER) ? "overflow" : "known";
  return { entries: entries.slice(offset, offset + limit), summary: {
    timezone: "Asia/Jakarta", fromDate: query.fromDate ?? null, toDate: query.toDate ?? null, statusFilter,
    status, totalRupiah: status === "known" ? Number(sum) : null, transactionCount: entries.length,
    confirmedCount: entries.filter(entry => entry.status === "confirmed").length,
    draftCount: entries.filter(entry => entry.status === "draft").length, unknownTotalCount,
    offset, limit, hasMore: offset + limit < entries.length,
  } };
}
export type ArchiveSummary = {
  timezone: "Asia/Jakarta";
  fromDate: string;
  toDate: string;
  status: "none" | "known" | "incomplete" | "overflow";
  totalRupiah: number | null;
  transactionCount: number;
  unknownTotalCount: number;
  draftCount: number;
  references: {
    transactionId: string;
    revision: number;
    transactionDate: string;
    totalRupiah: number | null;
  }[];
};

export function archiveDateKey(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

function rupiah(value: string): number | null {
  return /^\d+$/u.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
}
function receiptTotals(draft: Draft) {
  return calculateReceiptTotals(draft.receipt.map(row => ({
    receiptKg: parseKilograms(row.kg), pricePerKg: rupiah(row.price),
  })), rupiah(draft.deduction), rupiah(draft.charges));
}

export function isArchiveConfirmationReady(draft: Draft): boolean {
  if (!draft.weighingConfirmed || !draft.receiptConfirmed || !confirmedPairsAreValid(draft)) return false;
  for (const kind of ["weighing", "receipt"] as const) {
    if (!(draft.sources[kind].text.trim() || draft.sources[kind].image) ||
        !sourceDocumentGate(draft, kind).canConfirm || !draft[kind].length ||
        new Set(draft[kind].map(row => row.id)).size !== draft[kind].length) return false;
    if (!draft[kind].every(row => {
      const weight = parseKilograms(row.kg);
      return !!row.name.trim() && weight !== null && weight > 0 &&
        (kind === "weighing" || (!row.price.trim() || rupiah(row.price) !== null)) &&
        (kind === "weighing" || !row.sourceSubtotal?.trim() || rupiah(row.sourceSubtotal) !== null);
    })) return false;
  }
  if ([draft.deduction, draft.charges].some(value => value.trim() && rupiah(value) === null) ||
      receiptTotals(draft).status === "invalid" || draft.pairs.length !== draft.weighing.length) return false;
  for (const weighed of draft.weighing) {
    const pairs = draft.pairs.filter(pair => pair.weighId === weighed.id);
    if (pairs.length !== 1 || pairs[0].decision === "pending" || pairs[0].reviewIssue) return false;
    const pair = pairs[0];
    if (pair.decision !== "confirmed") continue;
    const receipt = draft.receipt.find(row => row.id === pair.receiptId);
    const savedAdjustmentKg = pair.adjustment ? parseKilograms(pair.adjustment) : null;
    if (pair.adjustment && (savedAdjustmentKg === null || savedAdjustmentKg <= 0)) return false;
    if (calculatePair({
      weighedName: weighed.name, receiptName: receipt?.name ?? null,
      weighedKg: parseKilograms(weighed.kg), receiptKg: parseKilograms(receipt?.kg ?? null),
      confirmed: true, savedAdjustmentKg,
    }).status !== "ready") return false;
  }
  return draft.receipt.every(row => draft.pairs.some(pair => pair.decision === "confirmed" && pair.receiptId === row.id) || draft.unmatchedReceipts.includes(row.id));
}

export function validateArchiveRevision(record: ArchiveRevision): boolean {
  return typeof record.transactionId === "string" && !!record.transactionId.trim() &&
    record.transactionId.length <= 160 && Number.isSafeInteger(record.revision) && record.revision > 0 &&
    (record.status === "draft" || record.status === "confirmed") &&
    typeof record.transactionDateConfirmed === "boolean" &&
    (record.reference === undefined || typeof record.reference === "string" && /^BL-\d{8}-\d{6,}$/u.test(record.reference)) &&
    (record.workspaceId === undefined || typeof record.workspaceId === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/u.test(record.workspaceId)) &&
    (record.transactionTime === undefined || record.transactionTime === null || typeof record.transactionTime === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/u.test(record.transactionTime)) &&
    [record.counterpartyName, record.receiptNumber].every(value => value === undefined || value === null || typeof value === "string" && !!value.trim() && value.length <= 160 && !/[\u0000-\u001f\u007f]/u.test(value)) &&
    [record.createdAt, record.updatedAt].every(value => value === undefined || typeof value === "string" && Number.isFinite(Date.parse(value))) &&
    (record.transactionDate === null || archiveDateKey(record.transactionDate) !== null) &&
    (record.status !== "confirmed" || (record.transactionDateConfirmed &&
      record.transactionDate !== null && isArchiveConfirmationReady(record.draft)));
}

export function archiveRevisionTotal(record: ArchiveRevision): number | null {
  if (record.status !== "confirmed" || !validateArchiveRevision(record)) return null;
  const total = receiptTotals(record.draft);
  return total.status === "ready" ? total.totalRupiah : null;
}

export function summarizeArchive(
  records: ArchiveRevision[], fromDate: string, toDate = fromDate,
): ArchiveSummary {
  if (!archiveDateKey(fromDate) || !archiveDateKey(toDate) || fromDate > toDate) throw new Error("Rentang tanggal transaksi tidak valid.");
  const latest = new Map<string, ArchiveRevision>();
  const latestConfirmed = new Map<string, ArchiveRevision>();
  for (const record of records) {
    if (!validateArchiveRevision(record)) throw new Error("Revisi arsip tidak valid atau belum dikonfirmasi terhadap sumber.");
    const previous = latest.get(record.transactionId);
    if (previous && record.revision === previous.revision &&
        (record.status !== previous.status || record.transactionDate !== previous.transactionDate ||
          record.transactionDateConfirmed !== previous.transactionDateConfirmed)) {
      throw new Error("Versi transaksi yang sama memiliki status atau tanggal berbeda.");
    }
    if (!previous || record.revision > previous.revision) latest.set(record.transactionId, record);
    if (record.status !== "confirmed") continue;
    const confirmed = latestConfirmed.get(record.transactionId);
    if (!confirmed || record.revision > confirmed.revision) latestConfirmed.set(record.transactionId, record);
    if (confirmed && record.revision === confirmed.revision &&
        (record.transactionDate !== confirmed.transactionDate || archiveRevisionTotal(record) !== archiveRevisionTotal(confirmed))) {
      throw new Error("Versi transaksi yang sama memiliki tanggal atau nominal berbeda.");
    }
  }
  const references = [...latestConfirmed.values()]
    .filter(record => record.transactionDate! >= fromDate && record.transactionDate! <= toDate)
    .map(record => ({
      transactionId: record.transactionId, revision: record.revision,
      transactionDate: record.transactionDate!, totalRupiah: archiveRevisionTotal(record),
    }))
    .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate) || a.transactionId.localeCompare(b.transactionId));
  const unknownTotalCount = references.filter(record => record.totalRupiah === null).length;
  const sum = references.reduce((total, record) => total + BigInt(record.totalRupiah ?? 0), 0n);
  const status = !references.length ? "none" : unknownTotalCount ? "incomplete" : sum > BigInt(Number.MAX_SAFE_INTEGER) ? "overflow" : "known";
  return {
    timezone: "Asia/Jakarta", fromDate, toDate, status,
    totalRupiah: status === "known" ? Number(sum) : null,
    transactionCount: references.length, unknownTotalCount,
    draftCount: [...latest.values()].filter(record => record.status === "draft" &&
      record.transactionDate !== null && record.transactionDate >= fromDate && record.transactionDate <= toDate).length,
    references,
  };
}

export function buildInspectionFollowUp(context: InspectionContext) {
  const findings = context.findings;
  return {
    draftId: context.draftId, revision: context.revision,
    confirmedPairCount: findings.filter(finding => finding.status.startsWith("confirmed_")).length,
    pendingDecisionCount: findings.filter(finding => finding.status === "unconfirmed").length,
    openDifferenceCount: findings.filter(finding => finding.status === "confirmed_open").length,
    unmatchedItemCount: findings.filter(finding => finding.status === "unmatched").length,
    reviewRequiredCount: findings.filter(finding => finding.status === "review_required").length,
    incompleteCount: findings.filter(finding => finding.status === "incomplete").length,
    followUpFindingIds: [...new Set(findings.filter(finding => !["confirmed_equal", "confirmed_resolved"].includes(finding.status)).map(finding => finding.id))],
  };
}
