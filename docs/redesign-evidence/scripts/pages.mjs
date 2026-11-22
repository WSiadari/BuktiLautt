// node pages.mjs <out> <prefix> [baseUrl]
import { chromium } from "playwright-core";
import fs from "node:fs";
const [out, prefix, base = "http://127.0.0.1:5173"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: "chrome", headless: true });
for (const [w, h] of [[390, 844], [768, 1024], [1440, 900], [320, 640]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(base + "/", { waitUntil: "networkidle" });
  await p.screenshot({ path: `${out}/${prefix}-${w}-home-fold.png` });
  await p.screenshot({ path: `${out}/${prefix}-${w}-home-full.png`, fullPage: true });
  const ov = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  // demo -> report
  await p.getByRole("button", { name: /^Buka contoh/ }).first().click();
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: /Konfirmasi catatan timbang/ }).click();
  await p.waitForTimeout(700);
  await p.locator('input[placeholder="Belum diketahui"][inputmode="decimal"]').first().fill("10");
  await p.getByRole("button", { name: /Konfirmasi nota/ }).click();
  await p.waitForTimeout(700);
  await p.getByRole("button", { name: /Konfirmasi pasangan Teri/ }).click();
  await p.waitForTimeout(300);
  await p.getByRole("button", { name: /Konfirmasi pasangan Tongkol/ }).click();
  await p.waitForTimeout(400);
  await p.addStyleTag({ content: ".sticky-actions{position:static!important}" }).then(async t => { await p.screenshot({ path: `${out}/${prefix}-${w}-pasangan-confirmed.png`, fullPage: true }); await t.evaluate(n => n.remove()); });
  await p.getByRole("button", { name: /Lihat laporan/ }).click();
  await p.waitForTimeout(700);
  await p.evaluate(() => scrollTo(0, 0));
  await p.screenshot({ path: `${out}/${prefix}-${w}-laporan-fold.png` });
  const ov2 = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  console.log(w, "home overflowX", ov, "report overflowX", ov2, "errs", errs);
  await ctx.close();
}
await b.close();
