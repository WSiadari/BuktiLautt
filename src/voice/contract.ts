import {
  buildVisionResult,
  normalizeWeight,
  validateClassifiedExtraction,
  validateVisionResult,
  EXTRACTION_JSON_SCHEMA,
  type ClassifiedRawExtraction,
  type VisionErrorCode,
  type VisionResult,
} from "../vision/contract.ts";

export const MAX_VOICE_SECONDS = 30;
export const MIN_VOICE_SECONDS = 0.25;
export const MAX_VOICE_BYTES = 2 * 1024 * 1024;
export const VOICE_SAMPLE_RATE = 16_000;
export type VoiceRequest = {
  requestId: string;
  sourceId: string;
  sourceRevision: string;
  audioDataUrl: string;
};
export type UnresolvedVoiceField = {
  itemIndex: number;
  field: "name" | "weight" | "unit";
  reason: string;
};
export type VoiceResult = {
  transcript: string;
  vision: VisionResult;
  unresolvedFields: UnresolvedVoiceField[];
};
export type VoiceErrorCode =
  VisionErrorCode | "INVALID_AUDIO" | "UNSUPPORTED_AUDIO" | "AUDIO_TOO_LONG";
export type VoiceStatus = {
  available: boolean;
  provider: "gemini";
  model: string;
  reason: string | null;
  timeoutMs: number;
  acceptedMimeTypes: ["audio/wav"];
  maxAudioBytes: number;
  maxDurationSeconds: number;
};
export type RawVoiceOutput = {
  transcript: string;
  extraction: ClassifiedRawExtraction;
  unresolvedFields: UnresolvedVoiceField[];
};
export const VOICE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    transcript: { type: "string" },
    extraction: EXTRACTION_JSON_SCHEMA,
    unresolvedFields: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          itemIndex: { type: "integer" },
          field: { type: "string", enum: ["name", "weight", "unit"] },
          reason: { type: "string" },
        },
        required: ["itemIndex", "field", "reason"],
      },
    },
  },
  required: ["transcript", "extraction", "unresolvedFields"],
};
function exactObject(
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
export function validateRawVoiceOutput(value: unknown): RawVoiceOutput {
  if (
    !exactObject(value, ["transcript", "extraction", "unresolvedFields"]) ||
    typeof value.transcript !== "string" ||
    value.transcript.length > 4000 ||
    !Array.isArray(value.unresolvedFields) ||
    value.unresolvedFields.length > 300
  )
    throw new Error("INVALID_OUTPUT");
  const extraction = validateClassifiedExtraction(value.extraction);
  if (!value.transcript.trim() && extraction.items.length)
    throw new Error("INVALID_OUTPUT");
  for (const issue of value.unresolvedFields) {
    if (
      !exactObject(issue, ["itemIndex", "field", "reason"]) ||
      !Number.isInteger(issue.itemIndex) ||
      Number(issue.itemIndex) < 0 ||
      Number(issue.itemIndex) >= extraction.items.length ||
      typeof issue.field !== "string" ||
      !["name", "weight", "unit"].includes(issue.field) ||
      typeof issue.reason !== "string" ||
      !issue.reason.trim() ||
      issue.reason.length > 500
    )
      throw new Error("INVALID_OUTPUT");
    const item = extraction.items[Number(issue.itemIndex)];
    if (
      (issue.field === "weight" || issue.field === "unit") &&
      normalizeWeight(item.weightValue, item.weightUnit) !== null
    )
      throw new Error("INVALID_OUTPUT");
  }
  return {
    transcript: value.transcript,
    extraction,
    unresolvedFields: value.unresolvedFields as UnresolvedVoiceField[],
  };
}
export function buildVoiceResult(
  raw: RawVoiceOutput,
  request: VoiceRequest,
  model: string,
): VoiceResult {
  const vision = buildVisionResult(
    raw.extraction,
    {
      documentType: "weighing",
      requestId: request.requestId,
      sourceId: request.sourceId,
      sourceRevision: request.sourceRevision,
      text: raw.transcript,
    },
    model,
  );
  const unresolvedFields = [...raw.unresolvedFields];
  vision.normalized.items.forEach((item, itemIndex) => {
    const source = raw.extraction.items[itemIndex];
    const missing: {
      field: UnresolvedVoiceField["field"];
      missing: boolean;
      reason: string;
    }[] = [
      {
        field: "name",
        missing: item.itemName === null,
        reason: "Nama ikan belum jelas. Periksa transkrip atau isi manual.",
      },
      {
        field: "weight",
        missing: item.weightKg === null,
        reason:
          "Berat belum dapat dipastikan. Periksa transkrip atau isi manual.",
      },
      {
        field: "unit",
        missing: !source.weightUnit?.trim() || item.weightKg === null,
        reason: "Satuan atau presisi berat perlu diperiksa.",
      },
    ];
    for (const issue of missing)
      if (
        issue.missing &&
        !unresolvedFields.some(
          (existing) =>
            existing.itemIndex === itemIndex && existing.field === issue.field,
        )
      )
        unresolvedFields.push({
          itemIndex,
          field: issue.field,
          reason: issue.reason,
        });
  });
  return { transcript: raw.transcript, vision, unresolvedFields };
}
export function validateVoiceResult(
  value: unknown,
  request: VoiceRequest,
): VoiceResult {
  if (
    !exactObject(value, ["transcript", "vision", "unresolvedFields"]) ||
    typeof value.transcript !== "string"
  )
    throw new Error("INVALID_OUTPUT");
  const vision = validateVisionResult(value.vision, {
    documentType: "weighing",
    requestId: request.requestId,
    sourceId: request.sourceId,
    sourceRevision: request.sourceRevision,
    text: value.transcript,
  });
  if (vision.schemaVersion !== 2 || vision.raw.schemaVersion !== 2)
    throw new Error("INVALID_OUTPUT");
  const raw = validateRawVoiceOutput({
    transcript: value.transcript,
    extraction: vision.raw,
    unresolvedFields: value.unresolvedFields,
  });
  return buildVoiceResult(raw, request, vision.provider.model);
}
