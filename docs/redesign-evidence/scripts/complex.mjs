// Skenario Complex: sumber foto sintetis + isian manual dari groundtruth-rows.csv (tanpa Gemini).
import { chromium } from "playwright-core";
import fs from "node:fs";
const [out, projectDir, base = "http://127.0.0.1:4173"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const csv = fs
  .readFileSync(`${projectDir}/evaluation/complex/groundtruth-rows.csv`, "utf8")
  .replace(/^﻿/, "")
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((l) => l.split(","));
const weigh = csv.map((c) => ({ fish: c[3], kg: c[4].replace(".", ",") }));
const receipt = csv
  .filter((c) => c[1])
  .sort((a, b) => a[1].localeCompare(b[1]))
  .map((c) => ({ fish: c[3], kg: c[5].replace(".", ","), price: c[6] }));
const logFile = `${out}/complex-log.txt`;
fs.writeFileSync(logFile, "");
const log = (...a) => {
  console.log(...a);
  fs.appendFileSync(logFile, a.join(" ") + "\n");
};
const flat = (s) => s.replace(/\s+/g, " ").trim();
const b = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
const byLine = (sel, n) => p.locator(sel).filter({ has: p.locator(".ledger-figures > div:first-child .ledger-ref", { hasText: new RegExp(`^baris ${n}$`) }) });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("dialog", (d) => d.accept());
const shot = async (name) => {
  const t = await p.addStyleTag({ content: ".action-bar,.site-header{position:static!important}.chat-launcher{display:none!important}" });
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  await t.evaluate((n) => n.remove());
};
await p.goto(base + "/", { waitUntil: "networkidle" });
await p.getByRole("button", { name: /^Mulai periksa/ }).click();
await p.waitForTimeout(600);

async function fillSource(kind, file, rows) {
  await p.locator(".source-panel .segmented button", { hasText: "Foto" }).click();
  await p.locator(".source-panel input[type=file]").setInputFiles(`${projectDir}/evaluation/complex/${file}`);
  await p.waitForSelector(".source-panel .source-photo", { timeout: 15000 });
  for (let i = 0; i < rows.length; i++) {
    if (i > 0) await p.getByRole("button", { name: /Tambah jenis ikan/ }).click();
    const row = p.locator(".data-panel .fish-row").nth(i);
    await row.locator('input[placeholder="Nama ikan"]').fill(rows[i].fish);
    await row.locator('input[inputmode="decimal"]').fill(rows[i].kg);
    if (kind === "receipt") await row.locator('.field-grid input[inputmode="numeric"]').fill(rows[i].price);
  }
  log(kind, "baris terisi:", await p.locator(".data-panel .fish-row").count());
}

await fillSource("weighing", "SINTETIS-catatan-timbang-clear.png", weigh);
await shot("complex-01-timbang");
await p.getByRole("button", { name: /Konfirmasi catatan timbang/ }).click();
await p.waitForTimeout(800);
await fillSource("receipt", "SINTETIS-nota-penjualan-clear.png", receipt);

// Tiga status nominal
log(
  "[status] Potongan kosong:",
  await p.locator("#deduction-state").innerText(),
  "| tombol 'Isi Rp0 untuk potongan' terlihat:",
  await p.getByRole("button", { name: "Isi Rp0 untuk potongan" }).isVisible(),
);
await p.getByRole("button", { name: "Isi Rp0 untuk biaya tambahan" }).click();
log(
  "[status] Biaya setelah Isi Rp0:",
  await p.locator("#charges-state").innerText(),
  "| tombol Isi Rp0 biaya tersisa:",
  await p.getByRole("button", { name: "Isi Rp0 untuk biaya tambahan" }).count(),
);
await p.locator("#deduction-state").scrollIntoViewIfNeeded();
await p.screenshot({ path: `${out}/complex-02a-status-belum-diketahui-dan-rp0-isian.png` });
await p.locator(".fee-field").nth(0).locator("input").fill("15000");
await p.locator(".fee-field").nth(1).locator("input").fill("7500");
log("[nota] Total akhir nota terhitung:", await p.locator(".nota-final strong").innerText());
await shot("complex-02-nota");
await p.getByRole("button", { name: /Konfirmasi nota/ }).click();
await p.waitForTimeout(900);

// Periksa pasangan
log("[pasangan] Kartu perlu keputusan:", await p.locator("article.pair-card.ledger-row").count());
await shot("complex-03-pasangan-awal");
for (let i = 0; i < csv.length; i++) {
  const c = csv[i];
  const card = byLine("article.pair-card", i + 1).first();
  if (!c[1]) {
    await card.getByRole("button", { name: "Catat tanpa pasangan" }).click();
    await p.waitForTimeout(150);
    continue;
  }
  const line = Number(c[1].slice(1));
  const select = card.locator("select");
  const options = await select.locator("option").allInnerTexts();
  const idx = options.findIndex((o) => o.includes(`baris nota ${line}`) && !o.includes("sudah dipakai"));
  const value = await select.locator("option").nth(idx).getAttribute("value");
  await select.selectOption(value);
  await card.getByRole("button", { name: /^Konfirmasi pasangan/ }).click();
  await p.waitForTimeout(150);
}
await p.waitForTimeout(400);
const groups = await p.locator(".ledger-group").allInnerTexts();
log("[pasangan] Grup:", groups.map(flat).join(" | "));
await shot("complex-04-pasangan-dikonfirmasi");
const teri = () => byLine(".pair-card", 1).first();
log("[pasangan] Teri baris 1 sebelum penyesuaian:", flat(await teri().locator(".ledger-figures").innerText()));
log("[pasangan] Teri baris 11:", flat(await byLine(".pair-card", 11).first().locator(".ledger-figures").innerText()));
await teri().getByRole("button", { name: "Catat penyesuaian" }).click();
await p.waitForTimeout(400);
const dlg = p.locator("dialog[open]");
await dlg.locator("input").first().fill("3");
await dlg.locator("textarea").first().fill("Uji batas: 3 kg melebihi selisih.");
await p.waitForTimeout(200);
log("[penyesuaian] Tombol simpan aktif dengan 3 kg:", await dlg.getByRole("button", { name: /Simpan penyesuaian/ }).isEnabled());
log("[penyesuaian] Teks dialog 3 kg:", flat(await dlg.innerText()).slice(0, 400));
await dlg.locator("input").first().fill("2");
await dlg.locator("textarea").first().fill("2 kg Teri tidak terjual, dibawa pulang (data sintetis).");
await p.screenshot({ path: `${out}/complex-05-penyesuaian.png` });
await dlg.getByRole("button", { name: /Simpan penyesuaian/ }).click();
await p.waitForTimeout(800);
log("[pasangan] Teri baris 1 setelah penyesuaian:", flat(await teri().locator(".ledger-figures").innerText()));
log("[ringkasan]", flat(await p.locator(".result-panel").innerText()).slice(0, 200));
await shot("complex-06-pasangan-akhir");
await p.getByRole("button", { name: /Lihat laporan/ }).click();
await p.waitForTimeout(800);
await p.evaluate(() => scrollTo(0, 0));
await p.screenshot({ path: `${out}/complex-07-laporan-fold.png` });
await shot("complex-07-laporan-full");
log("[laporan] glance:", flat(await p.locator(".report-glance").innerText()));
log("[laporan] summary:", flat(await p.locator(".report-summary").innerText()));
const cards = await p.locator(".report-weight-card").allInnerTexts();
log("[laporan] kartu berat:", cards.length);
for (const c of cards.filter((t) => t.includes("Teri"))) log("[laporan] Teri:", flat(c));
log("[laporan] total akhir (aritmetika):", flat(await p.locator(".money-line.grand-total").innerText()));
await p.emulateMedia({ media: "print" });
await p.pdf({ path: `${out}/complex-laporan.pdf`, format: "A4", printBackground: true });
await p.emulateMedia({ media: "screen" });
log("[pdf] dibuat");
const dump = async (label) => log(label, JSON.stringify((await p.locator("button:visible, a:visible").allInnerTexts()).map(flat).filter(Boolean)));
await p.goto(base + "/masuk", { waitUntil: "networkidle" });
await p.screenshot({ path: `${out}/akun-01-masuk-390.png` });
await p.locator("input[type=email]").fill("demo@buktilaut.test");
await p.locator("input[type=password]").fill("Demo-Sintetis-48!");
await p.locator("form button[type=submit]").first().click();
await p.waitForTimeout(1500);
log("[akun] URL setelah masuk:", p.url());
await p.screenshot({ path: `${out}/akun-02-dashboard-390.png`, fullPage: true });
await dump("[akun] tombol dashboard:");
// Buka pemeriksaan aktif lewat menu navigasi
await p.getByRole("button", { name: "Buka navigasi" }).click();
await p.getByRole("button", { name: "Pemeriksaan", exact: true }).click();
await p.waitForTimeout(900);
log("[akun] URL:", p.url(), "H1:", await p.locator("h1").first().innerText().catch(() => "-"));
await p.getByRole("button", { name: /Simpan pemeriksaan aktif/ }).click();
await p.waitForTimeout(600);
const dlg2 = p.locator("dialog[open]");
await dlg2.locator("input[type=date]").fill("2026-11-17");
await dlg2.locator(".account-check input[type=checkbox]").check();
await dlg2.locator("select").last().selectOption("confirmed");
await p.screenshot({ path: `${out}/akun-03-simpan-arsip-390.png` });
await dlg2.getByRole("button", { name: /Simpan ke arsip akun/ }).click();
await p.waitForTimeout(1500);
log("[arsip] setelah simpan:", flat(await p.locator("body").innerText()).match(/(Tersimpan[^.]*\.|Revisi arsip \d+[^.]*)/)?.[0] || "(cek screenshot)");
await p.goto(base + "/arsip", { waitUntil: "networkidle" });
await p.waitForTimeout(800);
await p.screenshot({ path: `${out}/akun-04-arsip-390.png`, fullPage: true });
const arsipText = flat(await p.locator("main").innerText());
log("[arsip] memuat Rp2.206.300:", arsipText.includes("Rp2.206.300"), "| ada format 'Rp 2' dengan spasi:", /Rp\s\d/.test(arsipText));
// Ombak Pintar: tanya total arsip (Panduan dasar karena Gemini dimatikan di server QA)
await p.locator(".chat-launcher").click();
await p.waitForTimeout(700);
await p.locator("#chat-question").fill("Berapa total transaksi terkonfirmasi tanggal 17 November 2026?");
await p.getByRole("button", { name: "Kirim pertanyaan" }).click();
await p.waitForTimeout(2500);
await p.screenshot({ path: `${out}/akun-05-chat-arsip-390.png` });
const chatText = flat(await p.locator(".chat-messages").innerText());
log("[chat] jawaban:", chatText.slice(-300));
log("[chat] format Rupiah tanpa spasi:", !/Rp\s\d/.test(chatText));
log("[errors]", JSON.stringify(errs));
await b.close();
