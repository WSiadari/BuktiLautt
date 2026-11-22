export type DocumentType = "weighing" | "receipt";
export type VisionRequest = {
  documentType: DocumentType;
  requestId: string;
  sourceId: string;
  sourceRevision: string;
  imageDataUrl?: string;
  text?: string;
};
export type RawItem = {
  itemName: string | null;
  weightValue: string | null;
  weightUnit: string | null;
  unitPrice: string | null;
  subtotal: string | null;
  discount: string | null;
  rawText: string | null;
  issues: string[];
  priceBasis?: {
    kind: "column_header";
    text: string;
    columnAssociation: "clear" | "uncertain";
  } | null;
};
export type ActualDocumentType = "weighing" | "sales_receipt" | "unknown";
export type Readability = "readable" | "partial" | "unreadable";
type RawExtractionFields = {
  items: RawItem[];
  extractedDate: string | null;
  documentTotal: string | null;
  deduction: string | null;
  charges: string | null;
  notes: string | null;
  warnings: string[];
};
export type LegacyRawExtraction = RawExtractionFields & { documentType: DocumentType; schemaVersion?: never };
export type ClassifiedRawExtraction = RawExtractionFields & {
  schemaVersion: 2;
  documentType: ActualDocumentType;
  classification: { certainty: "clear" | "uncertain"; evidence: string[] };
  readability: Readability;
};
export type RawExtraction = LegacyRawExtraction | ClassifiedRawExtraction;
export type NormalizedItem = {
  itemName: string | null;
  weightKg: number | null;
  unitPriceRupiah: number | null;
  subtotalRupiah: number | null;
  discountRupiah: number | null;
  issues: string[];
  unitPriceBasis?: "row_explicit" | "column_header" | "unknown";
  unitPriceReason?: string;
};
export type VisionResult = {
  schemaVersion?: 2;
  documentType: DocumentType;
  requestId: string;
  sourceId: string;
  sourceRevision: string;
  requiresReview: true;
  raw: RawExtraction;
  normalized: {
    items: NormalizedItem[];
    documentTotalRupiah: number | null;
    deductionRupiah: number | null;
    chargesRupiah: number | null;
  };
  warnings: string[];
  provider: { name: "gemini"; model: string };
};
export type VisionErrorCode =
  | "INVALID_INPUT" | "INVALID_IMAGE" | "TOO_LARGE" | "NOT_CONFIGURED"
  | "FORBIDDEN" | "RATE_LIMITED" | "BUSY" | "TIMEOUT" | "CANCELLED"
  | "PROVIDER_ERROR" | "INVALID_OUTPUT" | "EMPTY_RESULT" | "NETWORK_ERROR";
export type VisionErrorBody = {
  error: { code: VisionErrorCode; message: string; retryable: boolean; retryAfterSeconds?: number };
};
export type VisionStatus = {
  available: boolean;
  provider: "gemini";
  model: string;
  reason: string | null;
  maxImageBytes: number;
  maxTextCharacters: number;
  timeoutMs: number;
};

const nullableText = { type: ["string", "null"] };
const stringList = { type: "array", items: { type: "string" } };
const itemProperties = {
  itemName: nullableText, weightValue: nullableText, weightUnit: nullableText,
  unitPrice: nullableText, subtotal: nullableText, discount: nullableText,
  rawText: nullableText, issues: stringList,
  priceBasis: {
    type: ["object", "null"],
    properties: {
      kind: { type: "string", enum: ["column_header"] },
      text: { type: "string" },
      columnAssociation: { type: "string", enum: ["clear", "uncertain"] },
    },
    required: ["kind", "text", "columnAssociation"], additionalProperties: false,
  },
};
const requiredItemKeys = Object.keys(itemProperties).filter(key => key !== "priceBasis");
const extractionFields = {
  items: { type: "array", items: { type: "object", properties: itemProperties, required: requiredItemKeys, additionalProperties: false } },
  extractedDate: nullableText, documentTotal: nullableText, deduction: nullableText,
  charges: nullableText, notes: nullableText, warnings: stringList,
};
const legacyProperties = { documentType: { type: "string", enum: ["weighing", "receipt"] }, ...extractionFields };
const extractionProperties = {
  schemaVersion: { type: "integer", enum: [2] },
  documentType: { type: "string", enum: ["weighing", "sales_receipt", "unknown"] },
  classification: {
    type: "object",
    properties: { certainty: { type: "string", enum: ["clear", "uncertain"] }, evidence: stringList },
    required: ["certainty", "evidence"], additionalProperties: false,
  },
  readability: { type: "string", enum: ["readable", "partial", "unreadable"] },
  ...extractionFields,
};
export const EXTRACTION_JSON_SCHEMA = {
  type: "object", properties: extractionProperties,
  required: Object.keys(extractionProperties), additionalProperties: false,
};

function exactObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function textField(value: unknown, limit: number): value is string | null {
  return value === null || (typeof value === "string" && value.length <= limit);
}
function textList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 40 && value.every(item => typeof item === "string" && item.length <= 500);
}
export function validateRawExtraction(value: unknown, documentType: DocumentType): RawExtraction {
  const version2 = !!value && typeof value === "object" && "schemaVersion" in value;
  if (!exactObject(value, Object.keys(version2 ? extractionProperties : legacyProperties)) ||
      (!version2 && value.documentType !== documentType) ||
      !Array.isArray(value.items) || value.items.length > 100 || !textList(value.warnings)) {
    throw new Error("INVALID_OUTPUT");
  }
  if (version2) {
    if (value.schemaVersion !== 2 || !["weighing", "sales_receipt", "unknown"].includes(String(value.documentType)) ||
        !["readable", "partial", "unreadable"].includes(String(value.readability)) ||
        !exactObject(value.classification, ["certainty", "evidence"]) ||
        !["clear", "uncertain"].includes(String(value.classification.certainty)) || !textList(value.classification.evidence)) throw new Error("INVALID_OUTPUT");
    if (value.documentType === "unknown" && value.classification.certainty !== "uncertain") throw new Error("INVALID_OUTPUT");
    if (value.classification.certainty === "clear" && !(value.classification.evidence as string[]).some(text => text.trim())) throw new Error("INVALID_OUTPUT");
    if (value.readability === "unreadable" && value.items.length) throw new Error("INVALID_OUTPUT");
  }
  for (const key of ["extractedDate", "documentTotal", "deduction", "charges", "notes"]) {
    if (!textField(value[key], key === "notes" ? 2000 : 250)) throw new Error("INVALID_OUTPUT");
  }
  for (const item of value.items) {
    const keys = [...requiredItemKeys, ...(item && typeof item === "object" && Object.hasOwn(item, "priceBasis") ? ["priceBasis"] : [])];
    if (!exactObject(item, keys) || !textList(item.issues)) throw new Error("INVALID_OUTPUT");
    for (const key of ["itemName", "weightValue", "weightUnit", "unitPrice", "subtotal", "discount", "rawText"]) {
      if (!textField(item[key], key === "rawText" ? 2000 : 250)) throw new Error("INVALID_OUTPUT");
    }
    if (Object.hasOwn(item, "priceBasis") && item.priceBasis !== null) {
      const basis = item.priceBasis;
      if (!exactObject(basis, ["kind", "text", "columnAssociation"]) ||
          basis.kind !== "column_header" || typeof basis.text !== "string" ||
          !basis.text.trim() || basis.text.length > 250 ||
          !["clear", "uncertain"].includes(String(basis.columnAssociation))) throw new Error("INVALID_OUTPUT");
    }
  }
  return value as RawExtraction;
}
export function isClassifiedExtraction(raw: RawExtraction): raw is ClassifiedRawExtraction {
  return raw.schemaVersion === 2;
}
export function validateClassifiedExtraction(value: unknown): ClassifiedRawExtraction {
  const raw = validateRawExtraction(value, "weighing");
  if (!isClassifiedExtraction(raw)) throw new Error("INVALID_OUTPUT");
  return raw;
}
export type DocumentCompatibility = {
  canImport: boolean;
  reason: "compatible" | "mismatch" | "unknown" | "legacy" | "unreadable";
  actualType: ActualDocumentType | null;
  readability: Readability | null;
  message: string;
};
export function documentCompatibility(result: VisionResult, expected: DocumentType): DocumentCompatibility {
  const raw = result.raw;
  if (result.documentType !== expected) return { canImport: false, reason: "mismatch", actualType: isClassifiedExtraction(raw) ? raw.documentType : null, readability: isClassifiedExtraction(raw) ? raw.readability : null, message: "Pembacaan ini diminta untuk langkah berbeda. Baca sumber pada langkah yang sesuai sebelum melanjutkan." };
  if (!isClassifiedExtraction(raw)) return { canImport: false, reason: "legacy", actualType: null, readability: null, message: "Pembacaan lama belum memeriksa jenis dokumen secara terpisah. Baca ulang atau ganti sumber sebelum melanjutkan. Data lama tetap disimpan." };
  const base = { actualType: raw.documentType, readability: raw.readability };
  const expectedActual = expected === "receipt" ? "sales_receipt" : "weighing";
  if (raw.documentType !== "unknown" && raw.classification.certainty === "clear" && raw.classification.evidence.some(text => text.trim()) && raw.documentType !== expectedActual) return { ...base, canImport: false, reason: "mismatch", message: expected === "weighing" ? "Dokumen ini terdeteksi sebagai nota penjualan, bukan catatan timbang. Ganti dokumen untuk langkah ini." : "Dokumen ini terdeteksi sebagai catatan timbang, bukan nota penjualan. Ganti dokumen untuk langkah ini." };
  if (raw.readability === "unreadable") return { ...base, canImport: false, reason: "unreadable", message: "Teks pada dokumen tidak cukup jelas untuk dibaca. Ambil foto yang lebih tajam atau ganti sumber dengan teks yang dapat diperiksa sebelum melanjutkan." };
  if (raw.documentType === "unknown" || raw.classification.certainty !== "clear" || !raw.classification.evidence.some(text => text.trim())) return { ...base, canImport: false, reason: "unknown", message: "Jenis dokumen belum dapat dipastikan. Baca ulang sumber yang lebih jelas atau ganti dokumen sebelum melanjutkan." };
  return { ...base, canImport: true, reason: "compatible", message: raw.readability === "partial" ? "Sebagian data berhasil dibaca. Periksa informasi yang belum diketahui." : "Pembacaan selesai. Periksa semua usulan terhadap sumber sebelum mengonfirmasi." };
}

function numericWeight(value: string, unit: "kg" | "g"): number | null {
  let cleaned = value.trim();
  if (/^\d{1,3}(?:\.\d{3})+,\d{1,3}$/.test(cleaned)) cleaned = cleaned.replaceAll(".", "");
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(cleaned)) {
    if (unit === "kg") return null;
    cleaned = cleaned.replaceAll(".", "");
  }
  if (!/^\d+(?:[.,]\d{1,3})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.replace(",", ".").split(".");
  const scaled = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
  if (unit === "g" && scaled % 1000n !== 0n) return null;
  const grams = unit === "g" ? scaled / 1000n : scaled;
  if (grams <= 0n || grams > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const kilograms = Number(grams) / 1000;
  return BigInt(Math.round(kilograms * 1000)) === grams ? kilograms : null;
}
export function normalizeWeight(value: string | null, unit: string | null): number | null {
  if (value === null || unit === null || value.length > 250) return null;
  const normalizedUnit = unit.trim().toLowerCase();
  if (["kg", "kilogram", "kilograms"].includes(normalizedUnit)) return numericWeight(value, "kg");
  if (["g", "gr", "gram", "grams"].includes(normalizedUnit)) return numericWeight(value, "g");
  return null;
}
export function normalizeRupiah(value: string | null, perKg = false): number | null {
  if (value === null || value.length > 250) return null;
  let cleaned = value.trim().replace(/^rp\.?\s*/i, "");
  if (perKg) cleaned = cleaned.replace(/\s*\/\s*(kg|kilogram)\s*$/i, "");
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,00)?$/.test(cleaned)) return null;
  cleaned = cleaned.replace(/,00$/, "").replaceAll(".", "");
  const amount = Number(cleaned);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}
function normalizeItemPrice(item: RawItem): {
  amount: number | null;
  basis: "row_explicit" | "column_header" | "unknown";
  reason: string;
} {
  const header = item.priceBasis?.text.normalize("NFKC").trim().toLowerCase().replace(/\s+/gu, " ").replace(/\s*\/\s*/gu, "/") ?? "";
  const headerPerKg = /^(?:harga(?: satuan)?(?: \(rp\))?(?:\/| per )(?:kg|kilogram)(?: \(rp\))?|rp\/(?:kg|kilogram))$/u.test(header);
  const conflictingHeader = !!header && /(?:\/|\bper\b)/u.test(header) && !headerPerKg;
  if (conflictingHeader) {
    return { amount: null, basis: "unknown", reason: "Satuan header harga ambigu atau bertentangan. Periksa kolom dan satuan baris." };
  }
  if (/\/\s*(kg|kilogram)\s*$/i.test(item.unitPrice || "")) {
    const amount = normalizeRupiah(item.unitPrice, true);
    return { amount, basis: amount === null ? "unknown" : "row_explicit", reason: amount === null ? "Harga pada baris belum dapat dibaca sebagai Rupiah per kg." : "Satuan per kg tertulis langsung pada harga baris." };
  }
  if (headerPerKg && item.priceBasis?.columnAssociation === "clear") {
    const amount = normalizeRupiah(item.unitPrice);
    return { amount, basis: amount === null ? "unknown" : "column_header", reason: amount === null ? "Nilai harga atau satuan baris belum jelas meskipun header menyebut per kg." : `Harga per kg berasal dari kolom dengan header “${item.priceBasis.text}” dan hubungan kolom yang jelas.` };
  }
  return { amount: null, basis: "unknown", reason: "Satuan harga per kg atau hubungan nilai dengan header belum dapat dipastikan." };
}
export function buildVisionResult(raw: RawExtraction, request: VisionRequest, model: string): VisionResult {
  const items = raw.items.map(item => {
    const itemName = item.itemName?.trim() || null;
    const weightKg = normalizeWeight(item.weightValue, item.weightUnit);
    const price = normalizeItemPrice(item);
    const unitPriceRupiah = price.amount;
    const subtotalRupiah = normalizeRupiah(item.subtotal);
    const discountRupiah = normalizeRupiah(item.discount);
    const issues = [...item.issues];
    if (!itemName) issues.push("Nama item belum diketahui.");
    if (weightKg === null) issues.push("Berat atau satuan belum diketahui, ambigu, atau di luar presisi yang didukung. Periksa sumber.");
    if (item.unitPrice !== null && unitPriceRupiah === null) issues.push("Harga belum dapat dinormalisasi sebagai Rupiah per kg.");
    if (item.subtotal !== null && subtotalRupiah === null) issues.push("Nilai baris belum dapat dinormalisasi sebagai Rupiah bulat.");
    if (item.discount !== null && discountRupiah === null) issues.push("Potongan baris belum dapat dinormalisasi.");
    return {
      itemName, weightKg, unitPriceRupiah, subtotalRupiah, discountRupiah, issues,
      ...(Object.hasOwn(item, "priceBasis") ? { unitPriceBasis: price.basis, unitPriceReason: price.reason } : {}),
    };
  });
  const amounts = {
    documentTotalRupiah: normalizeRupiah(raw.documentTotal),
    deductionRupiah: normalizeRupiah(raw.deduction), chargesRupiah: normalizeRupiah(raw.charges),
  };
  const warnings = [...raw.warnings];
  for (const [rawKey, normalizedKey] of [["documentTotal", "documentTotalRupiah"], ["deduction", "deductionRupiah"], ["charges", "chargesRupiah"]] as const) {
    if (raw[rawKey] !== null && amounts[normalizedKey] === null) warnings.push(`Nilai ${rawKey} belum dapat dinormalisasi. Periksa teks asli.`);
  }
  return {
    ...(isClassifiedExtraction(raw) ? { schemaVersion: 2 as const } : {}),
    documentType: request.documentType, requestId: request.requestId, sourceId: request.sourceId,
    sourceRevision: request.sourceRevision, requiresReview: true, raw,
    normalized: { items, ...amounts }, warnings, provider: { name: "gemini", model },
  };
}

export function validateVisionResult(value: unknown, request: VisionRequest): VisionResult {
  const version2 = !!value && typeof value === "object" && "schemaVersion" in value;
  if (!exactObject(value, [...(version2 ? ["schemaVersion"] : []), "documentType", "requestId", "sourceId", "sourceRevision", "requiresReview", "raw", "normalized", "warnings", "provider"]) ||
      (version2 && value.schemaVersion !== 2) ||
      value.documentType !== request.documentType || value.requestId !== request.requestId || value.sourceId !== request.sourceId ||
      value.sourceRevision !== request.sourceRevision || value.requiresReview !== true ||
      !exactObject(value.provider, ["name", "model"]) || value.provider.name !== "gemini" ||
      typeof value.provider.model !== "string" || value.provider.model.length > 100) throw new Error("INVALID_OUTPUT");
  const raw = validateRawExtraction(value.raw, request.documentType);
  if (version2 !== isClassifiedExtraction(raw)) throw new Error("INVALID_OUTPUT");
  const expected = buildVisionResult(raw, request, value.provider.model);
  // Rebuild normalized values at the browser boundary instead of trusting response arithmetic.
  if (JSON.stringify(value.normalized) !== JSON.stringify(expected.normalized) ||
      JSON.stringify(value.warnings) !== JSON.stringify(expected.warnings)) throw new Error("INVALID_OUTPUT");
  return expected;
}
