import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  validateVisionResult,
  type VisionResult,
} from "../../src/vision/contract.ts";

type ExpectedRow = {
  rowId: string;
  lot: string;
  name: string;
  weightKg: string;
  unit: string;
  unitPriceRupiah?: string;
  subtotalRupiah?: string;
};
type GroundTruth = {
  datasetId: string;
  weighing: ExpectedRow[];
  receipt: ExpectedRow[];
  subtotalRupiah: string;
  documentDiscountRupiah: string;
  documentFeeRupiah: string;
  documentFinalRupiah: string;
};
type FieldComparison = {
  field: string;
  expected: string | null;
  actual: string | null;
  status: "correct" | "incorrect" | "unknown";
};
const nameKey = (value: string | null) =>
  (value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("id-ID");
function numberKey(value: string | number): string | null {
  const text = String(value);
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const tail = fraction.replace(/0+$/u, "");
  return BigInt(whole).toString() + (tail ? "." + tail : "");
}
function numericField(
  field: string,
  expected: string,
  actual: number | null,
): FieldComparison {
  return {
    field,
    expected,
    actual: actual === null ? null : String(actual),
    status:
      actual === null
        ? "unknown"
        : numberKey(expected) === numberKey(actual)
          ? "correct"
          : "incorrect",
  };
}
function printedRupiah(value: string | null): number | null {
  if (value === null) return null;
  const text = value
    .trim()
    .replace(/^Rp\s*/iu, "")
    .replace(/\s*\/\s*kg$/iu, "");
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,00)?$/u.test(text)) return null;
  const amount = Number(text.replace(/,00$/u, "").replace(/\./gu, ""));
  return Number.isSafeInteger(amount) ? amount : null;
}
export function compareExtraction(truth: GroundTruth, file: unknown) {
  if (!file || typeof file !== "object")
    throw new Error("Response file must contain JSON object");
  const wrapper = file as Record<string, unknown>;
  const payload = (wrapper.response ??
    wrapper.result ??
    wrapper.body ??
    file) as Record<string, unknown>;
  const kind = wrapper.kind ?? payload.documentType;
  if (
    wrapper.status === "service_error" ||
    wrapper.status === "transport_error" ||
    payload.error
  ) {
    return {
      stage: "initial_extraction",
      status:
        wrapper.status === "transport_error"
          ? "transport_error"
          : "service_error",
      provider: wrapper.provider ?? "unspecified",
      httpStatus: wrapper.httpStatus ?? null,
      elapsedSeconds: wrapper.elapsedSeconds ?? null,
      retryCount: wrapper.retryCount ?? null,
      fieldComparison:
        "not_performed_service_failure_is_not_an_OCR_field_error",
    };
  }
  if (kind !== "weighing" && kind !== "receipt")
    throw new Error("Response kind must be weighing or receipt");
  const input = {
    documentType: kind,
    requestId: payload.requestId,
    sourceId: payload.sourceId,
    sourceRevision: payload.sourceRevision,
    text: "Local comparison only",
  } as Parameters<typeof validateVisionResult>[1];
  const result: VisionResult = validateVisionResult(payload, input);
  const expected = truth[kind];
  const actual = result.normalized.items;
  const associations = new Map<
    number,
    {
      actualIndex: number;
      method:
        "visible_lot" | "unique_species" | "duplicate_order_requires_review";
    }
  >();
  const used = new Set<number>();
  actual.forEach((item, actualIndex) => {
    const text = `${result.raw.items[actualIndex].rawText || ""} ${item.itemName || ""}`;
    const matches = expected.flatMap((row, index) =>
      new RegExp(`(^|[^A-Za-z0-9])${row.lot}($|[^A-Za-z0-9])`, "i").test(text)
        ? [index]
        : [],
    );
    if (matches.length === 1 && !associations.has(matches[0])) {
      associations.set(matches[0], { actualIndex, method: "visible_lot" });
      used.add(actualIndex);
    }
  });
  for (const [index, row] of expected.entries()) {
    if (associations.has(index)) continue;
    const key = nameKey(row.name);
    const expectedGroup = expected.flatMap((candidate, candidateIndex) =>
      !associations.has(candidateIndex) && nameKey(candidate.name) === key
        ? [candidateIndex]
        : [],
    );
    const actualGroup = actual.flatMap((candidate, candidateIndex) =>
      !used.has(candidateIndex) && nameKey(candidate.itemName) === key
        ? [candidateIndex]
        : [],
    );
    if (expectedGroup.length !== actualGroup.length || !actualGroup.length)
      continue;
    expectedGroup.forEach((candidateIndex, order) => {
      associations.set(candidateIndex, {
        actualIndex: actualGroup[order],
        method:
          expectedGroup.length === 1
            ? "unique_species"
            : "duplicate_order_requires_review",
      });
      used.add(actualGroup[order]);
    });
  }
  const rows = expected.map((row, index) => {
    const match = associations.get(index);
    if (!match)
      return {
        expectedRowId: row.rowId,
        expectedLot: row.lot,
        expectedSpecies: row.name,
        status: "missing_or_unaligned",
        fields: [] as FieldComparison[],
      };
    const item = actual[match.actualIndex];
    const raw = result.raw.items[match.actualIndex];
    const unit = raw.weightUnit?.trim().toLocaleLowerCase("id-ID") || null;
    const fields: FieldComparison[] = [
      {
        field: "species",
        expected: row.name,
        actual: item.itemName,
        status:
          item.itemName === null
            ? "unknown"
            : nameKey(item.itemName) === nameKey(row.name)
              ? "correct"
              : "incorrect",
      },
      numericField("weightKg", row.weightKg, item.weightKg),
      {
        field: "unit",
        expected: row.unit,
        actual: raw.weightUnit,
        status:
          unit === null
            ? "unknown"
            : ["kg", "kilogram", "kilograms"].includes(unit) &&
                row.unit === "kg"
              ? "correct"
              : "incorrect",
      },
    ];
    if (kind === "receipt") {
      fields.push(
        numericField(
          "rawPrintedUnitPriceAmount_not_priceBasis",
          row.unitPriceRupiah!,
          printedRupiah(raw.unitPrice),
        ),
      );
      fields.push(
        numericField(
          "unitPriceRupiah",
          row.unitPriceRupiah!,
          item.unitPriceRupiah,
        ),
      );
      fields.push(
        numericField(
          "subtotalRupiah",
          row.subtotalRupiah!,
          item.subtotalRupiah,
        ),
      );
      fields.push({
        field: "unprintedRowDiscount",
        expected: null,
        actual: raw.discount,
        status: raw.discount === null ? "correct" : "incorrect",
      });
    }
    return {
      expectedRowId: row.rowId,
      expectedLot: row.lot,
      expectedSpecies: row.name,
      status: "compared",
      actualIndex: match.actualIndex,
      alignment: match.method,
      fields,
      issues: item.issues,
    };
  });
  const certainFields = rows
    .filter(
      (row) =>
        row.status === "compared" &&
        row.alignment !== "duplicate_order_requires_review",
    )
    .flatMap((row) => row.fields);
  const counts = { correct: 0, incorrect: 0, unknown: 0 };
  for (const field of certainFields) counts[field.status]++;
  const species = [...new Set(expected.map((row) => nameKey(row.name)))];
  const repeatedSpecies = species.flatMap((key) => {
    const expectedCount = expected.filter(
      (row) => nameKey(row.name) === key,
    ).length;
    const returnedCount = actual.filter(
      (row) => nameKey(row.itemName) === key,
    ).length;
    return expectedCount > 1 || returnedCount > expectedCount
      ? [{ species: key, expectedCount, returnedCount }]
      : [];
  });
  let calculatedLineSubtotal: number | null = null;
  if (
    kind === "receipt" &&
    actual.every((item) => item.subtotalRupiah !== null)
  ) {
    const sum = actual.reduce(
      (total, item) => total + BigInt(item.subtotalRupiah!),
      0n,
    );
    if (sum <= BigInt(Number.MAX_SAFE_INTEGER))
      calculatedLineSubtotal = Number(sum);
  }
  return {
    stage: "initial_extraction",
    status: "compared",
    evidence: wrapper.provider ?? "unspecified_response_file",
    model: result.provider.model,
    httpStatus: wrapper.httpStatus ?? null,
    elapsedSeconds: wrapper.elapsedSeconds ?? null,
    retryCount: wrapper.retryCount ?? null,
    actualClassification: result.raw.documentType,
    readability:
      result.raw.schemaVersion === 2
        ? result.raw.readability
        : "legacy_not_recorded",
    rowCounts: {
      expected: expected.length,
      returned: actual.length,
      associated: associations.size,
    },
    repeatedSpecies,
    missingOrUnalignedExpectedRows: rows
      .filter((row) => row.status !== "compared")
      .map((row) => row.expectedRowId),
    extraOrUnalignedActualIndices: actual.flatMap((_item, index) =>
      used.has(index) ? [] : [index],
    ),
    associationReviewRequired: rows
      .filter(
        (row) =>
          row.status === "compared" &&
          row.alignment === "duplicate_order_requires_review",
      )
      .map((row) => row.expectedRowId),
    alignedFieldCounts: counts,
    rows,
    documentAmounts:
      kind === "receipt"
        ? [
            numericField(
              "sumOfExtractedLineSubtotals_calculated_independently",
              truth.subtotalRupiah,
              calculatedLineSubtotal,
            ),
            numericField(
              "printedDocumentDeduction",
              truth.documentDiscountRupiah,
              result.normalized.deductionRupiah,
            ),
            numericField(
              "printedDocumentFee",
              truth.documentFeeRupiah,
              result.normalized.chargesRupiah,
            ),
            numericField(
              "printedDocumentFinal",
              truth.documentFinalRupiah,
              result.normalized.documentTotalRupiah,
            ),
          ]
        : [],
    warnings: result.warnings,
  };
}
async function main() {
  const [truthPath, ...files] = process.argv.slice(2);
  if (!truthPath || !files.length)
    throw new Error(
      "Usage: compare-live.ts groundtruth.json response.json [response2.json ...]",
    );
  const truth = JSON.parse(await readFile(truthPath, "utf8")) as GroundTruth;
  const results = [];
  for (const path of files)
    results.push({
      file: path,
      ...compareExtraction(truth, JSON.parse(await readFile(path, "utf8"))),
    });
  console.log(
    JSON.stringify(
      {
        datasetId: truth.datasetId,
        method:
          "Visible lot identifiers first, then unique species. Repeated species without lot evidence use source order for manual review and are excluded from aligned field counts. Service failures are not OCR field errors. No aggregate accuracy percentage is claimed.",
        results,
        finalReviewed: {
          status: "not_assessed_by_this_script",
          note: "Report the human-reviewed application flow separately. Initial provider responses are never rewritten with corrected values.",
        },
      },
      null,
      2,
    ),
  );
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Comparison failed");
    process.exitCode = 1;
  });
