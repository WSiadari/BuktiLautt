import type { Draft } from "../types";
import { sanitizeMatches } from "../lib/matching.ts";
import { sanitizeDocumentConfirmations } from "../lib/documentValidation.ts";
import {
  DRAFT_KEY,
  DEMO_KEY,
  isDraft,
  isDraftStructure,
  readDraft,
} from "./storage.ts";

export const DATABASE_NAME = "buktilaut.prototype";
export const DATABASE_VERSION = 1;
const TIMEOUT_MS = 5000;
const kinds = ["weighing", "receipt"] as const;
type Kind = (typeof kinds)[number];
type StoredDraft = {
  schemaVersion: 1;
  value: Draft;
  imageKeys: Partial<Record<Kind, string>>;
};
type LoadedDraft = {
  value: Draft | null;
  warning: string;
  exists: boolean;
  persisted: boolean;
};
let queue: Promise<void> = Promise.resolve();

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(
      () => fail(new Error("IndexedDB tidak merespons.")),
      TIMEOUT_MS,
    );
    function fail(error: Error | DOMException) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    } catch (error) {
      fail(
        error instanceof Error ? error : new Error("IndexedDB tidak tersedia."),
      );
      return;
    }
    request.onupgradeneeded = () => {
      if (settled) {
        request.transaction?.abort();
        return;
      }
      const db = request.result;
      if (!db.objectStoreNames.contains("drafts"))
        db.createObjectStore("drafts");
      if (!db.objectStoreNames.contains("images"))
        db.createObjectStore("images");
    };
    request.onblocked = () =>
      fail(
        new Error(
          "Penyimpanan sedang dipakai versi lain. Tutup tab BuktiLaut lama, lalu coba lagi.",
        ),
      );
    request.onerror = () =>
      fail(request.error || new Error("IndexedDB belum dapat dibuka."));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (settled) {
        db.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(db);
    };
  });
}

function transaction<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (tx: IDBTransaction, result: (value: T) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["drafts", "images"], mode);
    let value: T;
    let failure: unknown;
    const timer = setTimeout(() => {
      failure = new Error(
        "Penyimpanan tidak merespons. Perubahan belum dinyatakan tersimpan.",
      );
      try {
        tx.abort();
      } catch {
        /* A completed transaction has already scheduled its completion event. */
      }
    }, TIMEOUT_MS);
    tx.oncomplete = () => {
      clearTimeout(timer);
      resolve(value);
    };
    tx.onabort = () => {
      clearTimeout(timer);
      reject(
        failure ||
          tx.error ||
          new Error("Penyimpanan dibatalkan. Perubahan belum tersimpan."),
      );
    };
    try {
      operation(tx, (result) => {
        value = result;
      });
    } catch (error) {
      failure = error;
      tx.abort();
    }
  });
}

function imageBlob(dataUrl: string): Blob {
  const match =
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(
      dataUrl,
    );
  if (!match || !match[2])
    throw new Error("Sumber foto tidak valid. Pilih kembali foto aslinya.");
  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: match[1] });
}

async function imageDataUrl(blob: Blob): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(blob.type) || !blob.size)
    throw new Error("Foto tersimpan tidak dapat dipulihkan.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

function isStoredDraft(value: unknown, key: string): value is StoredDraft {
  if (!value || typeof value !== "object") return false;
  const record = value as StoredDraft;
  return (
    record.schemaVersion === 1 &&
    isDraftStructure(record.value) &&
    record.value.demo === (key === DEMO_KEY) &&
    !!record.imageKeys &&
    typeof record.imageKeys === "object" &&
    !Array.isArray(record.imageKeys) &&
    Object.keys(record.imageKeys).every((kind) =>
      kinds.includes(kind as Kind),
    ) &&
    kinds.every(
      (kind) =>
        record.value.sources[kind].image === undefined &&
        (record.imageKeys[kind] === undefined ||
          record.imageKeys[kind] === `${key}:${kind}`),
    )
  );
}

async function writeDraft(draft: Draft): Promise<void> {
  const key = draft.demo ? DEMO_KEY : DRAFT_KEY;
  const value = structuredClone(draft);
  const imageKeys: StoredDraft["imageKeys"] = {};
  const images: Partial<Record<Kind, Blob>> = {};
  for (const kind of kinds) {
    const { image, ...metadata } = value.sources[kind];
    value.sources[kind] = metadata;
    if (image) {
      images[kind] = imageBlob(image);
      imageKeys[kind] = `${key}:${kind}`;
    }
  }
  const db = await openDatabase();
  try {
    await transaction<void>(db, "readwrite", (tx) => {
      for (const kind of kinds) {
        const imageKey = `${key}:${kind}`;
        if (images[kind]) tx.objectStore("images").put(images[kind], imageKey);
        else tx.objectStore("images").delete(imageKey);
      }
      tx.objectStore("drafts").put(
        { schemaVersion: 1, value, imageKeys } satisfies StoredDraft,
        key,
      );
    });
  } finally {
    db.close();
  }
}

export function saveDraft(draft: Draft): Promise<void> {
  if (!isDraft(draft))
    return Promise.reject(
      new Error(
        "Format draf tidak valid. Data sebelumnya tetap dipertahankan.",
      ),
    );
  const snapshot = structuredClone(draft);
  return serialized(() => writeDraft(snapshot));
}

async function readIndexedDraft(key: string): Promise<LoadedDraft> {
  const db = await openDatabase();
  try {
    const loaded = await transaction<{
      record: unknown;
      images: Partial<Record<Kind, unknown>>;
    }>(db, "readonly", (tx, done) => {
      const request = tx.objectStore("drafts").get(key);
      request.onsuccess = () => {
        const record: unknown = request.result;
        const images: Partial<Record<Kind, unknown>> = {};
        done({ record, images });
        if (!isStoredDraft(record, key)) return;
        for (const kind of kinds) {
          if (!record.imageKeys[kind]) continue;
          const image = tx.objectStore("images").get(record.imageKeys[kind]!);
          image.onsuccess = () => {
            images[kind] = image.result;
          };
        }
      };
    });
    if (loaded.record === undefined)
      return { value: null, warning: "", exists: false, persisted: false };
    if (!isStoredDraft(loaded.record, key))
      throw new Error(
        "Format draf IndexedDB tidak sesuai. Data tersimpan tetap dipertahankan.",
      );
    const value = loaded.record.value;
    for (const kind of kinds) {
      if (!loaded.record.imageKeys[kind]) continue;
      const image = loaded.images[kind];
      if (!(image instanceof Blob))
        throw new Error(
          "Sumber foto tersimpan belum dapat dipulihkan. Data lama tetap dipertahankan.",
        );
      value.sources[kind].image = await imageDataUrl(image);
    }
    const documents = sanitizeDocumentConfirmations(value);
    const repaired = sanitizeMatches(documents.draft);
    return {
      value: repaired.draft,
      warning: documents.changed
        ? "Jenis dokumen tersimpan perlu ditinjau ulang. Konfirmasi dibatalkan; sumber, hasil AI, dan riwayat tetap dipertahankan."
        : repaired.issues.length
          ? "Pasangan ikan tersimpan perlu ditinjau ulang. Konfirmasi yang tidak valid dibatalkan; sumber dan penyesuaian lama tetap dipertahankan."
          : "",
      exists: true,
      // A repaired view is not reported as committed until an explicit successful save.
      persisted: !documents.changed && !repaired.changed,
    };
  } finally {
    db.close();
  }
}

export function loadDraft(key = DRAFT_KEY): Promise<LoadedDraft> {
  return serialized(async () => {
    try {
      const stored = await readIndexedDraft(key);
      if (stored.exists) return stored;
    } catch (error) {
      const legacy = readDraft(key);
      const value =
        legacy.value?.demo === (key === DEMO_KEY) ? legacy.value : null;
      return {
        value,
        exists: true,
        persisted: false,
        warning: `${error instanceof Error ? error.message : "IndexedDB belum dapat dibuka."} ${value ? "Salinan lama dipulihkan. Perubahan baru belum dinyatakan tersimpan." : legacy.warning || "Coba buka lagi setelah memeriksa izin penyimpanan browser."}`,
      };
    }
    const legacy = readDraft(key);
    if (!legacy.value) return { ...legacy, persisted: false };
    if (legacy.value.demo !== (key === DEMO_KEY))
      return {
        value: null,
        exists: true,
        persisted: false,
        warning:
          "Jenis draf lama tidak sesuai penyimpanannya. Data lama tetap dipertahankan.",
      };
    try {
      await writeDraft(legacy.value);
      return {
        ...legacy,
        persisted: true,
        warning: [
          legacy.warning,
          "Draf lama dipulihkan ke IndexedDB. Salinan penyimpanan lama tetap tersedia.",
        ]
          .filter(Boolean)
          .join(" "),
      };
    } catch {
      return {
        ...legacy,
        persisted: false,
        warning:
          "Draf lama dipulihkan, tetapi migrasi ke IndexedDB belum berhasil. Salinan lama tetap tersedia. Coba simpan lagi.",
      };
    }
  });
}
