// node refactor-smoke.mjs <log-out> [base]
// Uji interaksi alur contoh: simulasi baca AI, tambah/sunting baris, Isi Rp0, modal bukti,
// penyesuaian tidak terjual, dan laporan. Mencatat teks penting agar dua build bisa dibandingkan.
import { chromium } from "playwright-core";
import fs from "node:fs";
const [out, base = "http://127.0.0.1:8791"] = process.argv.slice(2);
const log = [];
const note = (...a) => log.push(a.join(" "));
const flat = (s) => s.replace(/\s+/g, " ").trim();
const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const w of [390, 1440]) {
  const page = await browser.newPage({ viewport: { width: w, height: w < 500 ? 844 : 900 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const step = async (label, fn) => {
    try { await fn(); } catch (e) { note(w, label, "GAGAL", e.message.split("\n")[0]); }
  };
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Buka contoh/ }).first().click();
  await page.waitForTimeout(600);
  await step("simulasi", async () => {
    await page.getByRole("button", { name: /Simulasi baca AI/ }).first().click();
    await page.waitForTimeout(2500);
    note(w, "timbang setelah simulasi:", flat(await page.locator("main").innerText()).slice(0, 600));
  });
  await step("tab data", async () => {
    const dataTab = page.getByRole("tab", { name: /Data/ });
    if (await dataTab.count()) await dataTab.first().click();
    await page.waitForTimeout(300);
  });
  await step("tambah baris", async () => {
    const before = await page.locator(".data-panel .fish-row").count();
    await page.getByRole("button", { name: /Tambah jenis ikan/ }).click();
    const rows = page.locator(".data-panel .fish-row");
    note(w, "baris timbang:", before, "->", await rows.count());
    const last = rows.last();
    await last.locator('input[placeholder="Nama ikan"]').fill("Kembung");
    await last.locator('input[inputmode="decimal"]').fill("3");
    note(w, "isian baris baru:", await last.locator('input[placeholder="Nama ikan"]').inputValue(), await last.locator('input[inputmode="decimal"]').inputValue());
    await page.getByRole("button", { name: /Hapus/ }).last().click().catch(() => note(w, "tidak ada tombol Hapus"));
    await page.waitForTimeout(300);
    note(w, "baris timbang setelah hapus:", await rows.count());
  });
  await step("konfirmasi timbang", async () => {
    await page.getByRole("button", { name: /Konfirmasi catatan timbang/ }).click();
    await page.waitForTimeout(700);
    note(w, "judul:", flat(await page.locator("h1").first().innerText()));
  });
  await step("nota", async () => {
    await page.locator('input[placeholder="Belum diketahui"][inputmode="decimal"]').first().fill("10");
    const zero = page.getByRole("button", { name: /Isi Rp0 untuk potongan/ });
    if (await zero.count()) {
      await zero.click();
      note(w, "potongan:", flat(await page.locator("#deduction-state").innerText()));
    } else note(w, "tombol Isi Rp0 potongan tidak terlihat");
    note(w, "total nota:", flat(await page.locator(".nota-final").first().innerText()));
    await page.getByRole("button", { name: /Konfirmasi nota/ }).click();
    await page.waitForTimeout(700);
    note(w, "judul:", flat(await page.locator("h1").first().innerText()));
  });
  await step("bukti", async () => {
    await page.getByRole("button", { name: /Bukti timbang/ }).first().click();
    await page.waitForTimeout(500);
    note(w, "modal bukti:", flat(await page.locator("dialog[open]").first().innerText()).slice(0, 160));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  });
  await step("penyesuaian", async () => {
    await page.getByRole("button", { name: /Konfirmasi pasangan Teri/ }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: /Catat penyesuaian/ }).first().click();
    await page.waitForTimeout(400);
    const dialog = page.locator("dialog[open]");
    await dialog.locator('input[placeholder="Contoh: 2"]').fill("3");
    note(w, "simpan aktif untuk 3 kg:", await dialog.getByRole("button", { name: /Simpan penyesuaian/ }).isEnabled());
    await dialog.locator('input[placeholder="Contoh: 2"]').fill("2");
    await dialog.locator("textarea, input[placeholder^='Jelaskan']").first().fill("Dibawa pulang.");
    await dialog.getByRole("button", { name: /Simpan penyesuaian/ }).click();
    await page.waitForTimeout(500);
    note(w, "catatan Teri:", flat(await page.locator(".ledger-note").first().innerText()));
    await page.getByRole("button", { name: /Konfirmasi pasangan Tongkol/ }).click();
    await page.waitForTimeout(300);
  });
  await step("laporan", async () => {
    await page.getByRole("button", { name: /Lihat laporan/ }).click();
    await page.waitForTimeout(700);
    note(w, "ringkasan:", flat(await page.locator(".report-glance").innerText()));
    note(w, "tabel berat:", flat(await page.locator(".report-paper table").first().innerText()));
  });
  note(w, "galat halaman:", JSON.stringify(errors));
  await page.close();
}
await browser.close();
fs.writeFileSync(out, log.join("\n") + "\n");
console.log(log.join("\n"));
