import type { InspectionContext } from "../lib/inspectionContext.ts";
import { archiveDateKey, type ArchiveQuerySummary, type ArchiveTransactionCard } from "../lib/archiveDomain.ts";
import { exactAgentObject, validateInspectionAgentRequest, validateInspectionAgentResponse, type InspectionAgentResponse } from "./contract.ts";

export type UnifiedAgentRequest = {
  requestId: string; question: string; inspection?: InspectionContext; findingId?: string;
};
export type UnifiedAgentResponse = {
  requestId: string;
  kind: "inspection" | "archive" | "aggregate" | "help" | "clarification" | "switch_workspace";
  answer: string; workspaceId: string | null; workspaceName: string | null;
  inspection: InspectionAgentResponse | null; transactions: ArchiveTransactionCard[];
  aggregate: ArchiveQuerySummary | null; clarification: boolean;
  provider: { name: "gemini" | "basic"; model: string };
};
const identifier = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/u.test(value);
const text = (value: unknown, max = 160): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
const nullableText = (value: unknown): boolean => value === null || text(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const amount = (value: unknown): boolean => value === null || count(value);

export function validateUnifiedAgentRequest(value: unknown): UnifiedAgentRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_INPUT");
  const v = value as Record<string, unknown>;
  const keys = ["requestId", "question", ...(Object.hasOwn(v, "inspection") ? ["inspection"] : []), ...(Object.hasOwn(v, "findingId") ? ["findingId"] : [])];
  if (!exactAgentObject(value, keys) || !identifier(v.requestId) || !text(v.question, 1000) || (v.findingId !== undefined && v.inspection === undefined)) throw new Error("INVALID_INPUT");
  if (v.inspection !== undefined) {
    const inspected = validateInspectionAgentRequest({ requestId: v.requestId, question: v.question, snapshot: v.inspection, ...(v.findingId !== undefined ? { findingId: v.findingId } : {}) });
    return { requestId: inspected.requestId, question: inspected.question, inspection: inspected.snapshot, ...(inspected.findingId ? { findingId: inspected.findingId } : {}) };
  }
  return { requestId: v.requestId, question: v.question };
}

function validCard(value: unknown, workspaceId: string | null): value is ArchiveTransactionCard {
  if (!exactAgentObject(value, ["transactionId", "reference", "revision", "status", "transactionDate", "transactionDateConfirmed", "transactionTime", "counterpartyName", "receiptNumber", "workspaceId", "latestConfirmedRevision", "totalRupiah", "createdAt", "updatedAt"])) return false;
  return identifier(value.transactionId) && (value.reference === null || typeof value.reference === "string" && /^BL-\d{8}-\d{6,}$/u.test(value.reference)) &&
    count(value.revision) && value.revision > 0 && typeof value.status === "string" && ["draft", "confirmed"].includes(value.status) &&
    (value.transactionDate === null || archiveDateKey(value.transactionDate) !== null) && typeof value.transactionDateConfirmed === "boolean" &&
    (value.transactionTime === null || typeof value.transactionTime === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/u.test(value.transactionTime)) &&
    nullableText(value.counterpartyName) && nullableText(value.receiptNumber) && value.workspaceId === workspaceId &&
    (value.latestConfirmedRevision === null || count(value.latestConfirmedRevision) && value.latestConfirmedRevision > 0 && value.latestConfirmedRevision <= value.revision) && amount(value.totalRupiah) &&
    (value.status !== "draft" || value.totalRupiah === null) &&
    (value.status !== "confirmed" || value.transactionDateConfirmed && value.transactionDate !== null && value.latestConfirmedRevision === value.revision) &&
    [value.createdAt, value.updatedAt].every(item => item === null || typeof item === "string" && Number.isFinite(Date.parse(item)));
}

function validSummary(value: unknown): value is ArchiveQuerySummary {
  if (!exactAgentObject(value, ["timezone", "fromDate", "toDate", "statusFilter", "status", "totalRupiah", "transactionCount", "confirmedCount", "draftCount", "unknownTotalCount", "offset", "limit", "hasMore"])) return false;
  if (value.timezone !== "Asia/Jakarta" || typeof value.statusFilter !== "string" || !["confirmed", "draft", "all"].includes(value.statusFilter) || typeof value.status !== "string" || !["none", "known", "incomplete", "overflow"].includes(value.status)) return false;
  if (![value.transactionCount, value.confirmedCount, value.draftCount, value.unknownTotalCount, value.offset, value.limit].every(count) || Number(value.limit) < 1 || Number(value.limit) > 50 || typeof value.hasMore !== "boolean") return false;
  if ((value.fromDate !== null && !archiveDateKey(value.fromDate)) || (value.toDate !== null && !archiveDateKey(value.toDate)) || value.fromDate && value.toDate && String(value.fromDate) > String(value.toDate)) return false;
  if (Number(value.confirmedCount) + Number(value.draftCount) !== value.transactionCount || Number(value.unknownTotalCount) > Number(value.transactionCount) || value.hasMore !== (Number(value.offset) + Number(value.limit) < Number(value.transactionCount))) return false;
  if (value.statusFilter === "confirmed" && value.draftCount !== 0 || value.statusFilter === "draft" && value.confirmedCount !== 0) return false;
  if (!amount(value.totalRupiah) || (value.status === "known") !== (value.totalRupiah !== null)) return false;
  if ((value.status === "none") !== (value.transactionCount === 0) || value.status === "known" && value.unknownTotalCount !== 0 || value.status === "incomplete" && value.unknownTotalCount === 0 || value.status === "overflow" && value.unknownTotalCount !== 0) return false;
  return true;
}

export function validateUnifiedAgentResponse(value: unknown, request: UnifiedAgentRequest, expectedWorkspaceId?: string | null): UnifiedAgentResponse {
  if (!exactAgentObject(value, ["requestId", "kind", "answer", "workspaceId", "workspaceName", "inspection", "transactions", "aggregate", "clarification", "provider"]) || value.requestId !== request.requestId ||
      typeof value.kind !== "string" || !["inspection", "archive", "aggregate", "help", "clarification", "switch_workspace"].includes(value.kind) || !text(value.answer, 12000) ||
      !(value.workspaceId === null || identifier(value.workspaceId)) || !nullableText(value.workspaceName) || expectedWorkspaceId !== undefined && value.workspaceId !== expectedWorkspaceId ||
      typeof value.clarification !== "boolean" || !exactAgentObject(value.provider, ["name", "model"]) || typeof value.provider.name !== "string" || !["gemini", "basic"].includes(value.provider.name) || !text(value.provider.model, 100) ||
      !Array.isArray(value.transactions) || value.transactions.length > 50 || !value.transactions.every(card => validCard(card, value.workspaceId as string | null)) ||
      new Set(value.transactions.map(card => card.transactionId)).size !== value.transactions.length || (value.aggregate !== null && !validSummary(value.aggregate))) throw new Error("INVALID_OUTPUT");
  if (value.inspection !== null) {
    if (value.kind !== "inspection" || !request.inspection) throw new Error("INVALID_OUTPUT");
    const nested = validateInspectionAgentResponse(value.inspection, { requestId: request.requestId, question: request.question, snapshot: request.inspection, ...(request.findingId ? { findingId: request.findingId } : {}) });
    if (nested.answer !== value.answer || nested.clarification !== value.clarification) throw new Error("INVALID_OUTPUT");
  }
  if (["help", "clarification", "switch_workspace"].includes(String(value.kind)) && (value.inspection !== null || value.transactions.length || value.aggregate !== null)) throw new Error("INVALID_OUTPUT");
  if (value.kind === "inspection" && (value.transactions.length || value.aggregate !== null)) throw new Error("INVALID_OUTPUT");
  if (value.aggregate !== null && value.transactions.length > value.aggregate.limit) throw new Error("INVALID_OUTPUT");
  return structuredClone(value) as UnifiedAgentResponse;
}
