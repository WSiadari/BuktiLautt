import test from "node:test";
import assert from "node:assert/strict";
import { extractVision, getVisionStatus, visionClientTimeout, VisionClientError } from "./vision.ts";
import { readConfig } from "../../server/config.ts";
import { buildVisionResult } from "../vision/contract.ts";
import { classifiedFixture as rawFixture, rawFixture as legacyFixture, requestFixture } from "../../server/test-fixtures.ts";

test("client validates result identity and preserves cancellation at its normal entry point", async () => {
  const originalFetch = globalThis.fetch;
  const request = requestFixture();
  try {
    globalThis.fetch = (async (_url, init) => {
      assert.equal(_url, "/api/vision");
      assert.equal(new Headers(init?.headers).get("X-BuktiLaut-Vision"), "1");
      return Response.json(buildVisionResult(rawFixture(), request, "gemini-3.5-flash-lite"));
    }) as typeof fetch;
    assert.equal((await extractVision(request, undefined, 30_000)).requiresReview, true);
    globalThis.fetch = (async () => Response.json(buildVisionResult(legacyFixture(), request, "old-model"))) as typeof fetch;
    await assert.rejects(extractVision(request, undefined, 30_000), { code: "INVALID_OUTPUT" });
    globalThis.fetch = (async () => Response.json(buildVisionResult(rawFixture(), { ...request, sourceRevision: "stale" }, "gemini-3.5-flash-lite"))) as typeof fetch;
    await assert.rejects(extractVision(request, undefined, 30_000), { code: "INVALID_OUTPUT" });
    globalThis.fetch = (async (_url, init) => {
      if (init?.signal?.aborted) throw new DOMException("Abort", "AbortError");
      throw new Error("unexpected");
    }) as typeof fetch;
    const controller = new AbortController(); controller.abort();
    await assert.rejects(extractVision(request, controller.signal), { code: "CANCELLED" });
  } finally { globalThis.fetch = originalFetch; }
});
test("client maps safe typed errors instead of echoing raw server detail", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => Response.json({ error: { code: "RATE_LIMITED", message: "SECRET", retryable: true, retryAfterSeconds: 30 } }, { status: 429 })) as typeof fetch;
    await assert.rejects(extractVision(requestFixture(), undefined, 30_000), error => {
      assert.ok(error instanceof VisionClientError);
      assert.equal(error.code, "RATE_LIMITED"); assert.equal(error.retryAfterSeconds, 30);
      assert.doesNotMatch(error.message, /SECRET/);
      return true;
    });
  } finally { globalThis.fetch = originalFetch; }
});
test("client derives its deadline from server status with bounded grace instead of fixed 40 seconds", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  try {
    globalThis.fetch = (async url => {
      calls.push(String(url));
      return String(url).endsWith("/status") ? Response.json({ available: true, provider: "gemini", model: "mock-model", reason: null, maxImageBytes: 4 * 1024 * 1024, maxTextCharacters: 20_000, timeoutMs: 90_000 })
        : Response.json(buildVisionResult(rawFixture(), requestFixture(), "mock-model"));
    }) as typeof fetch;
    assert.equal((await getVisionStatus()).timeoutMs, 90_000);
    calls.length = 0;
    await extractVision(requestFixture());
    assert.deepEqual(calls, ["/api/vision/status", "/api/vision"]);
    assert.equal(visionClientTimeout(90_000), 100_000);
    assert.equal(visionClientTimeout(180_000), 190_000);
    assert.throws(() => visionClientTimeout(180_001));
    assert.equal(readConfig({ VISION_TIMEOUT_MS: "90000" }).timeoutMs, 90_000);
    assert.throws(() => readConfig({ VISION_TIMEOUT_MS: "180001" }));
  } finally { globalThis.fetch = originalFetch; }
});
