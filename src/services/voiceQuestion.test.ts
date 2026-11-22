import test from "node:test";
import assert from "node:assert/strict";
import { transcribeQuestion } from "./voiceQuestion.ts";
import { voiceRequestFixture } from "../../server/voice-fixtures.ts";
test("question client sends protected audio only and rejects stale recording identities", async () => {
  const original = globalThis.fetch,
    input = voiceRequestFixture();
  const reply = {
    requestId: input.requestId,
    sourceId: input.sourceId,
    sourceRevision: input.sourceRevision,
    transcript: "Berapa total 11 November 2026?",
  };
  try {
    globalThis.fetch = (async (url, init) => {
      assert.equal(url, "/api/voice/question");
      assert.equal(new Headers(init?.headers).get("X-BuktiLaut-Voice"), "1");
      assert.equal(init?.credentials, "same-origin");
      return Response.json(reply);
    }) as typeof fetch;
    assert.equal(
      (await transcribeQuestion(input, undefined, 90000)).transcript,
      reply.transcript,
    );
    globalThis.fetch = (async () =>
      Response.json({ ...reply, sourceRevision: "stale" })) as typeof fetch;
    await assert.rejects(transcribeQuestion(input, undefined, 30000), {
      code: "INVALID_OUTPUT",
    });
    globalThis.fetch = (async () =>
      Response.json(
        { error: { code: "PROVIDER_ERROR", message: "SECRET" } },
        { status: 502 },
      )) as typeof fetch;
    await assert.rejects(
      transcribeQuestion(input, undefined, 30000),
      (error) => {
        assert.doesNotMatch(String(error), /SECRET/);
        return true;
      },
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(transcribeQuestion(input, controller.signal, 30000), {
      code: "CANCELLED",
    });
  } finally {
    globalThis.fetch = original;
  }
});
