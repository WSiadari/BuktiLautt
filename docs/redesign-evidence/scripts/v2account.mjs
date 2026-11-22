// Halaman akun (QA DB sintetis): dasbor, arsip, tim, ganti ruang kerja.
import { chromium } from "playwright-core";
import fs from "node:fs";
const [out, widthsArg = "390,1440"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const base = "http://127.0.0.1:4173";
const b = await chromium.launch({ channel: "chrome", headless: true });
for (const w of widthsArg.split(",").map(Number)) {
  const ctx = await b.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto(base + "/masuk", { waitUntil: "networkidle" });
  await p.locator("input[type=email]").fill("demo@buktilaut.test");
  await p.locator("input[type=password]").fill("Demo-Sintetis-48!");
  await p.locator("form button[type=submit]").click();
  await p.waitForURL(/dashboard/);
  await p.waitForTimeout(1000);
  await p.screenshot({ path: `${out}/${w}-dashboard.png` });
  await p.screenshot({ path: `${out}/${w}-dashboard-full.png`, fullPage: true });
  const select = p.locator(".dashboard-workspace-field select");
  const options = await select.locator("option").allInnerTexts();
  console.log(w, "ruang kerja:", JSON.stringify(options));
  await p.locator(".dashboard-account summary").click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/${w}-akun-menu.png` });
  await p.locator(".dashboard-account summary").click();
  await p.getByRole("button", { name: /Buka arsip transaksi/ }).click();
  await p.waitForTimeout(1000);
  await p.screenshot({ path: `${out}/${w}-arsip.png`, fullPage: true });
  await p.goto(base + "/tim", { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/${w}-tim.png`, fullPage: true });
  console.log(w, "errors", JSON.stringify(errs), "overflow", await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  await ctx.close();
}
await b.close();
