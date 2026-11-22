// node v3shots.mjs <folder-keluaran> [base] [prefix]
// Bukti redesign v3. Server: build produksi lewat `npm start`, Gemini mati,
// database akun sintetis dari evaluation/seed-synthetic.mjs (demo@buktilaut.test).
import { chromium } from "playwright-core";
import fs from "node:fs";

const [out, base = "http://127.0.0.1:8791", prefix = ""] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = [];
const name = (w, label) => `${out}/${prefix}${w}-${label}.png`;

for (const w of [390, 1440]) {
  const h = w < 500 ? 844 : 900;
  const freeze = process.env.FREEZE === "1";
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...(freeze ? { reducedMotion: "reduce" } : {}) });
  const page = await context.newPage();
  // FREEZE=1: matikan animasi agar dua versi kode bisa dibandingkan per piksel.
  if (freeze)
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
        document.head.appendChild(style);
      });
    });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const settle = (ms = 1100) => page.waitForTimeout(ms);
  const fold = (label) => page.screenshot({ path: name(w, label) });
  const full = async (label) => {
    const tag = await page.addStyleTag({ content: ".action-bar,.site-header{position:static!important}" });
    await page.screenshot({ path: name(w, `${label}-full`), fullPage: true });
    await tag.evaluate((n) => n.remove());
  };
  const overflow = async (label) => {
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) report.push(`${w} ${label}: overflow-x`);
  };
  const step = async (label, fn) => {
    try { await fn(); } catch (e) { report.push(`${w} ${label}: GAGAL ${e.message.split("\n")[0]}`); }
  };

  await step("beranda", async () => {
    await page.goto(base + "/", { waitUntil: "networkidle" });
    await settle();
    await fold("beranda");
    await full("beranda");
    await overflow("beranda");
  });
  await step("timbang", async () => {
    await page.getByRole("button", { name: /^Buka contoh/ }).first().click();
    await settle();
    await page.evaluate(() => scrollTo(0, 0));
    await fold("1-timbang");
    await full("1-timbang");
    await overflow("timbang");
  });
  await step("ombak", async () => {
    await page.getByRole("button", { name: "Buka bantuan Ombak Pintar" }).first().click();
    await settle(900);
    await fold("ombak-pintar");
    await page.keyboard.press("Escape");
    await settle(400);
  });
  await step("nota", async () => {
    await page.getByRole("button", { name: /Konfirmasi catatan timbang/ }).click();
    await settle();
    await page.evaluate(() => scrollTo(0, 0));
    await fold("2-nota");
    await full("2-nota");
    await overflow("nota");
  });
  await step("pasangan", async () => {
    await page.locator('input[placeholder="Belum diketahui"][inputmode="decimal"]').first().fill("10");
    await page.getByRole("button", { name: /Konfirmasi nota/ }).click();
    await settle();
    await page.evaluate(() => scrollTo(0, 0));
    await fold("3-pasangan");
    await full("3-pasangan");
    await overflow("pasangan");
  });
  await step("laporan", async () => {
    await page.getByRole("button", { name: /Konfirmasi pasangan Teri/ }).click();
    await settle(300);
    await page.getByRole("button", { name: /Konfirmasi pasangan Tongkol/ }).click();
    await settle(500);
    await page.getByRole("button", { name: /Lihat laporan/ }).click();
    await settle();
    await page.evaluate(() => scrollTo(0, 0));
    await fold("4-laporan");
    await full("4-laporan");
    await overflow("laporan");
    if (w === 390) {
      await page.emulateMedia({ media: "print" });
      await page.screenshot({ path: name(w, "4-laporan-cetak"), fullPage: true });
      const pdf = await page.pdf({ format: "A4", printBackground: true });
      fs.writeFileSync(`${out}/${prefix}laporan-cetak-a4.pdf`, pdf);
      await page.emulateMedia({ media: "screen" });
    }
  });
  await step("masuk", async () => {
    await page.goto(base + "/masuk", { waitUntil: "networkidle" });
    await settle();
    await fold("masuk");
    await overflow("masuk");
  });
  await step("daftar", async () => {
    await page.goto(base + "/daftar", { waitUntil: "networkidle" });
    await settle();
    await fold("daftar");
    await overflow("daftar");
  });
  await step("dashboard", async () => {
    await page.goto(base + "/masuk", { waitUntil: "networkidle" });
    await page.locator("input[type=email]").fill("demo@buktilaut.test");
    await page.locator("input[type=password]").fill("Demo-Sintetis-48!");
    await page.locator("form button[type=submit]").click();
    await page.waitForURL(/dashboard/, { timeout: 15000 });
    await settle(1500);
    await fold("dashboard");
    await full("dashboard");
    await overflow("dashboard");
  });
  await step("arsip", async () => {
    await page.goto(base + "/arsip", { waitUntil: "networkidle" });
    await settle(1500);
    await fold("arsip");
    await full("arsip");
    await overflow("arsip");
  });
  report.push(`${w} galat halaman: ${JSON.stringify(errors)}`);
  await context.close();
}
console.log(report.join("\n"));
await browser.close();
