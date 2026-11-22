import type { Draft } from "../types";
import type { ArchiveQuerySummary } from "../lib/archiveDomain";
export type AccountUser = { id: string; email: string; name: string };
export type Workspace = {
  id: string;
  name: string;
  kind: "personal" | "team";
  role: "owner" | "member";
};
export type AccountSession = {
  user: AccountUser | null;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
};
export type ArchiveEntry = {
  reference?: string | null;
  workspaceId?: string;
  transactionDateConfirmed?: boolean;
  transactionTime?: string | null;
  counterpartyName?: string | null;
  receiptNumber?: string | null;
  transactionId: string;
  transactionDate: string | null;
  revision: number;
  status: "draft" | "confirmed";
  createdAt: string;
  updatedAt: string;
  draftId: string;
  latestConfirmedRevision: number | null;
  totalRupiah?: number | null;
};
export type ArchiveDetail = {
  entry: ArchiveEntry;
  draft: Draft;
  revisions: {
    revision: number;
    status: "draft" | "confirmed";
    transactionDate: string | null;
    createdAt: string;
  }[];
};
export type ArchiveSave = {
  transactionTime?: string | null;
  counterpartyName?: string | null;
  receiptNumber?: string | null;
  transactionId: string;
  transactionDateConfirmed: boolean;
  transactionDate: string | null;
  status: "draft" | "confirmed";
  baseRevision: number;
  draft: Draft;
};
export type StoredChat = {
  contextId: string;
  messages: unknown[];
  revision: number;
};
export class AccountError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
  workspaceId?: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      signal,
      credentials: "same-origin",
      headers: {
        ...(method === "GET"
          ? {}
          : { "Content-Type": "application/json", "X-BuktiLaut-Account": "1" }),
        ...(workspaceId ? { "X-BuktiLaut-Workspace": workspaceId } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AccountError(
      "Layanan akun belum dapat dihubungi. Data perangkat dan isian Anda tetap tersedia.",
      "NETWORK",
      0,
    );
  }
  const value = await response.json().catch(() => null);
  if (!response.ok)
    throw new AccountError(
      value?.error?.message ||
        "Layanan akun belum dapat dihubungi. Data perangkat Anda tetap tersedia.",
      value?.error?.code || "NETWORK",
      response.status,
    );
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AccountError(
      "Respons layanan akun belum valid. Coba muat ulang.",
      "INVALID_RESPONSE",
      response.status,
    );
  if (
    [
      "/api/account/session",
      "/api/account/login",
      "/api/account/register",
      "/api/workspaces",
      "/api/workspaces/active",
      "/api/team/invites/accept",
    ].includes(path) &&
    (!(
      value.user === null ||
      (typeof value.user?.id === "string" &&
        typeof value.user?.email === "string" &&
        typeof value.user?.name === "string")
    ) ||
      !Array.isArray(value.workspaces) ||
      !value.workspaces.every(
        (item: Workspace) =>
          item &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          ["personal", "team"].includes(item.kind) &&
          ["owner", "member"].includes(item.role),
      ) ||
      !(
        value.activeWorkspaceId === null ||
        typeof value.activeWorkspaceId === "string"
      ))
  )
    throw new AccountError(
      "Respons sesi akun belum valid. Login kembali tanpa mengubah draf perangkat.",
      "INVALID_RESPONSE",
      response.status,
    );
  return value as T;
}
export const getAccountSession = (signal?: AbortSignal) =>
  request<AccountSession>("/api/account/session", "GET", undefined, signal);
export const registerAccount = (
  input: { email: string; password: string; name: string },
  signal?: AbortSignal,
) => request<AccountSession>("/api/account/register", "POST", input, signal);
export const loginAccount = (
  input: { email: string; password: string },
  signal?: AbortSignal,
) => request<AccountSession>("/api/account/login", "POST", input, signal);
export const logoutAccount = (signal?: AbortSignal) =>
  request<unknown>("/api/account/logout", "POST", {}, signal);
export const createWorkspace = (name: string, signal?: AbortSignal) =>
  request<AccountSession>("/api/workspaces", "POST", { name }, signal);
export const activateWorkspace = (workspaceId: string, signal?: AbortSignal) =>
  request<AccountSession>(
    "/api/workspaces/active",
    "POST",
    { workspaceId },
    signal,
  );
export const listMembers = (signal?: AbortSignal) =>
  request<{
    members: {
      userId: string;
      email: string;
      name: string;
      role: "owner" | "member";
    }[];
  }>("/api/team/members", "GET", undefined, signal);
export const inviteMember = (email: string, signal?: AbortSignal) =>
  request<{ code: string; expiresAt: string; invitePath: string }>(
    "/api/team/invites",
    "POST",
    { email },
    signal,
  );
export const acceptInvite = (code: string, signal?: AbortSignal) =>
  request<AccountSession>("/api/team/invites/accept", "POST", { code }, signal);
export const listArchive = (
  filters: {
    from?: string;
    to?: string;
    status?: string;
    counterpartyName?: string;
    reference?: string;
    receiptNumber?: string;
    offset?: number;
    limit?: number;
  } = {},
  signal?: AbortSignal,
  workspaceId?: string,
) => {
  const query = new URLSearchParams(
    Object.entries(filters)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([key, value]) => [key, String(value)]),
  );
  return request<{ entries: ArchiveEntry[]; summary?: ArchiveQuerySummary }>(
    `/api/archive?${query}`,
    "GET",
    undefined,
    signal,
    workspaceId,
  );
};
export const readArchive = (
  id: string,
  signal?: AbortSignal,
  revision?: number,
  workspaceId?: string,
) =>
  request<ArchiveDetail>(
    `/api/archive/${encodeURIComponent(id)}${revision === undefined ? "" : `?revision=${revision}`}`,
    "GET",
    undefined,
    signal,
    workspaceId,
  );
export const saveArchive = (
  input: ArchiveSave,
  signal?: AbortSignal,
  workspaceId?: string,
) =>
  request<{ entry: ArchiveEntry }>(
    "/api/archive",
    "POST",
    input,
    signal,
    workspaceId,
  );
export const readChatHistory = (
  contextId: string,
  signal?: AbortSignal,
  workspaceId?: string,
) =>
  request<StoredChat>(
    `/api/chats/${encodeURIComponent(contextId)}`,
    "GET",
    undefined,
    signal,
    workspaceId,
  );
export const saveChatHistory = (
  contextId: string,
  messages: unknown[],
  baseRevision: number,
  signal?: AbortSignal,
  workspaceId?: string,
) =>
  request<StoredChat>(
    `/api/chats/${encodeURIComponent(contextId)}`,
    "PUT",
    { messages, baseRevision },
    signal,
    workspaceId,
  );

export type GoogleAvailability = {
  available: boolean;
  reason: "configuration" | "origin" | null;
};

export const getGoogleAvailability = (signal?: AbortSignal) =>
  request<GoogleAvailability>(
    `/api/account/google/status?origin=${encodeURIComponent(location.origin)}`,
    "GET",
    undefined,
    signal,
  );

export async function startGoogleAccount(
  mode: "login" | "register" | "link",
  signal?: AbortSignal,
) {
  const result = await request<{ authorizationUrl: string }>(
    "/api/account/google/start",
    "POST",
    { mode },
    signal,
  );
  const target = new URL(result.authorizationUrl);
  if (
    target.origin !== "https://accounts.google.com" ||
    target.pathname !== "/o/oauth2/v2/auth"
  )
    throw new AccountError(
      "Tautan Google belum valid. Silakan coba lagi.",
      "INVALID_RESPONSE",
      0,
    );
  return result;
}
