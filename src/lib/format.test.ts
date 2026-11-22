import test from "node:test";
import assert from "node:assert/strict";
import { formatKg, formatRupiah } from "./format.ts";

test("formatRupiah memakai satu format tanpa spasi", () => {
  assert.equal(formatRupiah(2206300), "Rp2.206.300");
  assert.equal(formatRupiah(490000), "Rp490.000");
  assert.equal(formatRupiah(0), "Rp0");
  assert.equal(formatRupiah(-7500), "-Rp7.500");
});

test("nilai belum diketahui tidak pernah menjadi Rp0", () => {
  assert.equal(formatRupiah(null), "Belum diketahui");
  assert.equal(formatRupiah(undefined), "Belum diketahui");
  assert.equal(formatRupiah(Number.NaN), "Belum diketahui");
});

test("formatKg memakai koma desimal Indonesia", () => {
  assert.equal(formatKg(4.5), "4,5 kg");
  assert.equal(formatKg(12), "12 kg");
  assert.equal(formatKg(null), "Belum diketahui");
});
