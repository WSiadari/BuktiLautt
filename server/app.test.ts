import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createVisionServer } from "./app.ts";
import { extractWithGemini } from "./gemini.ts";
import { readConfig } from "./config.ts";
import { validateInput, MAX_IMAGE_BYTES } from "./input.ts";
import { classifiedFixture as rawFixture, requestFixture } from "./test-fixtures.ts";

const config = readConfig({ VISION_ENABLED: "true", VISION_DATA_PROCESSING_ACKNOWLEDGED: "true", GEMINI_API_KEY: "test-only", VISION_REQUESTS_PER_MINUTE: "30" });
const origin = "http://127.0.0.1:5173";
async function withServer(options: Parameters<typeof createVisionServer>[0], run: (base: string) => Promise<void>) {
  const server = createVisionServer(options);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
function post(base: string, body: unknown = requestFixture(), headers: Record<string, string> = {}) {
  return fetch(base + "/api/vision", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "X-BuktiLaut-Vision": "1", ...headers }, body: JSON.stringify(body) });
}
test("disabled, missing-key and missing-privacy configurations never call provider", async () => {
  let calls = 0;
  for (const unavailableConfig of [
    readConfig({}),
    readConfig({ VISION_ENABLED: "true", VISION_DATA_PROCESSING_ACKNOWLEDGED: "true" }),
    readConfig({ VISION_ENABLED: "true", GEMINI_API_KEY: "test-only" }),
  ]) {
    await withServer({ config: unavailableConfig, extract: async () => { calls++; throw new Error("must not call"); } }, async base => {
      const status = await (await fetch(base + "/api/vision/status")).json();
      assert.equal(status.available, false);
      const response = await post(base);
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error.code, "NOT_CONFIGURED");
      assert.equal(calls, 0);
    });
  }
});
test("HTTP returns successful mismatch/unreadable evidence and exposes configured longer timeout", async () => {
  const longer = { ...config, timeoutMs: 90_000 };
  await withServer({ config: longer, extract: async input => ({ raw: input.request.requestId === "unreadable" ? { ...rawFixture("unknown"), readability: "unreadable", items: [] } : rawFixture("sales_receipt"), model: config.model }) }, async base => {
    assert.equal((await (await fetch(base + "/api/vision/status")).json()).timeoutMs, 90_000);
    const mismatch = await post(base, { ...requestFixture(), documentType: "weighing" });
    assert.equal(mismatch.status, 200);
    const body = await mismatch.json();
    assert.equal(body.documentType, "weighing");
    assert.equal(body.raw.documentType, "sales_receipt");
    assert.equal(body.schemaVersion, 2);
    const unreadable = await post(base, { ...requestFixture(), requestId: "unreadable" });
    assert.equal(unreadable.status, 200);
    assert.deepEqual((await unreadable.json()).normalized.items, []);
  });
});
test("HTTP Vision completes after a transient Gemini 503 using the same source", async () => {
  let providerCalls = 0;
  const extract = (
    input: Parameters<typeof extractWithGemini>[0],
    settings: Parameters<typeof extractWithGemini>[1],
    signal: AbortSignal,
  ) => extractWithGemini(input, settings, signal, (async () => {
    providerCalls++;
    return providerCalls === 1
      ? new Response(null, { status: 503 })
      : Response.json({
          modelVersion: settings.model,
          candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(rawFixture()) }] } }],
        });
  }) as typeof fetch);
  await withServer({ config, extract }, async base => {
    const response = await post(base);
    assert.equal(response.status, 200);
    const value = await response.json();
    assert.equal(value.normalized.items[0].itemName, "Teri");
    assert.equal(value.sourceId, "test-source");
  });
  assert.equal(providerCalls, 2);
});
test("image validation performs actual decode and rejects mismatched, corrupt, empty or oversized inputs", async () => {
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "white" } }).png().toBuffer();
  const request = { ...requestFixture(), text: undefined };
  delete request.text;
  const valid = await validateInput({ ...request, imageDataUrl: `data:image/png;base64,${png.toString("base64")}` });
  assert.equal(valid.image?.mimeType, "image/png");
  for (const data of ["data:image/png;base64,", `data:image/jpeg;base64,${png.toString("base64")}`, `data:image/png;base64,${png.subarray(0, 30).toString("base64")}`, "https://private.example/document.png", "data:image/png;base64,R0lGODlh"]) {
    await assert.rejects(validateInput({ ...request, imageDataUrl: data }), { code: "INVALID_IMAGE" });
  }
  await assert.rejects(validateInput({ ...request, imageDataUrl: `data:image/png;base64,${Buffer.alloc(MAX_IMAGE_BYTES + 1).toString("base64")}` }), { code: "TOO_LARGE" });
  await assert.rejects(validateInput({ ...requestFixture(), imageDataUrl: "bad" }), { code: "INVALID_INPUT" });
});
test("HTTP boundary rejects foreign origin, missing custom header, extra URLs and oversized body", async () => {
  let calls = 0;
  await withServer({ config, extract: async () => { calls++; return { raw: rawFixture(), model: config.model }; } }, async base => {
    assert.equal((await post(base, requestFixture(), { Origin: "https://foreign.example" })).status, 403);
    assert.equal((await post(base, requestFixture(), { "X-BuktiLaut-Vision": "" })).status, 403);
    assert.equal((await post(base, { ...requestFixture(), providerUrl: "http://internal" })).status, 400);
    assert.equal((await post(base, { ...requestFixture(), text: "x".repeat(21_000) })).status, 413);
    assert.equal(calls, 0);
    const response = await post(base);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.requiresReview, true);
    assert.equal(body.sourceId, "test-source");
    assert.equal(body.normalized.chargesRupiah, null);
    assert.equal(calls, 1);
  });
});
test("server bounds concurrency and timeout without provider payload in public errors", async () => {
  const limited = { ...config, maxConcurrency: 1, timeoutMs: 40 };
  let started!: () => void;
  const start = new Promise<void>(resolve => { started = resolve; });
  await withServer({ config: limited, extract: async (_input, _config, signal) => {
    started();
    await new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("secret")), { once: true }));
    return { raw: rawFixture(), model: config.model };
  } }, async base => {
    const first = post(base);
    await start;
    assert.equal((await post(base, { ...requestFixture(), requestId: "other" })).status, 503);
    const response = await first;
    const body = await response.json();
    assert.equal(response.status, 504);
    assert.equal(body.error.code, "TIMEOUT");
    assert.doesNotMatch(JSON.stringify(body), /secret/);
  });
});
test("daily budget stops new provider calls and peer disconnect aborts in-flight processing", async () => {
  let calls = 0;
  await withServer({ config: { ...config, requestsPerDay: 1 }, extract: async () => { calls++; return { raw: rawFixture(), model: config.model }; } }, async base => {
    assert.equal((await post(base)).status, 200);
    assert.equal((await post(base, { ...requestFixture(), requestId: "next" })).status, 429);
    assert.equal(calls, 1);
  });
  let started!: () => void;
  let aborted!: () => void;
  const start = new Promise<void>(resolve => { started = resolve; });
  const abort = new Promise<void>(resolve => { aborted = resolve; });
  await withServer({ config, extract: async (_input, _config, signal) => {
    started();
    await new Promise((_resolve, reject) => signal.addEventListener("abort", () => { aborted(); reject(new Error("disconnected")); }, { once: true }));
    return { raw: rawFixture(), model: config.model };
  } }, async base => {
    const controller = new AbortController();
    const pending = fetch(base + "/api/vision", { method: "POST", signal: controller.signal, headers: { Origin: origin, "Content-Type": "application/json", "X-BuktiLaut-Vision": "1" }, body: JSON.stringify(requestFixture()) });
    await start;
    controller.abort();
    await assert.rejects(pending);
    await abort;
  });
});
