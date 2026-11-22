import { classifiedFixture } from "./test-fixtures.ts";
import type { RawVoiceOutput, VoiceRequest } from "../src/voice/contract.ts";
import { encodeVoiceWav } from "../src/services/voice.ts";

export function voiceRawFixture(): RawVoiceOutput {
  const extraction = classifiedFixture("weighing");
  extraction.items = [
    {
      itemName: "Teri",
      weightValue: "12",
      weightUnit: "kg",
      unitPrice: null,
      subtotal: null,
      discount: null,
      rawText: "Teri dua belas kilo",
      issues: [],
    },
    {
      itemName: "Tongkol",
      weightValue: "8",
      weightUnit: "kg",
      unitPrice: null,
      subtotal: null,
      discount: null,
      rawText: "Tongkol delapan kilo",
      issues: [],
    },
  ];
  extraction.documentTotal = null;
  extraction.deduction = null;
  extraction.charges = null;
  extraction.classification.evidence = [
    "Teri dua belas kilo",
    "Tongkol delapan kilo",
  ];
  return {
    transcript: "Teri dua belas kilo, Tongkol delapan kilo.",
    extraction,
    unresolvedFields: [],
  };
}
export function voiceWavFixture(): Uint8Array {
  const samples = Float32Array.from(
    { length: 16000 },
    (_, index) => Math.sin(index / 20) * 0.1,
  );
  return encodeVoiceWav(samples);
}
export function voiceRequestFixture(): VoiceRequest {
  return {
    requestId: "voice-request",
    sourceId: "BL-test:weighing:recording-1",
    sourceRevision: "1",
    audioDataUrl: `data:audio/wav;base64,${Buffer.from(voiceWavFixture()).toString("base64")}`,
  };
}
