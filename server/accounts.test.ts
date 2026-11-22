import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { AccountStore } from "./accounts/store.ts";
import { createAccountRoutes, readAuthorizedArchive } from "./account-routes.ts";
import { demoDraft, row } from "../src/data/demo.ts";

const origin = "http://127.0.0.1:5177";
const pass = "test-only-long-password";
function transaction(id = "stable-transaction", amount = 490000) {
  const draft = demoDraft(); draft.demo = false;
  draft.weighing = [row("Teri", "12")]; draft.receipt = [row("Teri", "10", String(amount / 10))];
  draft.weighingConfirmed = draft.receiptConfirmed = true;
  draft.pairs = [{ weighId: draft.weighing[0].id, receiptId: draft.receipt[0].id, decision: "confirmed", adjustment: "2", explanation: "Dibawa pulang" }];
  return { transactionId: id, baseRevision: 0, transactionDate: "2026-11-11", transactionDateConfirmed: true, status: "confirmed" as "confirmed" | "draft", draft };
}
async function server(run: (base: string, store: AccountStore) => Promise<void>, databasePath = ":memory:") {
  const store = new AccountStore(databasePath), routes = createAccountRoutes({ store, allowedOrigins: [origin] });
  const app = createServer(async (req, res) => { if (!await routes.handleAccountRoute(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise<void>(resolve => app.listen(0, "127.0.0.1", resolve));
  try { await run(`http://127.0.0.1:${(app.address() as { port: number }).port}`, store); }
  finally { app.closeAllConnections(); await new Promise<void>(resolve => app.close(() => resolve())); store.close(); }
}
async function request(base: string, path: string, method = "GET", value?: unknown, cookie?: string, extra: Record<string, string> = {}) {
  return fetch(base + path, { method, headers: { Origin: origin, ...(method === "GET" ? {} : { "Content-Type": "application/json", "X-BuktiLaut-Account": "1" }), ...(cookie ? { Cookie: cookie } : {}), ...extra }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
}
async function register(base: string, email = "owner@example.test") {
  const response = await request(base, "/api/account/register", "POST", { email, password: pass, name: "Nelayan" });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  return { cookie, session: await response.json() };
}

test("accounts persist salted hashes and hashed sessions; separate sessions authorize, rotate and logout", async () => {
  await server(async (base, store) => {
    const owner = await register(base), outsider = await register(base, "other@example.test");
    assert.notEqual(owner.session.activeWorkspaceId, outsider.session.activeWorkspaceId);
    const users = store.db.prepare("SELECT * FROM users").all() as Record<string, any>[];
    assert.notEqual(users[0].password_hash, users[1].password_hash);
    assert.ok(!JSON.stringify(users).includes(pass));
    assert.ok(!JSON.stringify(store.db.prepare("SELECT * FROM sessions").all()).includes(owner.cookie.split("=")[1]));
    const login = await request(base, "/api/account/login", "POST", { email: "OWNER@EXAMPLE.TEST", password: pass });
    assert.equal(login.status, 200); assert.match(login.headers.get("set-cookie")!, /HttpOnly; SameSite=Lax/);
    const secondCookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.notEqual(secondCookie, owner.cookie);
    assert.equal((await (await request(base, "/api/account/session", "GET", undefined, secondCookie)).json()).user.id, owner.session.user.id);
    assert.equal((await request(base, "/api/archive", "GET")).status, 401);
    assert.equal((await request(base, "/api/account/login", "POST", { email: "owner@example.test", password: "wrong-password" })).status, 401);
    await request(base, "/api/account/logout", "POST", {}, secondCookie);
    assert.equal((await request(base, "/api/archive", "GET", undefined, secondCookie)).status, 401);
  });
});

test("archive BLOB photos, immutable revisions, retry idempotency and conflicts survive server reopen", async () => {
  const folder = mkdtempSync(join(tmpdir(), "buktilaut-accounts-")), path = join(folder, "private.sqlite");
  const transactionId = "12345678-1234-4321-8123-123456789abc";
  let cookie = "", photo = "";
  try {
    await server(async (base, store) => {
      const owner = await register(base); cookie = owner.cookie;
      const input = transaction(transactionId);
      input.draft.transactionKey = input.transactionId;
      const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
      photo = `data:image/png;base64,${bytes.toString("base64")}`; input.draft.sources.weighing.image = photo;
      assert.equal((await request(base, "/api/archive", "POST", input, cookie)).status, 200);
      const retry = await (await request(base, "/api/archive", "POST", input, cookie)).json(); assert.equal(retry.entry.revision, 1);
      assert.equal(store.db.prepare("SELECT COUNT(*) count FROM archive_revisions").get()!.count, 1);
      const raw = store.db.prepare("SELECT draft_json FROM archive_revisions").get()!.draft_json as string;
      assert.ok(!raw.includes("base64")); assert.ok(!raw.includes("image/png"));
      const other = structuredClone(input); other.draft.pairs[0].explanation = "Revisi dari perangkat lain";
      assert.equal((await request(base, "/api/archive", "POST", other, cookie)).status, 409);
      other.baseRevision = 1; other.status = "draft";
      const updated = await (await request(base, "/api/archive", "POST", other, cookie)).json();
      assert.equal(updated.entry.revision, 2); assert.equal(updated.entry.latestConfirmedRevision, 1);
      const detail = await (await request(base, `/api/archive/${transactionId}?revision=1`, "GET", undefined, cookie)).json();
      assert.equal(detail.draft.pairs[0].explanation, "Dibawa pulang"); assert.equal(detail.draft.sources.weighing.image, photo); assert.equal(detail.revisions.length, 2);
      assert.equal(detail.draft.transactionKey, input.transactionId);
      const image = await request(base, `/api/archive/${transactionId}/source/weighing?revision=1`, "GET", undefined, cookie);
      assert.equal(image.headers.get("content-type"), "image/png"); assert.deepEqual(Buffer.from(await image.arrayBuffer()), bytes);
    }, path);
    await server(async base => {
      const detail = await (await request(base, `/api/archive/${transactionId}`, "GET", undefined, cookie)).json();
      assert.equal(detail.entry.revision, 2); assert.equal(detail.draft.sources.weighing.image, photo);
      assert.equal(detail.draft.pairs[0].adjustment, "2"); assert.equal(detail.draft.weighing[0].kg, "12");
    }, path);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test("team invitations bind email, expire once and authorize members while outsiders cannot read assets or tools", async () => {
  await server(async (base, store) => {
    const owner = await register(base), member = await register(base, "member@example.test"), outsider = await register(base, "outsider@example.test");
    const team = await (await request(base, "/api/workspaces", "POST", { name: "Tim Laut" }, owner.cookie)).json();
    const invite = await (await request(base, "/api/team/invites", "POST", { email: "member@example.test" }, owner.cookie)).json();
    assert.equal((await request(base, "/api/team/invites/accept", "POST", { code: invite.code }, outsider.cookie)).status, 403);
    assert.equal((await request(base, "/api/team/invites/accept", "POST", { code: invite.code }, member.cookie)).status, 200);
    assert.equal((await request(base, "/api/team/invites/accept", "POST", { code: invite.code }, member.cookie)).status, 400);
    assert.equal((await request(base, "/api/team/invites", "POST", { email: "third@example.test" }, member.cookie)).status, 403);
    assert.equal((await request(base, "/api/workspaces/active", "POST", { workspaceId: team.activeWorkspaceId }, outsider.cookie)).status, 403);
    assert.equal((await request(base, "/api/archive", "POST", transaction("team-record"), owner.cookie)).status, 200);
    assert.equal((await request(base, "/api/archive/team-record", "GET", undefined, member.cookie)).status, 200);
    assert.equal((await request(base, "/api/archive/team-record", "GET", undefined, outsider.cookie)).status, 404);
    assert.equal((await request(base, "/api/archive/team-record/source/weighing", "GET", undefined, outsider.cookie)).status, 404);
    assert.equal((await (await request(base, "/api/archive", "GET", undefined, outsider.cookie)).json()).entries.length, 0);
    assert.equal((await (await request(base, "/api/archive/summary?from=2026-11-11", "GET", undefined, member.cookie)).json()).totalRupiah, 490000);
    const outsiderIdentity = store.authenticate(outsider.cookie.split("=")[1])!;
    assert.equal(store.archiveRecords(outsiderIdentity).length, 0);
    const members = await (await request(base, "/api/team/members", "GET", undefined, member.cookie)).json(); assert.equal(members.members.length, 2);
  });
});

test("authorized daily total excludes draft, deduplicates stable IDs, keeps latest confirmed, zero distinct from none", async () => {
  await server(async (base, store) => {
    const owner = await register(base);
    for (const input of [transaction("complex", 2206300), transaction("simple", 490000), { ...transaction("working", 999), status: "draft" }, { ...transaction("other", 100), transactionDate: "2026-11-12" }]) assert.equal((await request(base, "/api/archive", "POST", input, owner.cookie)).status, 200);
    const newerDraft = transaction("complex", 2300000); newerDraft.baseRevision = 1; newerDraft.status = "draft";
    assert.equal((await request(base, "/api/archive", "POST", newerDraft, owner.cookie)).status, 200);
    const summary = await (await request(base, "/api/archive/summary?from=2026-11-11", "GET", undefined, owner.cookie)).json();
    assert.equal(summary.totalRupiah, 2696300); assert.equal(summary.transactionCount, 2); assert.equal(summary.draftCount, 2); assert.equal(summary.references[0].revision, 1);
    const identity = store.authenticate(owner.cookie.split("=")[1])!;
    assert.equal(readAuthorizedArchive({ headers: { cookie: owner.cookie } } as any, "2026-11-11", "2026-11-11", store).totalRupiah, summary.totalRupiah);
    assert.throws(() => readAuthorizedArchive({ headers: {} } as any, "2026-11-11", "2026-11-11", store), { status: 401 });
    assert.equal(store.archiveRecords(identity).length, 4);
    assert.equal((await (await request(base, "/api/archive/summary?from=2026-11-10", "GET", undefined, owner.cookie)).json()).status, "none");
    const zero = transaction("zero", 0); zero.transactionDate = "2026-11-10"; await request(base, "/api/archive", "POST", zero, owner.cookie);
    const zeroSummary = await (await request(base, "/api/archive/summary?from=2026-11-10", "GET", undefined, owner.cookie)).json(); assert.equal(zeroSummary.totalRupiah, 0); assert.equal(zeroSummary.transactionCount, 1);
  });
});

test("chat is per account/workspace/context, optimistic, guarded against switched workspace and raw audio", async () => {
  await server(async base => {
    const owner = await register(base), other = await register(base, "other@example.test");
    const messages = [{ role: "Anda", text: "Apa yang perlu dicek?", mode: "live", revision: 3 }];
    const path = "/api/chats/inspection:draft-id";
    assert.equal((await request(base, path, "PUT", { messages, baseRevision: 0 }, owner.cookie)).status, 200);
    assert.deepEqual((await (await request(base, path, "GET", undefined, owner.cookie)).json()).messages, messages);
    assert.deepEqual((await (await request(base, path, "GET", undefined, other.cookie)).json()).messages, []);
    assert.deepEqual((await (await request(base, "/api/chats/inspection:other-draft", "GET", undefined, owner.cookie)).json()).messages, []);
    assert.equal((await request(base, path, "PUT", { messages: [], baseRevision: 0 }, owner.cookie)).status, 409);
    await request(base, "/api/workspaces", "POST", { name: "Tim" }, owner.cookie);
    assert.equal((await request(base, path, "PUT", { messages, baseRevision: 0 }, owner.cookie, { "X-BuktiLaut-Workspace": owner.session.activeWorkspaceId })).status, 409);
    assert.deepEqual((await (await request(base, path, "GET", undefined, owner.cookie)).json()).messages, []);
    assert.equal((await request(base, path, "PUT", { messages: [{ ...messages[0], text: "data:audio/wav;base64,AAAA" }], baseRevision: 0 }, owner.cookie)).status, 400);
    await request(base, "/api/workspaces/active", "POST", { workspaceId: owner.session.activeWorkspaceId }, owner.cookie);
    assert.deepEqual((await (await request(base, path, "GET", undefined, owner.cookie)).json()).messages, messages);
  });
});

test("HTTP validation blocks origin/header bypass, invalid dates, unreviewed confirmation and broken images", async () => {
  await server(async base => {
    const owner = await register(base);
    assert.equal((await request(base, "/api/archive", "POST", transaction(), owner.cookie, { Origin: "https://outsider.example" })).status, 403);
    assert.equal((await request(base, "/api/archive", "POST", transaction(), owner.cookie, { "X-BuktiLaut-Account": "" })).status, 403);
    assert.equal((await request(base, "/api/archive", "GET", undefined, owner.cookie, { "Sec-Fetch-Site": "cross-site" })).status, 403);
    for (const input of [{ ...transaction(), transactionDate: "2026-02-29" }, { ...transaction(), transactionDateConfirmed: false }, { ...transaction(), baseRevision: -1 }]) assert.equal((await request(base, "/api/archive", "POST", input, owner.cookie)).status, 400);
    const pending = transaction(); pending.draft.pairs[0].decision = "pending";
    assert.equal((await request(base, "/api/archive", "POST", pending, owner.cookie)).status, 400);
    const invalidImage = transaction(); invalidImage.draft.sources.weighing.image = "data:image/png;base64,AAAA";
    assert.equal((await request(base, "/api/archive", "POST", invalidImage, owner.cookie)).status, 400);
    assert.equal((await (await request(base, "/api/archive", "GET", undefined, owner.cookie)).json()).entries.length, 0);
  });
});

test("expired sessions and invitation codes cannot grant membership", async () => {
  let now = Date.now(); const store = new AccountStore(":memory:", () => now);
  try {
    const ownerToken = await store.register("owner@example.test", pass, "Pemilik"), memberToken = await store.register("member@example.test", pass, "Anggota");
    const owner = store.authenticate(ownerToken)!; store.createTeam(owner, "Tim");
    const teamOwner = store.authenticate(ownerToken)!, member = store.authenticate(memberToken)!;
    const invite = store.invite(teamOwner, member.email); now += 49 * 3600_000;
    assert.throws(() => store.accept(member, invite.code), { code: "INVITE_INVALID" });
    assert.equal(store.session(store.authenticate(memberToken)).workspaces.length, 1);
    now += 7 * 86400_000; assert.equal(store.authenticate(ownerToken), null);
  } finally { store.close(); }
});

test("archive transaction rolls back all rows on image write failure and rejects confirmation bypass", async () => {
  const store = new AccountStore(":memory:");
  try {
    const raw = await store.register("owner@example.test", pass, "Pemilik"), identity = store.authenticate(raw)!;
    const input = transaction("atomic-record");
    const pending = structuredClone(input); pending.draft.pairs[0].decision = "pending";
    assert.throws(() => store.saveArchive(identity, pending, []), { code: "INVALID_INPUT" });
    const image = { kind: "weighing" as const, mime: "image/png", bytes: Buffer.from("synthetic") };
    assert.throws(() => store.saveArchive(identity, input, [image, image]));
    for (const table of ["transactions", "archive_revisions", "archive_images"]) assert.equal(store.db.prepare(`SELECT COUNT(*) count FROM ${table}`).get()!.count, 0);
    assert.equal(store.saveArchive(identity, input, []).revision, 1);
  } finally { store.close(); }
});

test("a newer database schema is refused without downgrading or resetting data", () => {
  const folder = mkdtempSync(join(tmpdir(), "buktilaut-schema-")), path = join(folder, "private.sqlite");
  try {
    const store = new AccountStore(path); store.db.exec("PRAGMA user_version=3"); store.close();
    assert.throws(() => new AccountStore(path), /Versi database akun lebih baru/);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test("HTTP query filters and metadata preserve references while foreign and unknown archives are indistinguishable", async () => {
  await server(async (base, store) => {
    const owner = await register(base), outsider = await register(base, "outside@example.test");
    const value = { ...transaction("private-identity"), transactionTime: " 09:30 ", counterpartyName: " Pabrik Mina Jaya ", receiptNumber: " NT-208 " };
    const save = await request(base, "/api/archive", "POST", value, owner.cookie);
    assert.equal(save.status, 200);
    const first = (await save.json()).entry;
    assert.match(first.reference, /^BL-\d{8}-\d{6,}$/); assert.equal(first.counterpartyName, "Pabrik Mina Jaya"); assert.equal(first.transactionTime, "09:30");
    for (const filter of ["counterpartyName=mina", "receiptNumber=nt-208", `reference=${first.reference}`]) {
      const found = await (await request(base, `/api/archive/query?${filter}`, "GET", undefined, owner.cookie)).json();
      assert.equal(found.entries.length, 1); assert.equal(found.summary.transactionCount, 1); assert.equal(found.summary.totalRupiah, 490000);
      assert.ok(!JSON.stringify(found).includes('"sources"')); assert.ok(!JSON.stringify(found).includes('"pairs"'));
    }
    assert.equal((await request(base, "/api/archive/query?workspaceId=foreign", "GET", undefined, owner.cookie)).status, 400);
    assert.equal((await request(base, "/api/archive/query?limit=51", "GET", undefined, owner.cookie)).status, 400);
    const canonical = await (await request(base, "/api/archive/private-identity", "GET", undefined, owner.cookie)).json();
    assert.deepEqual((await (await request(base, `/api/archive/${first.reference}`, "GET", undefined, owner.cookie)).json()).draft, canonical.draft);
    const unknown = await request(base, "/api/archive/unknown-private-identity", "GET", undefined, outsider.cookie);
    const unknownBody = await unknown.json(); assert.equal(unknown.status, 404);
    for (const resource of ["private-identity", first.reference, "private-identity/source/weighing", `${first.reference}/source/receipt`, "unknown-private-identity/source/weighing"]) {
      const denied = await request(base, "/api/archive/" + resource, "GET", undefined, outsider.cookie);
      assert.equal(denied.status, 404); assert.deepEqual(await denied.json(), unknownBody);
    }
    const team = await (await request(base, "/api/workspaces", "POST", { name: "Tim" }, owner.cookie)).json();
    const invitation = await (await request(base, "/api/team/invites", "POST", { email: "outside@example.test" }, owner.cookie)).json();
    await request(base, "/api/team/invites/accept", "POST", { code: invitation.code }, outsider.cookie);
    await request(base, "/api/archive", "POST", transaction("team-revoked"), owner.cookie);
    assert.equal((await request(base, "/api/archive/team-revoked", "GET", undefined, outsider.cookie)).status, 200);
    store.db.prepare("DELETE FROM memberships WHERE workspace_id=? AND user_id=?").run(team.activeWorkspaceId, outsider.session.user.id);
    for (const resource of ["/api/archive/query", "/api/archive/team-revoked", "/api/archive/team-revoked/source/weighing", "/api/chats/inspection:team-revoked"]) assert.equal((await request(base, resource, "GET", undefined, outsider.cookie)).status, 401);
  });
});

test("HTTP history accepts validated unified request-answer pairs and legacy messages, rejecting foreign scope or raw media", async () => {
  await server(async base => {
    const owner = await register(base);
    const unifiedRequest = { requestId: "stored-help-request", question: "Bagaimana cara mengunggah nota?" };
    const unifiedAnswer = { requestId: unifiedRequest.requestId, kind: "help", answer: "Buka Nota Penjualan dan pilih Foto.", workspaceId: owner.session.activeWorkspaceId, workspaceName: "Ruang pribadi", inspection: null, transactions: [], aggregate: null, clarification: false, provider: { name: "basic", model: "basic" } };
    const messages = [{ role: "Anda", text: "Percakapan lama", mode: "basic", revision: 1 }, { role: "Ombak Pintar", text: unifiedAnswer.answer, mode: "basic", revision: null, unifiedRequest, unifiedAnswer }];
    const path = "/api/chats/inspection:unified-history";
    assert.equal((await request(base, path, "PUT", { baseRevision: 0, messages }, owner.cookie)).status, 200);
    assert.deepEqual((await (await request(base, path, "GET", undefined, owner.cookie)).json()).messages, messages);
    for (const bad of [
      { ...messages[1], unifiedAnswer: { ...unifiedAnswer, workspaceId: "foreign-workspace" } },
      { ...messages[1], unifiedRequest: undefined },
      { ...messages[1], unifiedRequest: { ...unifiedRequest, audioDataUrl: "opaque-audio" } },
      { ...messages[0], text: "data:image/png;base64,AAAA" },
      { ...messages[0], text: "data:audio/wav;base64,AAAA" },
    ]) assert.equal((await request(base, path, "PUT", { baseRevision: 1, messages: [bad] }, owner.cookie)).status, 400);
    const unchanged = await (await request(base, path, "GET", undefined, owner.cookie)).json();
    assert.equal(unchanged.revision, 1); assert.deepEqual(unchanged.messages, messages);
  });
});
