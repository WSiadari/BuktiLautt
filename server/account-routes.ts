import { googleCookie, makeGoogleAuth, readGoogleConfig } from "./accounts/google.ts";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import sharp from "sharp";
import { AccountFailure, AccountStore, type ArchiveRecord, type Identity, type ImageRecord } from "./accounts/store.ts";
import { isDraft } from "../src/services/storage.ts";
import { archiveDateKey, archiveRevisionTotal, summarizeArchive, validateArchiveRevision, validateArchiveQuery, queryArchive, type ArchiveQuery } from "../src/lib/archiveDomain.ts";
import { buildInspectionContext } from "../src/lib/inspectionContext.ts";
import { analyzeArchive } from "../src/lib/archiveAnalytics.ts";
import { validateUnifiedAgentRequest, validateUnifiedAgentResponse } from "../src/agent/unified.ts";
import type { Draft } from "../src/types.ts";

const COOKIE = "buktilaut_session";
const safeId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- body JSON mentah; tiap kolom divalidasi oleh fungsi pemeriksa di bawah.
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
function fail(message = "Data permintaan belum valid.", status = 400, code = "INVALID_INPUT"): never { throw new AccountFailure(status, code, message); }
function cookie(request: IncomingMessage, name = COOKIE) { return request.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(name + "="))?.slice(name.length + 1); }
function setCookie(request: IncomingMessage, response: ServerResponse, value: string, remove = false, forceSecure = false) {
  const secure = forceSecure || "encrypted" in request.socket && request.socket.encrypted;
  response.appendHeader("Set-Cookie", `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${remove ? 0 : 604800}${secure ? "; Secure" : ""}`);
}
function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" });
  response.end(JSON.stringify(body));
}
async function body(request: IncomingMessage) {
  if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers["content-type"] ?? "") || (request.headers["content-encoding"] && request.headers["content-encoding"] !== "identity")) fail("Gunakan data JSON.");
  const max = 12 * 1024 * 1024;
  if (Number(request.headers["content-length"] ?? 0) > max) fail("Data terlalu besar.", 413, "TOO_LARGE");
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > max) fail("Data terlalu besar.", 413, "TOO_LARGE"); chunks.push(bytes); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString("utf8")); if (!object(value)) fail(); return value; }
  catch (error) { if (error instanceof AccountFailure) throw error; fail("Data JSON tidak dapat dibaca."); }
}
function email(value: unknown) {
  if (typeof value !== "string" || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) fail("Masukkan alamat email yang valid.");
  return value.trim().toLowerCase();
}
function password(value: unknown) { if (typeof value !== "string" || value.length < 10 || value.length > 128) fail("Kata sandi harus berisi 10–128 karakter."); return value; }
function name(value: unknown) { if (typeof value !== "string" || !value.trim() || value.trim().length > 100) fail("Nama harus berisi 1–100 karakter."); return value.trim(); }
function requestedRevision(url: URL) { const value = url.searchParams.get("revision"); if (value === null) return undefined; if (!/^[1-9]\d{0,8}$/.test(value)) fail("Revisi tidak valid."); return Number(value); }
function entry(record: ArchiveRecord) {
  const { draft, ...metadata } = record;
  return { ...metadata, draftId: draft.id, totalRupiah: archiveRevisionTotal(record) };
}
async function prepareDraft(value: unknown) {
  if (!isDraft(value)) fail("Draf belum valid. Tinjau sumber dan pasangan sebelum menyimpan.");
  const draft = structuredClone(value) as Draft;
  const allowed = new Set(["version", "id", "transactionKey", "demo", "revision", "weighing", "receipt", "sources", "weighingConfirmed", "receiptConfirmed", "pairs", "unmatchedReceipts", "deduction", "charges", "savedAt", "previousReview", "voiceExtraction", "rawExtractions", "confirmedSnapshots"]);
  if (Object.keys(draft).some(key => !allowed.has(key))) fail("Draf memiliki kolom yang tidak didukung.");
  const images: ImageRecord[] = [];
  for (const kind of ["weighing", "receipt"] as const) {
    const source = draft.sources[kind];
    if (Object.keys(source).some(key => !["text", "filename", "capturedAt", "image"].includes(key))) fail("Sumber memiliki kolom yang tidak didukung.");
    if (!source.image) continue;
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(source.image);
    if (!match) fail("Format foto sumber tidak didukung.");
    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length || bytes.length > 4 * 1024 * 1024 || bytes.toString("base64") !== match[2]) fail("Ukuran foto sumber tidak valid.", 413, "TOO_LARGE");
    try {
      const metadata = await sharp(bytes, { limitInputPixels: 20_000_000 }).metadata();
      if (metadata.format !== match[1] || !metadata.width || !metadata.height || metadata.width * metadata.height > 20_000_000 || (metadata.pages ?? 1) !== 1) fail("Foto sumber tidak valid.");
      await sharp(bytes, { limitInputPixels: 20_000_000 }).stats();
    } catch (error) { if (error instanceof AccountFailure) throw error; fail("Foto sumber tidak dapat dibaca."); }
    images.push({ kind, mime: `image/${match[1]}`, bytes }); delete source.image;
  }
  if (Buffer.byteLength(JSON.stringify(draft)) > 1024 * 1024 || /data:audio\//i.test(JSON.stringify(draft))) fail("Draf terlalu besar atau memuat rekaman mentah.", 413, "TOO_LARGE");
  return { draft, images };
}
export function createAccountStore(databasePath = process.env.BUKTILAUT_ACCOUNT_DB_PATH || resolve(".data/accounts.sqlite")) { return new AccountStore(databasePath); }
let defaultStore: AccountStore | undefined;
function sharedStore() { return defaultStore ??= createAccountStore(); }
export function getAuthenticatedWorkspace(request: IncomingMessage, store: AccountStore = sharedStore()): Identity {
  const identity = store.authenticate(cookie(request));
  if (!identity) throw new AccountFailure(401, "AUTH_REQUIRED", "Masuk untuk membuka data akun.");
  if (request.headers["x-buktilaut-workspace"] && request.headers["x-buktilaut-workspace"] !== identity.workspaceId) fail("Ruang kerja aktif telah berubah. Buka ulang data dari ruang yang dipilih.", 409, "WORKSPACE_CHANGED");
  return identity;
}
export function readAuthorizedArchive(request: IncomingMessage, from: string, to = from, store: AccountStore = sharedStore()) {
  const identity = getAuthenticatedWorkspace(request, store);
  return summarizeArchive(store.archiveRecords(identity, true), from, to);
}
export function getAuthorizedWorkspace(request: IncomingMessage, store: AccountStore = sharedStore()) {
  const identity = getAuthenticatedWorkspace(request, store);
  return { id: identity.workspaceId, name: identity.workspaceName, kind: identity.workspaceKind };
}
export function queryAuthorizedArchive(request: IncomingMessage, query: ArchiveQuery = {}, store: AccountStore = sharedStore()) {
  const identity = getAuthenticatedWorkspace(request, store);
  let validated: ArchiveQuery;
  try { validated = validateArchiveQuery(query); } catch { fail("Filter arsip tidak valid."); }
  return store.queryArchive(identity, validated);
}
export function analyzeAuthorizedArchive(request: IncomingMessage, range: { fromDate: string; toDate: string; counterpartyName?: string | null }, store: AccountStore = sharedStore()) {
  const identity = getAuthenticatedWorkspace(request, store);
  try { return analyzeArchive(store.archiveRecords(identity, true), range); } catch { fail("Filter arsip tidak valid."); }
}
export function getAuthorizedArchivedTransaction(request: IncomingMessage, referenceOrLegacyId: string, store: AccountStore = sharedStore(), revision?: number) {
  const identity = getAuthenticatedWorkspace(request, store);
  if (!safeId(referenceOrLegacyId)) fail();
  return store.readArchive(identity, referenceOrLegacyId, revision);
}
export function readAuthorizedInspection(request: IncomingMessage, reference: string, store: AccountStore = sharedStore()) {
  let record = getAuthorizedArchivedTransaction(request, reference, store);
  if (record.latestConfirmedRevision !== null && record.revision !== record.latestConfirmedRevision) record = getAuthorizedArchivedTransaction(request, reference, store, record.latestConfirmedRevision);
  return { transaction: queryArchive([record], { status: "all" }).entries[0], inspection: buildInspectionContext(record.draft) };
}
function queryParameters(url: URL, legacy = false): ArchiveQuery {
  const query: Record<string, unknown> = {};
  for (const [key, value] of url.searchParams) {
    const field = legacy && key === "from" ? "fromDate" : legacy && key === "to" ? "toDate" : key;
    if (Object.hasOwn(query, field)) fail("Filter arsip berulang.");
    query[field] = ["offset", "limit"].includes(field) ? (/^\d+$/.test(value) ? Number(value) : NaN) : value;
  }
  if (legacy && query.status === undefined) query.status = "all";
  try { return validateArchiveQuery(query); } catch { fail("Filter arsip tidak valid."); }
}
export function createAccountRoutes({ store = sharedStore(), allowedOrigins = ["http://127.0.0.1:5173", "http://localhost:5173"], secureCookies = false }: { store?: AccountStore; allowedOrigins?: string[]; secureCookies?: boolean } = {}) {
  const googleConfig = readGoogleConfig();
  const google = googleConfig ? makeGoogleAuth(googleConfig) : null;
  const authAttempts = new Map<string, { count: number; reset: number }>();
  const refresh = (request: IncomingMessage) => store.session(store.authenticate(cookie(request)));
  async function handleAccountRoute(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;
    if (!/^\/api\/(account(?:\/|$)|workspaces(?:\/|$)|team(?:\/|$)|archive(?:\/|$)|chats(?:\/|$))/.test(path)) return false;
    try {
      if (request.method === "GET" && path === "/api/account/google/callback") {
        if (!google) fail("Masuk dengan Google belum tersedia.", 503, "GOOGLE_UNAVAILABLE");
        const flow = google.consume(cookie(request, googleCookie), url.searchParams.get("state"));
        const back = flow?.intent.mode === "link" ? "/dashboard" : flow?.intent.mode === "register" ? "/daftar" : "/masuk";
        const redirect = (location: string) => {
          response.writeHead(303, { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
          response.end();
          return true;
        };
        if (!flow) return redirect(`${back}?google=gagal`);
        response.appendHeader("Set-Cookie", google.flowCookie());
        if (url.searchParams.has("error")) return redirect(`${back}?google=dibatalkan`);
        const code = url.searchParams.get("code");
        if (!code || code.length > 4096) return redirect(`${back}?google=gagal`);
        try {
          if (flow.intent.mode === "link" && store.authenticate(cookie(request))?.sessionHash !== flow.intent.sessionHash)
            return redirect(`${back}?google=gagal`);
          const profile = await google.verify(code, flow);
          if (flow.intent.mode === "link") {
            const identity = store.authenticate(cookie(request));
            if (!identity || identity.sessionHash !== flow.intent.sessionHash) return redirect(`${back}?google=gagal`);
            store.linkGoogle(identity, profile);
            return redirect("/dashboard?google=terhubung");
          }
          const session = store.loginWithGoogle(profile);
          store.logout(cookie(request));
          setCookie(request, response, session, false, secureCookies || google.secure);
          return redirect("/dashboard");
        } catch (reason) {
          const linkRequired = reason instanceof AccountFailure && reason.code === "GOOGLE_LINK_REQUIRED";
          return redirect(linkRequired ? "/masuk?google=hubungkan" : `${back}?google=gagal`);
        }
      }
      const origin = request.headers.origin;
      if ((origin && !allowedOrigins.includes(origin)) || request.headers["sec-fetch-site"] === "cross-site") fail("Permintaan berasal dari halaman lain.", 403, "FORBIDDEN");
      if (request.method !== "GET" && (!origin || !allowedOrigins.includes(origin) || request.headers["x-buktilaut-account"] !== "1")) fail("Buka layanan dari aplikasi BuktiLaut.", 403, "FORBIDDEN");
      if (request.method === "GET" && path === "/api/account/google/status") {
        const appOrigin = origin ?? url.searchParams.get("origin");
        let reason: "configuration" | "origin" | null = null;
        if (!google) reason = "configuration";
        else if (!allowedOrigins.includes(google.origin) || (appOrigin !== null && appOrigin !== google.origin))
          reason = "origin";
        json(response, 200, { available: reason === null, reason }); return true;
      }
      if (request.method === "POST" && path === "/api/account/google/start") {
        if (!google || origin !== google.origin) fail("Google belum dikonfigurasi untuk alamat ini.", 503, "GOOGLE_UNAVAILABLE");
        const { mode } = await body(request);
        if (mode !== "login" && mode !== "register" && mode !== "link") fail();
        const flow = google.start(mode === "link" ? { mode, sessionHash: getAuthenticatedWorkspace(request, store).sessionHash } : { mode });
        response.appendHeader("Set-Cookie", google.flowCookie(flow.state));
        json(response, 200, { authorizationUrl: flow.authorizationUrl }); return true;
      }
      if (request.method === "GET" && path === "/api/account/session") { json(response, 200, refresh(request)); return true; }
      if (request.method === "POST" && ["/api/account/register", "/api/account/login"].includes(path)) {
        const input = await body(request), address = email(input.email), pass = password(input.password);
        const key = `${request.socket.remoteAddress}:${address}`, now = Date.now();
        for (const [attemptKey, attempt] of authAttempts) if (attempt.reset < now) authAttempts.delete(attemptKey);
        const attempt = authAttempts.get(key) ?? { count: 0, reset: now + 60_000 };
        if (++attempt.count > 10 || authAttempts.size > 10_000) fail("Terlalu banyak percobaan. Coba lagi sebentar.", 429, "RATE_LIMITED");
        authAttempts.set(key, attempt);
        const raw = path.endsWith("register") ? await store.register(address, pass, name(input.name)) : await store.login(address, pass);
        store.logout(cookie(request)); setCookie(request, response, raw, false, secureCookies);
        json(response, 200, store.session(store.authenticate(raw))); return true;
      }
      if (request.method === "POST" && path === "/api/account/logout") { store.logout(cookie(request)); setCookie(request, response, "", true, secureCookies); json(response, 200, { ok: true }); return true; }
      const identity = getAuthenticatedWorkspace(request, store);
      if (request.method === "POST" && path === "/api/workspaces") { store.createTeam(identity, name((await body(request)).name)); json(response, 200, refresh(request)); return true; }
      if (request.method === "POST" && path === "/api/workspaces/active") { const input = await body(request); if (!safeId(input.workspaceId)) fail(); store.activate(identity, input.workspaceId); json(response, 200, refresh(request)); return true; }
      if (request.method === "GET" && path === "/api/team/members") { json(response, 200, { members: store.members(identity) }); return true; }
      if (request.method === "POST" && path === "/api/team/invites") { json(response, 200, store.invite(identity, email((await body(request)).email))); return true; }
      if (request.method === "POST" && path === "/api/team/invites/accept") { const input = await body(request); if (typeof input.code !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(input.code)) fail("Kode undangan tidak valid."); store.accept(identity, input.code); json(response, 200, refresh(request)); return true; }
      if (request.method === "GET" && path === "/api/archive/summary") {
        const from = url.searchParams.get("from"), to = url.searchParams.get("to") ?? from;
        if (!archiveDateKey(from) || !archiveDateKey(to) || from! > to!) fail("Pilih rentang tanggal yang valid.");
        json(response, 200, summarizeArchive(store.archiveRecords(identity, true), from!, to!)); return true;
      }
      if (request.method === "GET" && path === "/api/archive") {
        json(response, 200, store.queryArchive(identity, queryParameters(url, true))); return true;
      }
      if (request.method === "GET" && path === "/api/archive/query") {
        json(response, 200, store.queryArchive(identity, queryParameters(url))); return true;
      }
      if (request.method === "POST" && path === "/api/archive") {
        const input = await body(request);
        if (!safeId(input.transactionId) || !integer(input.baseRevision) || !["draft", "confirmed"].includes(input.status) || typeof input.transactionDateConfirmed !== "boolean" || (input.transactionDate !== null && !archiveDateKey(input.transactionDate)) || !isDraft(input.draft)) fail("Draf atau tanggal transaksi belum valid.");
        if (!validateArchiveRevision({ transactionId: input.transactionId, revision: input.baseRevision + 1, status: input.status, transactionDate: input.transactionDate, transactionDateConfirmed: input.transactionDateConfirmed, draft: input.draft })) fail("Konfirmasi sumber, pasangan, dan tanggal transaksi sebelum menyimpan sebagai terkonfirmasi.");
        const prepared = await prepareDraft(input.draft);
        const record = store.saveArchive(identity, { transactionId: input.transactionId, baseRevision: input.baseRevision, status: input.status, transactionDate: input.transactionDate, transactionDateConfirmed: input.transactionDateConfirmed, draft: prepared.draft, ...(input.transactionTime === undefined ? {} : { transactionTime: input.transactionTime }), ...(input.counterpartyName === undefined ? {} : { counterpartyName: input.counterpartyName }), ...(input.receiptNumber === undefined ? {} : { receiptNumber: input.receiptNumber }) }, prepared.images);
        json(response, 200, { entry: entry(record) }); return true;
      }
      const archive = /^\/api\/archive\/([^/]+)(?:\/source\/(weighing|receipt))?$/.exec(path);
      if (request.method === "GET" && archive) {
        const id = decodeURIComponent(archive[1]); if (!safeId(id)) fail();
        const revision = requestedRevision(url);
        if (archive[2]) {
          const image = store.image(identity, id, archive[2], revision);
          response.writeHead(200, { "Content-Type": image.mime, "Content-Length": image.bytes.length, "Content-Disposition": "inline", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" }); response.end(image.bytes); return true;
        }
        const record = store.readArchive(identity, id, revision);
        json(response, 200, { entry: entry(record), draft: record.draft, revisions: store.revisions(identity, id) }); return true;
      }
      const chat = /^\/api\/chats\/([^/]+)$/.exec(path);
      if (chat && ["GET", "PUT"].includes(request.method ?? "")) {
        const contextId = decodeURIComponent(chat[1]); if (!/^[a-zA-Z0-9_.:-]{1,200}$/.test(contextId)) fail();
        if (request.method === "GET") json(response, 200, store.chat(identity, contextId));
        else {
          const input = await body(request);
          if (!integer(input.baseRevision) || !Array.isArray(input.messages) || input.messages.length > 200 || input.messages.some((m: unknown) => !object(m) || !["Anda", "Ombak Pintar"].includes(m.role) || typeof m.text !== "string" || m.text.length > 20_000 || Object.keys(m).some(key => !["role", "text", "mode", "revision", "answer", "snapshot", "archiveAnswer", "unifiedAnswer", "unifiedRequest"].includes(key))) || Buffer.byteLength(JSON.stringify(input.messages)) > 512 * 1024 || /data:(?:audio|video|image)\//i.test(JSON.stringify(input.messages))) fail("Riwayat chat terlalu besar atau tidak valid.");
          for (const message of input.messages) if (message.unifiedAnswer !== undefined || message.unifiedRequest !== undefined) {
            try { validateUnifiedAgentResponse(message.unifiedAnswer, validateUnifiedAgentRequest(message.unifiedRequest), identity.workspaceId); }
            catch { fail("Konteks jawaban tersimpan tidak valid untuk ruang kerja ini."); }
          }
          json(response, 200, store.saveChat(identity, contextId, input.messages, input.baseRevision));
        }
        return true;
      }
      json(response, 404, { error: { code: "NOT_FOUND", message: "Halaman akun tidak ditemukan.", retryable: false } });
    } catch (error) {
      const known = error instanceof AccountFailure;
      json(response, known ? error.status : 500, { error: { code: known ? error.code : "ACCOUNT_UNAVAILABLE", message: known ? error.message : "Penyimpanan akun belum dapat dihubungi. Data perangkat tetap tersedia.", retryable: false } });
    }
    return true;
  }
  return {
    handleAccountRoute,
    getAuthenticatedWorkspace: (request: IncomingMessage) => getAuthenticatedWorkspace(request, store),
    getAuthorizedWorkspace: (request: IncomingMessage) => getAuthorizedWorkspace(request, store),
    readAuthorizedArchive: (request: IncomingMessage, from: string, to = from) => readAuthorizedArchive(request, from, to, store),
    queryAuthorizedArchive: (request: IncomingMessage, query: ArchiveQuery = {}) => queryAuthorizedArchive(request, query, store),
    getAuthorizedArchivedTransaction: (request: IncomingMessage, referenceOrLegacyId: string, revision?: number) => getAuthorizedArchivedTransaction(request, referenceOrLegacyId, store, revision),
    readAuthorizedInspection: (request: IncomingMessage, reference: string) => readAuthorizedInspection(request, reference, store),
    analyzeAuthorizedArchive: (request: IncomingMessage, range: { fromDate: string; toDate: string; counterpartyName?: string | null }) => analyzeAuthorizedArchive(request, range, store),
  };
}
const routesByOrigin = new Map<string, ReturnType<typeof createAccountRoutes>>();
export function handleAccountRoute(request: IncomingMessage, response: ServerResponse, config: { allowedOrigins: string[]; secureCookies?: boolean }) {
  const secureCookies = config.secureCookies === true;
  const key = JSON.stringify([config.allowedOrigins, secureCookies]);
  let routes = routesByOrigin.get(key);
  if (!routes) { routes = createAccountRoutes({ allowedOrigins: config.allowedOrigins, secureCookies }); routesByOrigin.set(key, routes); }
  return routes.handleAccountRoute(request, response);
}
