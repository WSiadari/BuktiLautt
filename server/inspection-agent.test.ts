import test from "node:test";
import assert from "node:assert/strict";
import { createVisionServer } from "./app.ts";
import { readConfig } from "./config.ts";
import { demoDraft } from "../src/data/demo.ts";
import { buildInspectionContext } from "../src/lib/inspectionContext.ts";
import { renderInspectionAnswer } from "../src/agent/contract.ts";
test("agent HTTP authenticates protected origin and validates snapshot without changing source records", async () => {
  let calls = 0;
  const server = createVisionServer({
    config: readConfig({
      VISION_ENABLED: "true",
      VISION_DATA_PROCESSING_ACKNOWLEDGED: "true",
      GEMINI_API_KEY: "synthetic-test",
    }),
    runAgent: async (request) => {
      calls++;
      return renderInspectionAnswer(
        request,
        [{ name: "list_findings" }],
        "mock",
      );
    },
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/api/inspection-agent`;
  try {
    const d = demoDraft();
    const before = structuredClone(d);
    const body = {
      requestId: "http-test",
      question: "Jelaskan",
      snapshot: buildInspectionContext(d),
    };
    const status = await fetch(url + "/status");
    assert.equal((await status.json()).available, true);
    const denied = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(denied.status, 403);
    const good = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://127.0.0.1:5173",
        "X-BuktiLaut-Agent": "1",
      },
      body: JSON.stringify(body),
    });
    assert.equal(good.status, 200);
    assert.equal((await good.json()).clarification, true);
    assert.equal(calls, 1);
    assert.deepEqual(d, before);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
