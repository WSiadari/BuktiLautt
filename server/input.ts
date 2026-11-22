import sharp from "sharp";
import type { VisionRequest } from "../src/vision/contract.ts";
import { VisionError } from "./errors.ts";

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_BODY_BYTES = 6 * 1024 * 1024;
export const MAX_TEXT_CHARACTERS = 20_000;
export type ValidInput = { request: VisionRequest; image?: { mimeType: "image/png"; data: string }; text?: string };

export async function validateInput(body: unknown): Promise<ValidInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid();
  const input = body as Record<string, unknown>;
  const keys = ["documentType", "requestId", "sourceId", "sourceRevision", "imageDataUrl", "text"];
  if (Object.keys(input).some(key => !keys.includes(key)) ||
      !["weighing", "receipt"].includes(String(input.documentType))) throw invalid();
  for (const key of ["requestId", "sourceId", "sourceRevision"]) {
    if (typeof input[key] !== "string" || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(input[key])) throw invalid();
  }
  const hasImage = Object.hasOwn(input, "imageDataUrl");
  const hasText = Object.hasOwn(input, "text");
  if (hasImage === hasText) throw invalid();
  if (hasText) {
    if (typeof input.text !== "string" || !input.text.trim()) throw invalid();
    if (input.text.length > MAX_TEXT_CHARACTERS) throw new VisionError("TOO_LARGE", 413, "Teks melebihi 20.000 karakter.");
    return { request: input as VisionRequest, text: input.text };
  }
  if (typeof input.imageDataUrl !== "string") throw invalid();
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(input.imageDataUrl);
  if (!match || match[2].length % 4 !== 0) throw imageError();
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.toString("base64") !== match[2]) throw imageError();
  if (bytes.length > MAX_IMAGE_BYTES) throw new VisionError("TOO_LARGE", 413, "Ukuran foto melebihi 4 MB.");
  const signature = bytes.subarray(0, 12);
  const format = signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "png"
    : signature[0] === 255 && signature[1] === 216 && signature[2] === 255 ? "jpeg"
    : signature.subarray(0, 4).toString() === "RIFF" && signature.subarray(8, 12).toString() === "WEBP" ? "webp" : null;
  if (!format || match[1] !== `image/${format}`) throw imageError();
  try {
    const decoder = sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning" });
    const metadata = await decoder.metadata();
    if (!metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1 || metadata.format !== format) throw imageError();
    // Full decode rejects damaged payloads; rotate applies EXIF without lossy compression.
    const normalized = await decoder.rotate().png().toBuffer();
    if (normalized.length > 12 * 1024 * 1024) throw new VisionError("TOO_LARGE", 413, "Foto terlalu besar setelah dibuka. Pilih area dokumen yang lebih kecil.");
    return { request: input as VisionRequest, image: { mimeType: "image/png", data: normalized.toString("base64") } };
  } catch (error) {
    if (error instanceof VisionError) throw error;
    throw imageError();
  }
}
function invalid() { return new VisionError("INVALID_INPUT", 400, "Jenis sumber, identitas permintaan, atau isi sumber belum valid."); }
function imageError() { return new VisionError("INVALID_IMAGE", 400, "Foto rusak atau bukan JPG, PNG, atau WebP yang didukung. Pilih foto lain atau isi manual."); }
