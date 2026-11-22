import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeVoiceWav,
  extractVoice,
  getVoiceStatus,
  prepareVoiceAudio,
  VoiceClientError,
} from "./voice.ts";
import { buildVoiceResult } from "../voice/contract.ts";
import {
  voiceRawFixture,
  voiceRequestFixture,
} from "../../server/voice-fixtures.ts";

test("WAV encoder generates bounded canonical audio and rejects invalid sample data", async () => {
  const encoded = encodeVoiceWav(
    Float32Array.from({ length: 16000 }, () => 0.5),
  );
  const view = new DataView(encoded.buffer);
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 32000);
  assert.throws(() => encodeVoiceWav(new Float32Array(16000 * 31)), {
    code: "AUDIO_TOO_LONG",
  });
  assert.throws(() => encodeVoiceWav(new Float32Array(100)), {
    code: "INVALID_AUDIO",
  });
  assert.throws(
    () => encodeVoiceWav(Float32Array.from({ length: 16000 }, () => NaN)),
    { code: "INVALID_AUDIO" },
  );
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(prepareVoiceAudio(new Blob([encoded]), abort.signal), {
    code: "CANCELLED",
  });
});
test("voice client uses protected route and validates response identity with cancellation", async () => {
  const original = globalThis.fetch;
  const input = voiceRequestFixture();
  try {
    globalThis.fetch = (async (url, init) => {
      assert.equal(url, "/api/voice");
      assert.equal(new Headers(init?.headers).get("X-BuktiLaut-Voice"), "1");
      return Response.json(
        buildVoiceResult(voiceRawFixture(), input, "mock-model"),
      );
    }) as typeof fetch;
    assert.equal(
      (await extractVoice(input, undefined, 30_000)).vision.normalized.items
        .length,
      2,
    );
    globalThis.fetch = (async () =>
      Response.json(
        buildVoiceResult(
          voiceRawFixture(),
          { ...input, sourceId: "other-recording" },
          "mock-model",
        ),
      )) as typeof fetch;
    await assert.rejects(extractVoice(input, undefined, 30_000), {
      code: "INVALID_OUTPUT",
    });
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(extractVoice(input, controller.signal), {
      code: "CANCELLED",
    });
  } finally {
    globalThis.fetch = original;
  }
});
test("voice status carries shared configured timeout and server errors do not leak provider details", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      Response.json({
        available: true,
        provider: "gemini",
        model: "mock-model",
        reason: null,
        timeoutMs: 90_000,
        acceptedMimeTypes: ["audio/wav"],
        maxAudioBytes: 2 * 1024 * 1024,
        maxDurationSeconds: 30,
      })) as typeof fetch;
    assert.equal((await getVoiceStatus()).timeoutMs, 90_000);
    globalThis.fetch = (async () =>
      Response.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "SECRET",
            retryable: true,
            retryAfterSeconds: 30,
          },
        },
        { status: 429 },
      )) as typeof fetch;
    await assert.rejects(
      extractVoice(voiceRequestFixture(), undefined, 30_000),
      (error) => {
        assert.ok(error instanceof VoiceClientError);
        assert.equal(error.code, "RATE_LIMITED");
        assert.equal(error.retryAfterSeconds, 30);
        assert.doesNotMatch(error.message, /SECRET/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});
