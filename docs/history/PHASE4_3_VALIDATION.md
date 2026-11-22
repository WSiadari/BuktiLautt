# BuktiLaut Phase 4.3: reliability and document validation

Completed 15 November 2026 (Asia/Bangkok). Continued the existing application; no production deployment or live Gemini calls in this phase.

## Completion status

| Status | Result |
|---|---|
| IMPLEMENTED AND TESTED | Independent actual-document schema; compatible workflow gating; source identity binding; domain/import/storage validation; non-destructive old-draft recovery; typed failure/success states; configured timeout; retry protection; printed versus calculated financial values; accurate empty/form counts; report findings. |
| IMPLEMENTED BUT NOT LIVE-VERIFIED | Updated Gemini classification/extraction prompt and schema against the real provider. Historical user observations are documented separately; they do not validate the new prompt. |
| BLOCKED | No implementation blocker remains. A live Gemini smoke test requires explicit operator authorization, which was not given for this phase. |
| NOT COMPLETED | New live field-accuracy measurement, genuine handwriting/field-photo evaluation, and deployment were not performed. No accuracy percentage is claimed. |

## Root causes and changes

1. **Actual type was copied from the requested workflow.** Schema v2 now independently reports `weighing`, `sales_receipt`, or `unknown`, classification evidence/certainty, and readable/partial/unreadable status. Request metadata still uses `weighing`/`receipt`. The extraction prompt is identical across requested workflows; price alone is not a receipt rule. New network responses require v2; legacy raw responses remain readable as historical evidence without invented classification.
2. **A disabled button alone could not protect restored state.** `sourceDocumentGate` is shared by confirmation, deterministic matching and persistence validation. Opposite, unknown, unreadable and legacy-unclassified current results cannot confirm. Old confirmations are revoked in the recovered view; sources, images, rows, snapshots and adjustment history remain. Persisted state is not falsely reported saved until an actual successful save.
3. **A timestamp alone did not establish source ownership.** `extractionBelongsToSource` requires the examination ID, document kind and capture identity in `sourceId`, as well as the matching outer capture stamp. Foreign results cannot enable source confirmation/import or supply a report total. Form revision changes alone do not invalidate an unchanged source.
4. **Empty successful observations were transport errors.** Valid unreadable/partial/empty output is now typed successful evidence. Timeout, cancellation, network/provider errors, rate limits and malformed output retain separate localized handling. No timeout is described as an unreadable photograph. Source images and form edits survive failures.
5. **Timeouts conflicted.** Server `VISION_TIMEOUT_MS` previously capped at35,000 while the browser stopped at40,000. The server now accepts a bounded1..180,000ms configuration and publishes its timeout in status. The client uses that configured budget plus10,000ms transport grace; status lookup has its own10,000ms deadline. Provider cancellation uses the server controller. Node's15,000ms request timeout concerns receipt of the request body, not an active provider response. The existing Vite proxy has no separate shorter explicit timeout. This phase did not alter the actual `.env` or model.
6. **A new request could reimport old AI rows.** Same-request item indices remain idempotent and repeated species rows stay distinct. A successful retry with a new request cannot add another copy while rows from the prior AI request remain. Their corrections remain; the user can review those existing rows or deliberately remove old AI rows before importing a new set. No fuzzy names or silent replacements are used.
7. **Printed totals were insufficiently separated.** Source line subtotals/final total/discount/charges remain AI-read printed evidence. Reviewed fees and deterministic calculated subtotal/final are shown separately. Dataset05 is2kg×25,000=50,000, printed discount1,000 and printed final49,000, with charges unknown. Only an explicit reviewed zero enables a calculated49,000. A reviewed charge2,000 gives calculated51,000 and an open2,000 report finding against printed49,000. Neither value is forced to match. Unknown amounts stay unknown.
8. **The blank manual row looked like an AI item.** Headings now describe actual manual/form rows and actual proposals. Empty AI results do not create invented fish counts. Existing Marine Blue layout and artwork remain.

## Recovery policy and limits

- Wrong/unknown/unreadable/legacy results stay read-only. Use **Ganti dokumen** or reread a clearer/correct source. There is no silent transfer to the other workflow and no manual toggle that overrides a known mismatch.
- Manual fallback after a service failure remains available because no successful contradictory classification was produced. A current classified mismatch stays blocked even if manual fields are edited.
- New classification is still an AI suggestion, not proof of document authenticity or correctness. Application gates deterministically enforce the returned compatible classification and human review; they cannot guarantee the model identified the photograph correctly.
- Existing latest-successful-extraction storage is retained; this is not a full historical log of every provider attempt. Sources, per-row provenance, confirmed snapshots and prior examination adjustments retain their existing roles.
- Strict fish normalization/aliases/arithmetic are unchanged. Different or ambiguous fish names remain blocked; gram and Rupiah arithmetic are unchanged.
- Prompt-injection isolation is retained: document text is untrusted; fixed provider endpoint, no tools/URL access, bounded validated JSON, no auto-import or auto-confirmation. One historical malicious-image test is not universal immunity.

## Verification actually performed

- `npm run typecheck`: PASS frontend and server.
- `npm test`: **97/97 PASS**,0failed,0skipped. Includes provider HTTP mocks, v2/legacy validation, wrong and unknown types, source identity, imported candidates, IDB/localStorage recovery, retries, duplicate names, ambiguous names, money and Strict Matching regression.
- `npm run build`: PASS,49modules. No new dependencies.
- Real local Chromium browser with isolated test profiles and synthetic data: **54 responsive probes** across320,375,390,768,1280,1440px, plus a dedicated390px IDB recovery test. No horizontal overflow in those probes; no console exceptions in the completed runs. This is targeted verification, not a complete accessibility or device certification.
- Upload: used actual local evaluation image files08/10/13, with explicitly mocked receipt classifications to verify application blocking, not to claim real classification accuracy. Converse weighing-in-receipt, unknown, unreadable, partial, timeout, malformed output, explicit manual fallback, source cancellation/late result, retry guard and source preservation covered.
- Full flow: input→AI review→explicit import→correction→source confirmation→strict matching→saved adjustment→report/print. Original values remain separate from adjustments.
- Financial report exported as A4 PDF; both pages rendered and visually inspected. Arithmetic section kept together after print fix. Desktop/mobile screenshots inspected. Mascot not printed in reports.
- Compared against `BuktiLaut-Strict-Matching-Full.zip`: all9 protected public-artwork/motion/dependency files unchanged. No deployment, actual credential change, new mascot or animation.

### Browser evidence

| Run | Evidence relative to workspace root |
|---|---|
| Document validation and recovery | `outputs/Phase4-3-browser/validation/checks.json` |
| Full journey and24 responsive probes | `outputs/Phase4-3-browser/journey/journey.json` |
| Printed versus computed currency | `outputs/Phase4-3-browser/financial/checks.json` |
| Actual mobile IDB recovery | `outputs/Phase4-3-browser/storage-recovery/result.json` |
| Strict Matching and6 responsive probes | `outputs/Phase4-3-browser/strict-matching/browser.json` |
| Exact changed-file inventory | `outputs/Phase4-3-browser/changed-files.json` |

Browser harnesses are `work/phase43-{validation,journey,financial,storage,strict}-browser.mjs` at workspace root. They intercept AI requests; no live Gemini requests are used. Tests97 are repo-contained and run with `npm test`. The CDP harnesses use the existing local browser helper installation; those helper paths are specific to this development computer.

## Evaluation findings

See [the15-case report](../../evaluation/PHASE4_3_EVALUATION.md) and `evaluation/manifest.json`. Every observation is attributed to the user's earlier manual test; exact provider responses and unavailable fields stay unknown. Dataset06 remains uncertain after a reported retry. Dataset09 is a synthetic font, not real handwriting. Cases08/10/13 exposed the wrong-workflow application defect. New prompt performance needs a separately authorized live test.

## Run / upgrade safely

Stop and restart both frontend and API processes after replacing source so schema v2 and status-timeout contracts agree. Keep the original browser origin to recover IndexedDB. Preserve your existing `.env`; never replace it with the example file.

```powershell
cd buktilaut-interactive-prototype
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm run api
```

In a second terminal in the same app folder:

```powershell
npm run dev
```

Open http://127.0.0.1:5173. Existing Gemini selection and credentials stay operator-controlled; configuring and authorizing live use is separate. Manual/demo can run without a provider. Do not change the existing `.env` unless the operator deliberately adjusts its timeout within the supported range.

## Changed files

All paths in the companion inventory are absolute under this workspace. The inventory compares source against the last Strict Matching full ZIP; historical reports are not overwritten. Production changes are concentrated in the v2 contract/provider/client, document/import gates, storage validation/recovery, source/review UI and financial report summary. No database-version reset or production deployment occurred.
