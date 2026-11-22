import test from "node:test";
import assert from "node:assert/strict";
import { inspectionProgress } from "./inspectionProgress.ts";

test("resume destination follows reviewed sources and never skips an unconfirmed weighing record", () => {
  assert.deepEqual(inspectionProgress({ weighingConfirmed: false, receiptConfirmed: false }), { step: "weighing", label: "Catatan timbang" });
  assert.deepEqual(inspectionProgress({ weighingConfirmed: false, receiptConfirmed: true }), { step: "weighing", label: "Catatan timbang" });
  assert.deepEqual(inspectionProgress({ weighingConfirmed: true, receiptConfirmed: false }), { step: "receipt", label: "Nota penjualan" });
  assert.deepEqual(inspectionProgress({ weighingConfirmed: true, receiptConfirmed: true }), { step: "matching", label: "Periksa pasangan" });
});
