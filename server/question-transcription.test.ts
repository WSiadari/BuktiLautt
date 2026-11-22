import test from "node:test";
import assert from "node:assert/strict";
import { transcribeQuestionWithGemini } from "./question-transcription.ts";
import { validateVoiceInput } from "./voice-input.ts";
import { voiceRequestFixture } from "./voice-fixtures.ts";
import { readConfig } from "./config.ts";
const model = (value: unknown) =>
  Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify(value) }] },
      },
    ],
  });
test("free voice question transcribes without fish extraction and echoes recording identity", async () => {
  const input = validateVoiceInput(voiceRequestFixture());
  const result = await transcribeQuestionWithGemini(
    input,
    readConfig({ GEMINI_API_KEY: "MOCK_ONLY" }),
    new AbortController().signal,
    (async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.contents[0].parts[1].inlineData.mimeType, "audio/wav");
      assert.deepEqual(body.generationConfig.responseJsonSchema.required, [
        "transcript",
      ]);
      return model({
        transcript:
          "Berapa total tanggal sebelas November dua ribu dua puluh enam?",
      });
    }) as typeof fetch,
  );
  assert.equal(result.sourceId, input.request.sourceId);
  assert.equal(result.requestId, input.request.requestId);
  assert.match(result.transcript, /Berapa total/);
  assert.equal("vision" in result, false);
});
test("voice question accepts empty observation but rejects extra extracted instructions and invalid text", async () => {
  const input = validateVoiceInput(voiceRequestFixture()),
    config = readConfig({ GEMINI_API_KEY: "MOCK_ONLY" });
  assert.equal(
    (
      await transcribeQuestionWithGemini(
        input,
        config,
        new AbortController().signal,
        (async () => model({ transcript: "" })) as typeof fetch,
      )
    ).transcript,
    "",
  );
  for (const value of [
    { transcript: "hello", extraction: {} },
    { transcript: ["hello"] },
    { transcript: "x".repeat(4001) },
    { transcript: "bad\u0000text" },
  ])
    await assert.rejects(
      transcribeQuestionWithGemini(
        input,
        config,
        new AbortController().signal,
        (async () => model(value)) as typeof fetch,
      ),
      { code: "INVALID_OUTPUT" },
    );
});
