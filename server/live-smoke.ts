import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { readConfig, unavailableReason } from "./config.ts";
import { validateInput } from "./input.ts";
import { extractWithGemini } from "./gemini.ts";
import { safeFailure } from "./errors.ts";

// This script is deliberately separate from npm test and never substitutes mock results.
const args = process.argv.slice(2);
const config = readConfig();
const reason = unavailableReason(config);
if (args[0] !== "--enabled" || reason) {
  console.log(JSON.stringify({ status: "SKIPPED", reason: reason || "Live smoke requires explicit --enabled and prior operator authorization." }));
} else {
  const documentType = args[1];
  const imagePath = args[2];
  if (!["weighing", "receipt"].includes(documentType) || !imagePath) throw new Error("Usage: live-smoke.ts --enabled weighing|receipt path-to-synthetic-image");
  const mime = /\.jpe?g$/i.test(imagePath) ? "image/jpeg" : /\.webp$/i.test(imagePath) ? "image/webp" : "image/png";
  const started = Date.now();
  try {
    const bytes = await readFile(imagePath);
    const input = await validateInput({ documentType, sourceId: randomUUID(), requestId: randomUUID(), sourceRevision: "1", imageDataUrl: `data:${mime};base64,${bytes.toString("base64")}` });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const result = await extractWithGemini(input, config, controller.signal);
      console.log(JSON.stringify({ status: "LIVE_RESPONSE_VALIDATED", provider: "gemini", model: result.model, elapsedMs: Date.now() - started, itemCount: result.raw.items.length, accuracy: "not-scored", cost: "not-measured", requiresReview: true }));
    } finally { clearTimeout(timer); }
  } catch (error) {
    const failure = safeFailure(error);
    console.log(JSON.stringify({ status: "FAILED", code: failure.code, elapsedMs: Date.now() - started }));
    process.exitCode = 1;
  }
}
