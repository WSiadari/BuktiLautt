# Phase 4.4 storage and browser verification

16 November 2026. Storage_ops owns this record. Test data and provider responses in this task are synthetic.

The optional `Draft.voiceExtraction` wrapper contains exactly `result`, `receivedAt`, and `sourceCapturedAt`. Storage validates the nested transcript, Vision result, and unresolved fields with `validateVoiceResult`. The validation request is reconstructed from the stored Vision envelope. Its audio argument is an empty validation placeholder. No clip is added to the draft model or database schema.

Transcripts remain in `Source.text`, while the original Voice result and the existing `rawExtractions.weighing` bridge stay separate from imported or corrected rows. Current source binding and import idempotency continue through the existing domain helpers. Audio playback remains owned by the active Voice UI session.

## Executed checks

- `node --experimental-strip-types --test src/services/storage.test.ts src/services/indexedDb.test.ts src/lib/voiceReview.test.ts` passed 38/38. This includes existing image/legacy recovery cases and eight domain Voice tests.
- New storage cases verify the transcript, selected item indices, corrected weight, raw spoken weight, raw result, and earlier confirmed snapshot after save/read. Repeated imports remain blocked after recovery. Replacing the source makes the previous Voice proposal stale while retaining its historical content.
- A draft containing a clip or audio data URL inside the Voice wrapper/result is rejected. The actual stored record contains no audio data URL. The old Phase 4.3 draft shape still migrates and restores without Voice metadata, preserving its photo, corrections, and previous adjustment values.

## Browser status

The harness is `work/phase44-browser.mjs` at workspace root. It mocks microphone capture and API responses. It uses the provided synthetic WAV as MediaRecorder output, then exercises actual browser decoding and conversion to the server's WAV format. The mock request handler validates the outgoing WAV with the server input validator. It never forwards a provider request.

Integrated browser execution subsequently PASS: see PHASE4_4_VALIDATION.md and outputs/Phase4-4-browser/voice-browser.json at workspace root. Physical-phone capture and live Gemini audio remain pending. This report does not claim transcription accuracy from synthetic mocked responses.
