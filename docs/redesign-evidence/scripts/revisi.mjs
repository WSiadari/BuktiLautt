// node revisi.mjs <out>  — revisi 1 (maskot dasbor) & revisi 2 (strip Timbang/Nota/Selisih)
import { chromium } from "playwright-core";
import fs from "node:fs";
const [out, base = "http://127.0.0.1:4173"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: "chrome", headless: true });
const errs = [];
for (const w of [320, 390, 1440]) {
  const ctx = await b.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  // revisi 2: alur contoh
  await p.goto(base + "/", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: /^Buka contoh/ }).first().click();
  await p.waitForTimeout(600);
  await p.getByRole("button", { name: /Konfirmasi catatan timbang/ }).click();
  await p.waitForTimeout(600);
  await p.locator('input[placeholder="Belum diketahui"][inputmode="decimal"]').first().fill("10");
  await p.getByRole("button", { name: /Konfirmasi nota/ }).click();
  await p.waitForTimeout(800);
  await p.locator(".ledger-row").first().scrollIntoViewIfNeeded();
  await p.locator(".ledger-row").first().screenshot({ path: `${out}/${w}-pasangan-menunggu.png` });
  await p.getByRole("button", { name: /Konfirmasi pasangan Tongkol/ }).click();
  await p.waitForTimeout(500);
  await p.locator(".ledger-section").last().screenshot({ path: `${out}/${w}-pasangan-cocok.png` });
  await p.getByRole("button", { name: /Konfirmasi pasangan Teri/ }).click();
  await p.waitForTimeout(500);
  await p.locator(".ledger-section").first().screenshot({ path: `${out}/${w}-pasangan-semua.png` });
  const ov = await p.evaluate(() => [...document.querySelectorAll(".ledger-figures dd, .ledger-figures dt")].filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().height > 40).map((e) => e.textContent));
  console.log(w, "angka terpotong/terlipat:", JSON.stringify(ov), "| overflow-x:", await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  // revisi 1: dasbor
  await p.goto(base + "/masuk", { waitUntil: "networkidle" });
  await p.locator("input[type=email]").fill("demo@buktilaut.test");
  await p.locator("input[type=password]").fill("Demo-Sintetis-48!");
  await p.locator("form button[type=submit]").click();
  await p.waitForURL(/dashboard/, { timeout: 15000 }).catch(async () => { await p.screenshot({ path: `${out}/${w}-login-fail.png` }); console.log("login gagal:", await p.locator("[role=alert], .form-error").allInnerTexts()); throw new Error("stop"); });
  await p.waitForTimeout(1500);
  await p.locator(".dash-hero").screenshot({ path: `${out}/${w}-dasbor-maskot.png` });
  console.log(w, "maskot di dalam kartu:", await p.evaluate(() => {
    const c = document.querySelector(".dash-hero").getBoundingClientRect();
    const m = document.querySelector(".dash-hero-art img").getBoundingClientRect();
    return m.left >= c.left && m.right <= c.right && m.top >= c.top;
  }));
  await ctx.close();
}
console.log("errors", JSON.stringify(errs));
await b.close();
