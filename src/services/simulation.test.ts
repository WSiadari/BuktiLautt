import test from "node:test";
import assert from "node:assert/strict";
import {
  scriptedReply,
  simulationMessage,
  SIMULATION_DELAY,
  type ScriptedContext,
} from "./simulation.ts";

test("scripted discrepancy guidance uses current read-only findings instead of the reference fixture", () => {
  const context: ScriptedContext = {
    weights: "Teri: 12 kg timbang, 11 kg nota, sisa 1 kg.",
    receipt: "Total Rp515.000.",
    nextStep: "Tinjau revisi aktif.",
  };
  const reply = scriptedReply("Berapa selisih Teri saat ini?", context);
  assert.ok(reply.includes(context.weights));
  assert.ok(!reply.includes("12 − 10"));
  assert.ok(scriptedReply("Kenapa masih 2kg?", context).includes(context.weights));
  assert.ok(!scriptedReply("2?", context).includes("12 − 10"));
});
test("unconfirmed weights stay unknown and money guidance stays independent", () => {
  const context: ScriptedContext = {
    weights: "Belum ada pasangan dikonfirmasi; selisih belum diketahui.",
    receipt: "Total belum diketahui, bukan nol.",
    nextStep: "Periksa sumber.",
  };
  assert.ok(
    scriptedReply("Berapa selisih?", context).includes(context.weights),
  );
  assert.ok(
    scriptedReply("Berapa total nota?", context).includes(context.receipt),
  );
});
test("demo messages explicitly identify simulation without fabricated percentage or applied success", () => {
  assert.equal(SIMULATION_DELAY, 1400);
  for (const outcome of [
    "success",
    "partial",
    "empty",
    "timeout",
    "quota",
    "invalid",
  ] as const) {
    const message = simulationMessage(outcome);
    assert.match(message, /simulasi/i);
    assert.doesNotMatch(message, /\d+\s*%/);
  }
});
