import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from "node:crypto";
import type { Draft } from "../../src/types.ts";
import { isDraft } from "../../src/services/storage.ts";
import { validateArchiveRevision, type ArchiveQuery, queryArchive } from "../../src/lib/archiveDomain.ts";

const derive = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }, (error, value) => error ? reject(error) : resolve(value)));
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("base64url");
export class AccountFailure extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}
export type Identity = { userId: string; email: string; name: string; workspaceId: string; workspaceName: string; role: "owner" | "member"; workspaceKind: "personal" | "team"; sessionHash: string };
export type ArchiveMetadata = { transactionTime: string | null; counterpartyName: string | null; receiptNumber: string | null };
export type ArchiveRecord = ArchiveMetadata & { transactionId: string; reference: string; workspaceId: string; revision: number; status: "draft" | "confirmed"; transactionDate: string | null; transactionDateConfirmed: boolean; draft: Draft; createdAt: string; updatedAt: string; latestConfirmedRevision: number | null };
export type ArchiveInput = Partial<ArchiveMetadata> & { transactionId: string; baseRevision: number; status: "draft" | "confirmed"; transactionDate: string | null; transactionDateConfirmed: boolean; draft: Draft };
export type ImageRecord = { kind: "weighing" | "receipt"; mime: string; bytes: Buffer };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- baris hasil node:sqlite; kolom dibaca dan dikonversi di tiap kueri.
type Row = Record<string, any>;
export const ACCOUNT_SCHEMA_VERSION = 2;
const metadataKeys = ["transactionTime", "counterpartyName", "receiptNumber"] as const;
function metadata(input: Partial<ArchiveMetadata>, previous?: Partial<ArchiveMetadata>): ArchiveMetadata {
  const result = {} as ArchiveMetadata;
  for (const key of metadataKeys) {
    const raw = input[key] === undefined ? previous?.[key] ?? null : input[key];
    if (raw !== null && typeof raw !== "string") throw new AccountFailure(400, "INVALID_INPUT", "Metadata transaksi belum valid.");
    const value = raw === null ? null : raw.trim() || null;
    if (value !== null && (/[\u0000-\u001f\u007f]/u.test(value) || value.length > 160 || (key === "transactionTime" && !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)))) throw new AccountFailure(400, "INVALID_INPUT", "Metadata transaksi belum valid.");
    result[key] = value;
  }
  return result;
}
function issuanceDay(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) throw new Error("Waktu pembuatan arsip tidak valid; migrasi dibatalkan.");
  return new Date(date.getTime() + 7 * 3600_000).toISOString().slice(0, 10).replaceAll("-", "");
}

export class AccountStore {
  readonly db: DatabaseSync;
  readonly migrationBackupPath: string | null;
  private now: () => number;
  constructor(databasePath: string, now: () => number = Date.now) {
    this.now = now;
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(databasePath);
    // Pasang batas tunggu kunci sebelum pembacaan pertama: proses lain bisa sedang bermigrasi.
    this.db.exec("PRAGMA busy_timeout=5000;");
    const version = Number(this.db.prepare("PRAGMA user_version").get()!.user_version);
    if (version > ACCOUNT_SCHEMA_VERSION) {
      this.db.close();
      throw new Error("Versi database akun lebih baru daripada aplikasi ini.");
    }
    if (version === 0 && this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1").get()) {
      this.db.close();
      throw new Error("Database tanpa versi berisi data; diperlukan pemeriksaan migrasi manual.");
    }
    this.db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;");
    try {
      if (version === 0) this.atomic(() => this.db.exec(`
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memberships(workspace_id TEXT NOT NULL REFERENCES workspaces(id),user_id TEXT NOT NULL REFERENCES users(id),role TEXT NOT NULL,PRIMARY KEY(workspace_id,user_id));
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),workspace_id TEXT NOT NULL REFERENCES workspaces(id),expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS invitations(token_hash TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),email TEXT NOT NULL,expires_at INTEGER NOT NULL,used_at TEXT,used_by TEXT);
      CREATE TABLE IF NOT EXISTS transactions(workspace_id TEXT NOT NULL REFERENCES workspaces(id),transaction_id TEXT NOT NULL,current_revision INTEGER NOT NULL,confirmed_revision INTEGER,PRIMARY KEY(workspace_id,transaction_id));
      CREATE TABLE IF NOT EXISTS archive_revisions(workspace_id TEXT NOT NULL,transaction_id TEXT NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL,transaction_date TEXT,date_confirmed INTEGER NOT NULL,draft_json TEXT NOT NULL,payload_hash TEXT NOT NULL,actor_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(workspace_id,transaction_id,revision),FOREIGN KEY(workspace_id,transaction_id) REFERENCES transactions(workspace_id,transaction_id));
      CREATE TABLE IF NOT EXISTS archive_images(workspace_id TEXT NOT NULL,transaction_id TEXT NOT NULL,revision INTEGER NOT NULL,kind TEXT NOT NULL,mime TEXT NOT NULL,bytes BLOB NOT NULL,PRIMARY KEY(workspace_id,transaction_id,revision,kind),FOREIGN KEY(workspace_id,transaction_id,revision) REFERENCES archive_revisions(workspace_id,transaction_id,revision));
      CREATE TABLE IF NOT EXISTS chats(user_id TEXT NOT NULL REFERENCES users(id),workspace_id TEXT NOT NULL REFERENCES workspaces(id),context_id TEXT NOT NULL,revision INTEGER NOT NULL,messages_json TEXT NOT NULL,PRIMARY KEY(user_id,workspace_id,context_id));
      CREATE TABLE IF NOT EXISTS google_accounts(subject TEXT PRIMARY KEY,user_id TEXT NOT NULL UNIQUE REFERENCES users(id));
      PRAGMA user_version=1;`));
      this.migrationBackupPath = this.migrate(databasePath, version === 1);
      this.db.exec("PRAGMA journal_mode=WAL;");
    } catch (error) { this.db.close(); throw error; }
  }
  close() { this.db.close(); }
  private iso() { return new Date(this.now()).toISOString(); }
  private atomic<T>(run: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = run(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  private nextReference(day: string) {
    for (;;) {
      const counter = this.db.prepare("INSERT INTO reference_counters(day,last_value) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET last_value=last_value+1 RETURNING last_value").get(day)!;
      const sequence = Number(counter.last_value);
      if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error("Nomor referensi melebihi batas penyimpanan.");
      const reference = `BL-${day}-${String(sequence).padStart(6, "0")}`;
      if (!this.db.prepare("SELECT 1 FROM transactions WHERE transaction_id=? COLLATE NOCASE OR reference=?").get(reference, reference)) return reference;
    }
  }
  private migrate(databasePath: string, needsBackup: boolean): string | null {
    return this.atomic(() => {
      const version = Number(this.db.prepare("PRAGMA user_version").get()!.user_version);
      if (version === ACCOUNT_SCHEMA_VERSION) return null;
      if (version !== 1) throw new Error("Versi database akun tidak didukung.");
      let backupPath: string | null = null;
      if (needsBackup && databasePath !== ":memory:") {
        backupPath = `${databasePath}.before-v2-${randomUUID()}.sqlite`;
        // A separate reader backs up committed WAL while this writer lock prevents changes.
        const source = new DatabaseSync(databasePath, { readOnly: true });
        try { source.exec("PRAGMA synchronous=FULL;"); source.prepare("VACUUM INTO ?").run(backupPath); } finally { source.close(); }
        const backup = new DatabaseSync(backupPath, { readOnly: true });
        try { if (backup.prepare("PRAGMA quick_check").get()!.quick_check !== "ok" || Number(backup.prepare("PRAGMA user_version").get()!.user_version) !== 1) throw new Error("Cadangan database gagal diverifikasi."); }
        finally { backup.close(); }
      }
      this.db.exec(`ALTER TABLE transactions ADD COLUMN reference TEXT;
        CREATE UNIQUE INDEX transaction_reference_unique ON transactions(reference);
        CREATE TABLE reference_counters(day TEXT PRIMARY KEY,last_value INTEGER NOT NULL);
        ALTER TABLE archive_revisions ADD COLUMN transaction_time TEXT;
        ALTER TABLE archive_revisions ADD COLUMN counterparty_name TEXT;
        ALTER TABLE archive_revisions ADD COLUMN receipt_number TEXT;
        CREATE TABLE IF NOT EXISTS google_accounts(subject TEXT PRIMARY KEY,user_id TEXT NOT NULL UNIQUE REFERENCES users(id));`);
      const rows = this.db.prepare("SELECT t.workspace_id,t.transaction_id,r.created_at FROM transactions t JOIN archive_revisions r ON r.workspace_id=t.workspace_id AND r.transaction_id=t.transaction_id AND r.revision=1 ORDER BY r.created_at,t.workspace_id,t.transaction_id").all() as Row[];
      for (const row of rows) this.db.prepare("UPDATE transactions SET reference=? WHERE workspace_id=? AND transaction_id=?").run(this.nextReference(issuanceDay(row.created_at)), row.workspace_id, row.transaction_id);
      if (this.db.prepare("SELECT 1 FROM transactions WHERE reference IS NULL").get()) throw new Error("Arsip tanpa revisi awal; migrasi dibatalkan.");
      this.db.exec("PRAGMA user_version=2;");
      return backupPath;
    });
  }
  private checkAccess(identity: Identity): Identity {
    const row = this.db.prepare(`SELECT u.id userId,u.email,u.name,s.workspace_id workspaceId,w.name workspaceName,m.role,w.kind workspaceKind,s.token_hash sessionHash
      FROM sessions s JOIN users u ON u.id=s.user_id JOIN memberships m ON m.user_id=s.user_id AND m.workspace_id=s.workspace_id JOIN workspaces w ON w.id=s.workspace_id
      WHERE s.token_hash=? AND s.user_id=? AND s.expires_at>?`).get(identity.sessionHash, identity.userId, this.now()) as Identity | undefined;
    if (!row) throw new AccountFailure(401, "AUTH_REQUIRED", "Masuk untuk membuka data akun.");
    if (row.workspaceId !== identity.workspaceId) throw new AccountFailure(409, "WORKSPACE_CHANGED", "Ruang kerja aktif telah berubah.");
    return row;
  }
  async register(email: string, password: string, name: string) {
    const salt = randomBytes(16).toString("hex");
    const passwordHash = (await derive(password, salt)).toString("hex");
    return this.atomic(() => {
      if (this.db.prepare("SELECT id FROM users WHERE email=?").get(email)) throw new AccountFailure(409, "ACCOUNT_EXISTS", "Email ini sudah terdaftar. Silakan masuk.");
      const account = this.createPersonalAccount(email, name, salt, passwordHash);
      return this.newSession(account.userId, account.workspaceId);
    });
  }
  async login(email: string, password: string) {
    const user = this.db.prepare("SELECT * FROM users WHERE email=?").get(email) as Row | undefined;
    const actual = await derive(password, user?.salt ?? "00000000000000000000000000000000");
    if (!user || !timingSafeEqual(actual, Buffer.from(user.password_hash, "hex"))) throw new AccountFailure(401, "INVALID_LOGIN", "Email atau kata sandi belum sesuai.");
    return this.newSession(user.id, this.personalWorkspace(user.id));
  }
  private createPersonalAccount(email: string, name: string, salt: string, passwordHash: string) {
    const userId = randomUUID(), workspaceId = randomUUID();
    this.db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?)").run(userId, email, name, salt, passwordHash, this.iso());
    this.db.prepare("INSERT INTO workspaces VALUES(?,?,?,?)").run(workspaceId, "Ruang pribadi", "personal", this.iso());
    this.db.prepare("INSERT INTO memberships VALUES(?,?,?)").run(workspaceId, userId, "owner");
    return { userId, workspaceId };
  }
  private personalWorkspace(userId: string) {
    const membership = this.db.prepare("SELECT m.workspace_id FROM memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=? ORDER BY CASE w.kind WHEN 'personal' THEN 0 ELSE 1 END LIMIT 1").get(userId);
    return String(membership!.workspace_id);
  }
  loginWithGoogle(profile: { subject: string; email: string; name: string }) {
    return this.atomic(() => {
      const linked = this.db.prepare("SELECT user_id FROM google_accounts WHERE subject=?").get(profile.subject);
      if (linked) {
        const userId = String(linked.user_id);
        return this.newSession(userId, this.personalWorkspace(userId));
      }
      if (this.db.prepare("SELECT 1 FROM users WHERE email=?").get(profile.email))
        throw new AccountFailure(409, "GOOGLE_LINK_REQUIRED", "Masuk dengan email dahulu untuk menghubungkan Google.");
      const { userId, workspaceId } = this.createPersonalAccount(profile.email, profile.name, randomBytes(16).toString("hex"), randomBytes(64).toString("hex"));
      this.db.prepare("INSERT INTO google_accounts(subject,user_id) VALUES(?,?)").run(profile.subject, userId);
      return this.newSession(userId, workspaceId);
    });
  }
  linkGoogle(identity: Identity, profile: { subject: string; email: string }) {
    return this.atomic(() => {
      if (identity.email !== profile.email)
        throw new AccountFailure(403, "GOOGLE_EMAIL_MISMATCH", "Gunakan email Google yang sama dengan akun BuktiLaut.");
      const linked = this.db.prepare("SELECT subject,user_id FROM google_accounts WHERE subject=? OR user_id=?").all(profile.subject, identity.userId);
      if (linked.length && (linked.length !== 1 || linked[0].subject !== profile.subject || linked[0].user_id !== identity.userId))
        throw new AccountFailure(409, "GOOGLE_LINK_EXISTS", "Identitas Google sudah terhubung ke akun lain.");
      if (!linked.length) this.db.prepare("INSERT INTO google_accounts(subject,user_id) VALUES(?,?)").run(profile.subject, identity.userId);
    });
  }
  private newSession(userId: string, workspaceId: string) {
    const raw = token();
    this.db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(hash(raw), userId, workspaceId, this.now() + 7 * 86400_000);
    return raw;
  }
  authenticate(raw?: string): Identity | null {
    if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
    const row = this.db.prepare(`SELECT u.id userId,u.email,u.name,s.workspace_id workspaceId,w.name workspaceName,m.role,w.kind workspaceKind,s.token_hash sessionHash
      FROM sessions s JOIN users u ON u.id=s.user_id JOIN memberships m ON m.user_id=s.user_id AND m.workspace_id=s.workspace_id JOIN workspaces w ON w.id=s.workspace_id
      WHERE s.token_hash=? AND s.expires_at>?`).get(hash(raw), this.now()) as Identity | undefined;
    return row ?? null;
  }
  logout(raw?: string) { if (raw) this.db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hash(raw)); }
  session(identity: Identity | null) {
    if (!identity) return { user: null, workspaces: [], activeWorkspaceId: null };
    const workspaces = this.db.prepare("SELECT w.id,w.name,w.kind,m.role FROM memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=? ORDER BY w.created_at,w.id").all(identity.userId);
    return { user: { id: identity.userId, email: identity.email, name: identity.name }, workspaces, activeWorkspaceId: identity.workspaceId };
  }
  activate(identity: Identity, workspaceId: string) {
    if (!this.db.prepare("SELECT 1 FROM memberships WHERE user_id=? AND workspace_id=?").get(identity.userId, workspaceId)) throw new AccountFailure(403, "FORBIDDEN", "Anda tidak memiliki akses ke ruang ini.");
    this.db.prepare("UPDATE sessions SET workspace_id=? WHERE token_hash=?").run(workspaceId, identity.sessionHash);
  }
  createTeam(identity: Identity, name: string) {
    return this.atomic(() => {
      const id = randomUUID();
      this.db.prepare("INSERT INTO workspaces VALUES(?,?,?,?)").run(id, name, "team", this.iso());
      this.db.prepare("INSERT INTO memberships VALUES(?,?,?)").run(id, identity.userId, "owner");
      this.activate(identity, id);
    });
  }
  members(identity: Identity) {
    identity = this.checkAccess(identity);
    return this.db.prepare("SELECT u.id userId,u.email,u.name,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY m.role,u.email").all(identity.workspaceId);
  }
  invite(identity: Identity, email: string) {
    identity = this.checkAccess(identity);
    if (identity.role !== "owner" || identity.workspaceKind !== "team") throw new AccountFailure(403, "FORBIDDEN", "Undangan hanya dapat dibuat pemilik ruang tim.");
    if (this.db.prepare("SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND u.email=?").get(identity.workspaceId, email)) throw new AccountFailure(409, "ALREADY_MEMBER", "Akun ini sudah menjadi anggota.");
    const code = token(), expiresAt = this.now() + 48 * 3600_000;
    this.db.prepare("INSERT INTO invitations VALUES(?,?,?,?,NULL,NULL)").run(hash(code), identity.workspaceId, email, expiresAt);
    return { code, expiresAt: new Date(expiresAt).toISOString(), invitePath: `/?invite=${encodeURIComponent(code)}` };
  }
  accept(identity: Identity, code: string) {
    this.atomic(() => {
      const invite = this.db.prepare("SELECT * FROM invitations WHERE token_hash=?").get(hash(code)) as Row | undefined;
      if (!invite || invite.used_at || invite.expires_at <= this.now()) throw new AccountFailure(400, "INVITE_INVALID", "Undangan tidak berlaku atau sudah digunakan.");
      if (invite.email !== identity.email) throw new AccountFailure(403, "FORBIDDEN", "Undangan ini ditujukan untuk akun email lain.");
      this.db.prepare("INSERT OR IGNORE INTO memberships VALUES(?,?,?)").run(invite.workspace_id, identity.userId, "member");
      this.db.prepare("UPDATE invitations SET used_at=?,used_by=? WHERE token_hash=? AND used_at IS NULL").run(this.iso(), identity.userId, hash(code));
      this.activate(identity, invite.workspace_id);
    });
  }
  private transaction(identity: Identity, id: string) {
    this.checkAccess(identity);
    const row = (this.db.prepare("SELECT * FROM transactions WHERE workspace_id=? AND transaction_id=?").get(identity.workspaceId, id) ?? this.db.prepare("SELECT * FROM transactions WHERE workspace_id=? AND reference=? COLLATE NOCASE").get(identity.workspaceId, id)) as Row | undefined;
    if (!row) {
      throw new AccountFailure(404, "NOT_FOUND", "Transaksi belum ditemukan.");
    }
    return row;
  }
  saveArchive(identity: Identity, input: ArchiveInput, images: ImageRecord[]) {
    const completeDraft = structuredClone(input.draft);
    for (const image of images) completeDraft.sources[image.kind].image = `data:${image.mime};base64,${image.bytes.toString("base64")}`;
    if (!isDraft(completeDraft)) throw new AccountFailure(400, "INVALID_INPUT", "Draf atau konfirmasi transaksi belum valid.");
    return this.atomic(() => {
      this.checkAccess(identity);
      const previous = input.baseRevision > 0 ? this.db.prepare("SELECT transaction_time transactionTime,counterparty_name counterpartyName,receipt_number receiptNumber FROM archive_revisions WHERE workspace_id=? AND transaction_id=? AND revision=?").get(identity.workspaceId, input.transactionId, input.baseRevision) as ArchiveMetadata | undefined : undefined;
      const fields = metadata(input, previous);
      if (!validateArchiveRevision({ ...input, ...fields, revision: input.baseRevision + 1, draft: completeDraft })) throw new AccountFailure(400, "INVALID_INPUT", "Draf atau konfirmasi transaksi belum valid.");
      const content = JSON.stringify({ status: input.status, transactionDate: input.transactionDate, transactionDateConfirmed: input.transactionDateConfirmed, draft: input.draft, ...(metadataKeys.some(key => fields[key] !== null) ? { metadata: fields } : {}) });
      const digest = hash(content + images.map(i => `${i.kind}:${hash(i.bytes.toString("base64"))}`).join("|"));
      const current = this.db.prepare("SELECT * FROM transactions WHERE workspace_id=? AND transaction_id=?").get(identity.workspaceId, input.transactionId) as Row | undefined;
      if ((current?.current_revision ?? 0) !== input.baseRevision) {
        const retry = this.db.prepare("SELECT payload_hash FROM archive_revisions WHERE workspace_id=? AND transaction_id=? AND revision=?").get(identity.workspaceId, input.transactionId, input.baseRevision + 1) as Row | undefined;
        if (retry?.payload_hash === digest) return this.readArchive(identity, input.transactionId, input.baseRevision + 1);
        throw new AccountFailure(409, "REVISION_CONFLICT", "Transaksi telah berubah. Muat versi terbaru sebelum menyimpan lagi.");
      }
      const revision = input.baseRevision + 1;
      if (!current && /^BL-\d{8}-\d{6,}$/i.test(input.transactionId)) throw new AccountFailure(400, "INVALID_INPUT", "Gunakan ID internal untuk transaksi baru; referensi dibuat oleh server.");
      if (!current) this.db.prepare("INSERT INTO transactions(workspace_id,transaction_id,current_revision,confirmed_revision,reference) VALUES(?,?,0,NULL,?)").run(identity.workspaceId, input.transactionId, this.nextReference(issuanceDay(this.iso())));
      this.db.prepare("INSERT INTO archive_revisions(workspace_id,transaction_id,revision,status,transaction_date,date_confirmed,draft_json,payload_hash,actor_id,created_at,transaction_time,counterparty_name,receipt_number) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(identity.workspaceId, input.transactionId, revision, input.status, input.transactionDate, input.transactionDateConfirmed ? 1 : 0, JSON.stringify(input.draft), digest, identity.userId, this.iso(), fields.transactionTime, fields.counterpartyName, fields.receiptNumber);
      for (const image of images) this.db.prepare("INSERT INTO archive_images VALUES(?,?,?,?,?,?)").run(identity.workspaceId, input.transactionId, revision, image.kind, image.mime, image.bytes);
      this.db.prepare("UPDATE transactions SET current_revision=?,confirmed_revision=CASE WHEN ?='confirmed' THEN ? ELSE confirmed_revision END WHERE workspace_id=? AND transaction_id=?").run(revision, input.status, revision, identity.workspaceId, input.transactionId);
      return this.readArchive(identity, input.transactionId, revision);
    });
  }
  readArchive(identity: Identity, id: string, revision?: number): ArchiveRecord {
    const tx = this.transaction(identity, id);
    id = tx.transaction_id;
    const row = this.db.prepare("SELECT * FROM archive_revisions WHERE workspace_id=? AND transaction_id=? AND revision=?").get(identity.workspaceId, id, revision ?? tx.current_revision) as Row | undefined;
    if (!row) throw new AccountFailure(404, "NOT_FOUND", "Revisi belum ditemukan.");
    const first = this.db.prepare("SELECT created_at FROM archive_revisions WHERE workspace_id=? AND transaction_id=? AND revision=1").get(identity.workspaceId, id) as Row;
    const latest = this.db.prepare("SELECT created_at FROM archive_revisions WHERE workspace_id=? AND transaction_id=? AND revision=?").get(identity.workspaceId, id, tx.current_revision) as Row;
    const draft = JSON.parse(row.draft_json) as Draft;
    for (const image of this.db.prepare("SELECT kind,mime,bytes FROM archive_images WHERE workspace_id=? AND transaction_id=? AND revision=?").all(identity.workspaceId, id, row.revision) as Row[]) draft.sources[image.kind as "weighing" | "receipt"].image = `data:${image.mime};base64,${Buffer.from(image.bytes).toString("base64")}`;
    return { transactionId: id, reference: tx.reference, workspaceId: identity.workspaceId, revision: row.revision, status: row.status, transactionDate: row.transaction_date, transactionDateConfirmed: !!row.date_confirmed, transactionTime: row.transaction_time ?? null, counterpartyName: row.counterparty_name ?? null, receiptNumber: row.receipt_number ?? null, draft, createdAt: first.created_at, updatedAt: latest.created_at, latestConfirmedRevision: tx.confirmed_revision };
  }
  revisions(identity: Identity, id: string) {
    id = this.transaction(identity, id).transaction_id;
    return this.db.prepare("SELECT revision,status,transaction_date transactionDate,date_confirmed transactionDateConfirmed,transaction_time transactionTime,counterparty_name counterpartyName,receipt_number receiptNumber,created_at createdAt FROM archive_revisions WHERE workspace_id=? AND transaction_id=? ORDER BY revision DESC").all(identity.workspaceId, id);
  }
  archiveRecords(identity: Identity, allRevisions = false): ArchiveRecord[] {
    this.checkAccess(identity);
    const rows = this.db.prepare(allRevisions ? "SELECT transaction_id,revision FROM archive_revisions WHERE workspace_id=? ORDER BY transaction_id,revision" : "SELECT transaction_id,current_revision revision FROM transactions WHERE workspace_id=? ORDER BY transaction_id").all(identity.workspaceId) as Row[];
    return rows.map(row => this.readArchive(identity, row.transaction_id, row.revision));
  }
  image(identity: Identity, id: string, kind: string, revision?: number) {
    const tx = this.transaction(identity, id);
    id = tx.transaction_id;
    const image = this.db.prepare("SELECT mime,bytes FROM archive_images WHERE workspace_id=? AND transaction_id=? AND revision=? AND kind=?").get(identity.workspaceId, id, revision ?? tx.current_revision, kind) as Row | undefined;
    if (!image) throw new AccountFailure(404, "NOT_FOUND", "Foto sumber belum tersedia.");
    return { mime: image.mime as string, bytes: Buffer.from(image.bytes) };
  }
  chat(identity: Identity, contextId: string) {
    this.checkAccess(identity);
    const row = this.db.prepare("SELECT revision,messages_json FROM chats WHERE user_id=? AND workspace_id=? AND context_id=?").get(identity.userId, identity.workspaceId, contextId) as Row | undefined;
    return { contextId, revision: row?.revision ?? 0, messages: row ? JSON.parse(row.messages_json) as unknown[] : [] };
  }
  saveChat(identity: Identity, contextId: string, messages: unknown[], baseRevision: number) {
    return this.atomic(() => {
      const current = this.chat(identity, contextId);
      if (current.revision !== baseRevision) {
        if (JSON.stringify(current.messages) === JSON.stringify(messages)) return current;
        throw new AccountFailure(409, "REVISION_CONFLICT", "Riwayat berubah. Muat riwayat terbaru sebelum menyimpan.");
      }
      this.db.prepare("INSERT INTO chats VALUES(?,?,?,?,?) ON CONFLICT(user_id,workspace_id,context_id) DO UPDATE SET revision=excluded.revision,messages_json=excluded.messages_json").run(identity.userId, identity.workspaceId, contextId, baseRevision + 1, JSON.stringify(messages));
      return this.chat(identity, contextId);
    });
  }
  queryArchive(identity: Identity, query: ArchiveQuery) {
    this.checkAccess(identity);
    return queryArchive(this.archiveRecords(identity, true), query);
  }
}
