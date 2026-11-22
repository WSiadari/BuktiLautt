import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { Worker } from "node:worker_threads";
import { AccountStore, ACCOUNT_SCHEMA_VERSION, type ArchiveInput } from "./accounts/store.ts";
import { demoDraft, row } from "../src/data/demo.ts";
import { buildVisionResult } from "../src/vision/contract.ts";
import { classifiedFixture, requestFixture } from "./test-fixtures.ts";

const instant = "2026-11-19T20:30:00.000Z", now = () => Date.parse(instant);
const blob = Buffer.from("old-private-source-bytes-unchanged");
function input(id: string, amount = 490000): ArchiveInput {
  const draft = demoDraft(); draft.demo = false;
  draft.weighing = [row("Teri", "12")]; draft.receipt = [row("Teri", "10", String(amount / 10))];
  draft.weighingConfirmed = draft.receiptConfirmed = true; draft.deduction = draft.charges = "0";
  draft.pairs = [{ weighId: draft.weighing[0].id, receiptId: draft.receipt[0].id, decision: "confirmed", adjustment: "2", explanation: "Dibawa pulang; nilai sumber dipertahankan" }];
  return { transactionId: id, baseRevision: 0, status: "confirmed", transactionDate: "2026-11-20", transactionDateConfirmed: true, draft };
}
function fixture(path: string) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE workspaces(id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE memberships(workspace_id TEXT NOT NULL REFERENCES workspaces(id),user_id TEXT NOT NULL REFERENCES users(id),role TEXT NOT NULL,PRIMARY KEY(workspace_id,user_id));
    CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),workspace_id TEXT NOT NULL REFERENCES workspaces(id),expires_at INTEGER NOT NULL);
    CREATE TABLE invitations(token_hash TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),email TEXT NOT NULL,expires_at INTEGER NOT NULL,used_at TEXT,used_by TEXT);
    CREATE TABLE transactions(workspace_id TEXT NOT NULL REFERENCES workspaces(id),transaction_id TEXT NOT NULL,current_revision INTEGER NOT NULL,confirmed_revision INTEGER,PRIMARY KEY(workspace_id,transaction_id));
    CREATE TABLE archive_revisions(workspace_id TEXT NOT NULL,transaction_id TEXT NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL,transaction_date TEXT,date_confirmed INTEGER NOT NULL,draft_json TEXT NOT NULL,payload_hash TEXT NOT NULL,actor_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(workspace_id,transaction_id,revision),FOREIGN KEY(workspace_id,transaction_id) REFERENCES transactions(workspace_id,transaction_id));
    CREATE TABLE archive_images(workspace_id TEXT NOT NULL,transaction_id TEXT NOT NULL,revision INTEGER NOT NULL,kind TEXT NOT NULL,mime TEXT NOT NULL,bytes BLOB NOT NULL,PRIMARY KEY(workspace_id,transaction_id,revision,kind),FOREIGN KEY(workspace_id,transaction_id,revision) REFERENCES archive_revisions(workspace_id,transaction_id,revision));
    CREATE TABLE chats(user_id TEXT NOT NULL REFERENCES users(id),workspace_id TEXT NOT NULL REFERENCES workspaces(id),context_id TEXT NOT NULL,revision INTEGER NOT NULL,messages_json TEXT NOT NULL,PRIMARY KEY(user_id,workspace_id,context_id));
    CREATE TABLE google_accounts(subject TEXT PRIMARY KEY,user_id TEXT NOT NULL UNIQUE REFERENCES users(id));
    PRAGMA user_version=1;`);
  const tokens: Record<string, string> = {};
  for (const id of ["owner", "member", "outsider"]) {
    db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?)").run(id, `${id}@example.test`, id, "legacy-salt", "legacy-hash", instant);
    db.prepare("INSERT INTO workspaces VALUES(?,?,?,?)").run(`personal-${id}`, "Pribadi", "personal", instant);
    db.prepare("INSERT INTO memberships VALUES(?,?,?)").run(`personal-${id}`, id, "owner");
    tokens[id] = randomBytes(32).toString("base64url");
    db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(createHash("sha256").update(tokens[id]).digest("hex"), id, `personal-${id}`, now() + 86400_000);
  }
  db.prepare("INSERT INTO workspaces VALUES(?,?,?,?)").run("team-legacy", "Tim lama", "team", instant);
  for (const user of ["owner", "member"]) db.prepare("INSERT INTO memberships VALUES(?,?,?)").run("team-legacy", user, user === "owner" ? "owner" : "member");
  db.prepare("INSERT INTO invitations VALUES(?,?,?,?,NULL,NULL)").run("old-invite-hash", "team-legacy", "future@example.test", now() + 86400_000);
  db.prepare("INSERT INTO google_accounts VALUES(?,?)").run("legacy-google-subject", "owner");
  const value = input("legacy-link-abc");
  value.draft.id = "old-inspection-id";
  for (const kind of ["weighing", "receipt"] as const) {
    const source = value.draft.sources[kind]; source.capturedAt = instant;
    const result = buildVisionResult(classifiedFixture(kind === "weighing" ? "weighing" : "sales_receipt"), { ...requestFixture(), documentType: kind, sourceId: `${value.draft.id}:${kind}:${instant}` }, "synthetic-test");
    value.draft.rawExtractions ??= {}; value.draft.rawExtractions[kind] = { result, receivedAt: instant, sourceCapturedAt: instant };
    value.draft.confirmedSnapshots ??= {}; value.draft.confirmedSnapshots[kind] = { revision: 1, confirmedAt: instant, sourceCapturedAt: instant, rows: structuredClone(value.draft[kind]), deduction: "0", charges: "0" };
  }
  db.prepare("INSERT INTO transactions VALUES(?,?,?,?)").run("personal-owner", value.transactionId, 2, 1);
  const original = JSON.stringify(value.draft), revised = structuredClone(value.draft); revised.pairs[0].explanation = "Perubahan draf berikutnya";
  for (const revision of [1, 2]) {
    db.prepare("INSERT INTO archive_revisions VALUES(?,?,?,?,?,?,?,?,?,?)").run("personal-owner", value.transactionId, revision, revision === 1 ? "confirmed" : "draft", "2026-11-20", 1, revision === 1 ? original : JSON.stringify(revised), `legacy-payload-${revision}`, "owner", instant);
    db.prepare("INSERT INTO archive_images VALUES(?,?,?,?,?,?)").run("personal-owner", value.transactionId, revision, "weighing", "image/png", blob);
  }
  db.prepare("INSERT INTO chats VALUES(?,?,?,?,?)").run("owner", "personal-owner", "inspection:old-inspection-id", 3, JSON.stringify([{ role: "Anda", text: "Percakapan lama", mode: "basic", revision: 1 }]));
  return { db, tokens, original, value };
}
function temporary(run: (path: string, folder: string) => unknown) {
  const folder = mkdtempSync(join(tmpdir(), "buktilaut-v2-fixture-"));
  try { return run(join(folder, "copy.sqlite"), folder); } finally { rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}

test("schema1 migration backs up committed WAL and preserves IDs, immutable revisions, sources, raw AI, members and chat", () => temporary((path, folder) => {
  const old = fixture(path);
  // Leave the WAL-owning connection open so a plain file copy could miss these records.
  const store = new AccountStore(path, now);
  try {
    assert.equal(store.db.prepare("PRAGMA user_version").get()!.user_version, ACCOUNT_SCHEMA_VERSION);
    assert.ok(store.migrationBackupPath);
    const backup = new DatabaseSync(store.migrationBackupPath!, { readOnly: true });
    try {
      assert.equal(backup.prepare("PRAGMA user_version").get()!.user_version, 1);
      assert.equal(backup.prepare("PRAGMA quick_check").get()!.quick_check, "ok");
      assert.equal(backup.prepare("SELECT draft_json FROM archive_revisions WHERE revision=1").get()!.draft_json, old.original);
      assert.deepEqual(Buffer.from(backup.prepare("SELECT bytes FROM archive_images LIMIT 1").get()!.bytes as Uint8Array), blob);
      assert.equal(backup.prepare("SELECT COUNT(*) n FROM memberships").get()!.n, 5);
    } finally { backup.close(); }
    const owner = store.authenticate(old.tokens.owner)!;
    const first = store.readArchive(owner, "legacy-link-abc", 1), latest = store.readArchive(owner, "legacy-link-abc");
    assert.equal(first.reference, "BL-20261120-000001"); assert.equal(latest.reference, first.reference);
    assert.equal(first.transactionId, old.value.transactionId); assert.equal(first.draft.id, "old-inspection-id");
    assert.equal(first.draft.pairs[0].adjustment, "2"); assert.equal(first.draft.weighing[0].kg, "12");
    assert.deepEqual(first.draft.rawExtractions, old.value.draft.rawExtractions); assert.deepEqual(first.draft.confirmedSnapshots, old.value.draft.confirmedSnapshots);
    assert.equal(store.db.prepare("SELECT draft_json FROM archive_revisions WHERE revision=1").get()!.draft_json, old.original);
    assert.deepEqual(store.readArchive(owner, first.reference, 1), first);
    assert.deepEqual(store.image(owner, first.reference, "weighing", 1).bytes, blob);
    assert.equal(store.chat(owner, "inspection:old-inspection-id").revision, 3);
    assert.equal(store.db.prepare("SELECT subject FROM google_accounts").get()!.subject, "legacy-google-subject");
    assert.equal(store.db.prepare("SELECT token_hash FROM invitations").get()!.token_hash, "old-invite-hash");
    assert.equal(store.queryArchive(owner, {}).summary.totalRupiah, 490000);
  } finally { store.close(); old.db.close(); }
  const reopened = new AccountStore(path, now);
  try { assert.equal(reopened.migrationBackupPath, null); assert.equal(readdirSync(folder).filter(name => name.includes("before-v2")).length, 1); }
  finally { reopened.close(); }
}));

test("backup failure aborts before schema changes; migration failure rolls back all columns and counters", () => temporary((path, folder) => {
  const old = fixture(path); old.db.close();
  const prepare = DatabaseSync.prototype.prepare;
  const patched = mock.method(DatabaseSync.prototype, "prepare", function (this: DatabaseSync, sql: string) { if (sql === "VACUUM INTO ?") throw Error("synthetic backup failure"); return prepare.call(this, sql); });
  assert.throws(() => new AccountStore(path, now), /synthetic backup failure/); patched.mock.restore();
  let check = new DatabaseSync(path);
  assert.equal(check.prepare("PRAGMA user_version").get()!.user_version, 1);
  assert.equal(check.prepare("SELECT draft_json FROM archive_revisions WHERE revision=1").get()!.draft_json, old.original);
  assert.ok(!check.prepare("PRAGMA table_info(transactions)").all().some(column => column.name === "reference"));
  check.prepare("UPDATE archive_revisions SET created_at='invalid-legacy-time' WHERE revision=1").run(); check.close();
  assert.throws(() => new AccountStore(path, now), /Waktu pembuatan arsip tidak valid/);
  check = new DatabaseSync(path);
  try {
    assert.equal(check.prepare("PRAGMA user_version").get()!.user_version, 1);
    assert.ok(!check.prepare("PRAGMA table_info(transactions)").all().some(column => column.name === "reference"));
    assert.equal(check.prepare("SELECT name FROM sqlite_master WHERE name='reference_counters'").get(), undefined);
    assert.equal(check.prepare("SELECT COUNT(*) n FROM archive_images").get()!.n, 2);
    assert.equal(readdirSync(folder).filter(name => name.includes("before-v2")).length, 1);
    check.prepare("UPDATE archive_revisions SET created_at=? WHERE revision=1").run(instant);
  } finally { check.close(); }
  const repaired = new AccountStore(path, now); repaired.close();
}));

test("an unversioned nonempty database fails closed without adding schema or changing rows", () => temporary(path => {
  const unknown = new DatabaseSync(path); unknown.exec("CREATE TABLE legacy_evidence(value TEXT);INSERT INTO legacy_evidence VALUES('preserve');"); unknown.close();
  assert.throws(() => new AccountStore(path, now), /tanpa versi berisi data/);
  const check = new DatabaseSync(path, { readOnly: true });
  try { assert.equal(check.prepare("PRAGMA user_version").get()!.user_version, 0); assert.equal(check.prepare("SELECT value FROM legacy_evidence").get()!.value, "preserve"); assert.equal(check.prepare("SELECT name FROM sqlite_master WHERE name='users'").get(), undefined); }
  finally { check.close(); }
}));

test("legacy IDs resembling references remain reachable without ambiguous generated aliases", () => temporary(path => {
  const old = fixture(path), reservedId = "BL-20261120-000001";
  old.db.prepare("INSERT INTO transactions VALUES(?,?,1,1)").run("personal-owner", reservedId);
  old.db.prepare("INSERT INTO archive_revisions VALUES(?,?,1,'confirmed','2026-11-20',1,?,?,?,?)").run("personal-owner", reservedId, old.original, "legacy-reserved-id", "owner", "2026-11-19T20:31:00.000Z");
  old.db.close();
  const store = new AccountStore(path, now);
  try {
    const owner = store.authenticate(old.tokens.owner)!;
    const canonical = store.readArchive(owner, reservedId);
    assert.equal(canonical.transactionId, reservedId); assert.notEqual(canonical.reference, reservedId);
    assert.equal(store.readArchive(owner, canonical.reference.toLowerCase()).transactionId, reservedId);
    assert.equal(store.readArchive(owner, "legacy-link-abc").reference, "BL-20261120-000002");
    assert.throws(() => store.saveArchive(owner, input("BL-20261120-999999"), []), { status: 400, code: "INVALID_INPUT" });
  } finally { store.close(); }
}));

test("revision metadata inherits on omission, explicit null clears, normalized retry is idempotent and reference stays stable", async () => {
  const store = new AccountStore(":memory:", now);
  try {
    const token = await store.register("owner@example.test", "synthetic-long-password", "Pemilik"), owner = store.authenticate(token)!;
    const value = { ...input("metadata-transaction"), transactionTime: " 09:45 ", counterpartyName: " Pabrik Mina Jaya ", receiptNumber: " NT-208 " };
    const first = store.saveArchive(owner, value, []);
    assert.equal(first.counterpartyName, "Pabrik Mina Jaya"); assert.equal(first.transactionTime, "09:45");
    assert.equal(store.saveArchive(owner, { ...value, transactionTime: "09:45", counterpartyName: "Pabrik Mina Jaya", receiptNumber: "NT-208" }, []).revision, 1);
    const next = { ...input(value.transactionId), draft: value.draft, baseRevision: 1 };
    const second = store.saveArchive(owner, next, []); assert.equal(second.receiptNumber, "NT-208"); assert.equal(second.counterpartyName, first.counterpartyName);
    assert.equal(store.saveArchive(owner, { ...next, counterpartyName: " Pabrik Mina Jaya " }, []).revision, 2);
    const third = store.saveArchive(owner, { ...next, baseRevision: 2, counterpartyName: null, transactionDate: "2026-12-01" }, []);
    assert.equal(third.counterpartyName, null); assert.equal(third.reference, first.reference); assert.equal(third.receiptNumber, "NT-208");
    assert.equal(store.readArchive(owner, first.reference, 1).counterpartyName, "Pabrik Mina Jaya");
    assert.throws(() => store.saveArchive(owner, { ...next, baseRevision: 3, transactionTime: "25:99" }, []), { code: "INVALID_INPUT" });
  } finally { store.close(); }
});

test("ten transactions retain ten references, latest-confirmed totals, paginated search and scoped permissions", async () => {
  const store = new AccountStore(":memory:", now);
  try {
    const token = await store.register("owner@example.test", "synthetic-long-password", "Pemilik"), owner = store.authenticate(token)!;
    const otherToken = await store.register("other@example.test", "synthetic-long-password", "Luar"), outsider = store.authenticate(otherToken)!;
    const inputs: ArchiveInput[] = [];
    for (let i = 0; i < 10; i++) {
      const value = { ...input(`transaction-${i}`, (i + 1) * 1000), status: i < 8 ? "confirmed" as const : "draft" as const, counterpartyName: [0, 3].includes(i) ? "Pabrik Mina Jaya" : `Pembeli ${i}`, receiptNumber: `NT-${i}` };
      inputs.push(value); store.saveArchive(owner, value, []);
    }
    const revised = { ...inputs[0], draft: structuredClone(inputs[0].draft), baseRevision: 1 }; revised.draft.receipt[0].price = "310"; store.saveArchive(owner, revised, []);
    const result = store.queryArchive(owner, { fromDate: "2026-11-20", toDate: "2026-11-20" });
    assert.equal(result.summary.transactionCount, 8); assert.equal(result.summary.totalRupiah, 38100);
    assert.equal(store.queryArchive(owner, { status: "all" }).summary.transactionCount, 10);
    assert.equal(new Set(store.archiveRecords(owner).map(record => record.reference)).size, 10);
    const mina = store.queryArchive(owner, { counterpartyName: "  mina  jaya ", limit: 1 });
    assert.equal(mina.entries.length, 1); assert.equal(mina.summary.transactionCount, 2); assert.equal(mina.summary.totalRupiah, 7100); assert.equal(mina.summary.hasMore, true);
    assert.equal(store.queryArchive(owner, { receiptNumber: "nt-3" }).entries[0].transactionId, "transaction-3");
    assert.equal(store.queryArchive(owner, { reference: result.entries[0].reference! }).entries.length, 1);
    assert.deepEqual(store.queryArchive(outsider, {}).entries, []);
    for (const id of [result.entries[0].transactionId, result.entries[0].reference!, "unknown-private-id"]) assert.throws(() => store.readArchive(outsider, id), { status: 404, code: "NOT_FOUND" });
    assert.throws(() => store.queryArchive(owner, { workspaceId: outsider.workspaceId } as any), /INVALID_ARCHIVE_QUERY/);
    assert.throws(() => store.queryArchive(owner, { limit: 51 }), /INVALID_ARCHIVE_QUERY/);
    store.createTeam(owner, "Tim"); const teamOwner = store.authenticate(token)!;
    const invite = store.invite(teamOwner, outsider.email); store.accept(outsider, invite.code); const member = store.authenticate(otherToken)!;
    store.saveArchive(teamOwner, input("team-private"), []); store.saveChat(member, "inspection:team", [{ role: "Anda", text: "lama" }], 0);
    store.db.prepare("DELETE FROM memberships WHERE workspace_id=? AND user_id=?").run(member.workspaceId, member.userId);
    assert.equal(store.authenticate(otherToken), null);
    for (const read of [() => store.readArchive(member, "team-private"), () => store.image(member, "team-private", "weighing"), () => store.queryArchive(member, {}), () => store.chat(member, "inspection:team"), () => store.archiveRecords(member)]) assert.throws(read, { status: 401, code: "AUTH_REQUIRED" });
  } finally { store.close(); }
});

test("concurrent worker initializers and transaction creation cannot duplicate or recycle global references", async () => {
  const folder = mkdtempSync(join(tmpdir(), "buktilaut-concurrent-")), path = join(folder, "copy.sqlite");
  const old = fixture(path); old.db.close();
  let workers: Worker[] = [];
  try {
    const workerCode = `const{workerData,parentPort}=require('node:worker_threads');(async()=>{const{AccountStore}=await import(workerData.module);parentPort.postMessage('ready');await new Promise(r=>parentPort.once('message',r));const s=new AccountStore(workerData.path,()=>workerData.now);try{const who=s.authenticate(workerData.token);const refs=[];for(let i=0;i<10;i++){const x={...workerData.input,transactionId:workerData.prefix+'-'+i};const a=s.saveArchive(who,x,[]);if(s.saveArchive(who,x,[]).revision!==1)throw Error('retry duplicated');refs.push(a.reference)}parentPort.postMessage(refs)}finally{s.close()}})().catch(e=>{throw e})`;
    workers = ["a", "b"].map(prefix => new Worker(workerCode, { eval: true, workerData: { module: new URL("./accounts/store.ts", import.meta.url).href, path, now: now(), token: prefix === "a" ? old.tokens.owner : old.tokens.member, prefix, input: input("worker-template") } }));
    const exits = workers.map(worker => new Promise<void>((resolve, reject) => { worker.once("exit", code => code === 0 ? resolve() : reject(Error(`Worker exit ${code}`))); worker.once("error", reject); }));
    await Promise.all(workers.map(worker => new Promise<void>((resolve, reject) => { worker.once("message", () => resolve()); worker.once("error", reject); })));
    const done = workers.map(worker => new Promise<string[]>((resolve, reject) => { worker.once("message", resolve); worker.once("error", reject); }));
    workers.forEach(worker => worker.postMessage("go"));
    const references = (await Promise.all(done)).flat(); await Promise.all(exits); assert.equal(new Set(references).size, 20);
    const store = new AccountStore(path, now);
    try {
      const owner = store.authenticate(old.tokens.owner)!;
      assert.equal(store.archiveRecords(owner).length, 11);
      const otherWorkspace = store.authenticate(old.tokens.member)!;
      assert.notEqual(owner.workspaceId, otherWorkspace.workspaceId);
      assert.equal(store.archiveRecords(otherWorkspace).length, 10);
      assert.equal(readdirSync(folder).filter(name => name.includes("before-v2")).length, 1);
      const removed = references[0]; store.db.prepare("DELETE FROM archive_revisions WHERE transaction_id='a-0'").run(); store.db.prepare("DELETE FROM transactions WHERE transaction_id='a-0'").run();
      const added = store.saveArchive(owner, input("after-deletion"), []); assert.ok(!references.includes(added.reference)); assert.notEqual(added.reference, removed);
    } finally { store.close(); }
  } finally { await Promise.allSettled(workers.map(worker => worker.terminate())); rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
