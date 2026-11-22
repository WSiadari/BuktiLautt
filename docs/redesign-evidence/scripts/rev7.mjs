// node rev7.mjs <out> — revisi 7: masuk/daftar sebagai kartu di atas halaman sebelumnya yang diburamkan
import { chromium } from "playwright-core";
import fs from "node:fs";
const [out, base = "http://127.0.0.1:4173"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: "chrome", headless: true });
const errs = [];
for (const w of [390, 1440]) {
  const p = await b.newPage({ viewport: { width: w, height: w < 500 ? 844 : 900 } });
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(base + "/", { waitUntil: "networkidle" });
  await p.waitForTimeout(600);
  // buka dari tombol Masuk di header (atau menu di HP)
  const direct = p.locator(".site-header").getByRole("button", { name: /^Masuk$/ });
  if (await direct.isVisible().catch(() => false)) await direct.click();
  else {
    await p.locator(".site-header").getByRole("button", { name: /menu/i }).first().click();
    await p.waitForTimeout(300);
    await p.getByRole("button", { name: /^Masuk$/ }).first().click();
  }
  await p.waitForTimeout(900);
  console.log(w, "URL", p.url(), "| latar belakang masih dirender:", await p.locator(".auth-background .hero-v2").count() > 0,
    "| backdrop:", await p.locator(".auth-page").evaluate((e) => getComputedStyle(e).backdropFilter + " / " + getComputedStyle(e).backgroundColor));
  await p.screenshot({ path: `${out}/${w}-r7-masuk.png` });
  await p.getByRole("link", { name: /Daftar sekarang/ }).or(p.getByRole("button", { name: /Daftar sekarang/ })).first().click();
  await p.waitForTimeout(900);
  console.log(w, "URL", p.url());
  await p.screenshot({ path: `${out}/${w}-r7-daftar.png` });
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  const back = p.getByRole("button", { name: /Kembali/ }).first();
  if (await back.isVisible().catch(() => false)) await back.click();
  await p.waitForTimeout(700);
  console.log(w, "setelah kembali URL", p.url());
  await p.close();
}
console.log("errors", JSON.stringify(errs));
await b.close();
