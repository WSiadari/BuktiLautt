// node sales.mjs <out> — Ombak Pintar: pertanyaan penjualan dari arsip (server QA, tanpa Gemini)
import { chromium } from "playwright-core";
import fs from "node:fs";
const [out, base = "http://127.0.0.1:4173"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(base + "/masuk", { waitUntil: "networkidle" });
await p.locator("input[type=email]").fill("demo@buktilaut.test");
await p.locator("input[type=password]").fill("Demo-Sintetis-48!");
await p.locator("form button[type=submit]").click();
await p.waitForURL(/dashboard/, { timeout: 15000 });
await p.waitForTimeout(1200);
await p.locator(".chat-launcher").click();
await p.waitForTimeout(900);
console.log("saran:", JSON.stringify(await p.locator(".chat-suggestions button").allInnerTexts()));
await p.screenshot({ path: `${out}/390-chat-saran.png` });
const questions = [
  "Total penjualan bulan ini berapa?",
  "Ikan apa paling laku bulan ini?",
  "Berapa selisih berat bulan ini?",
  "Bandingkan penjualan bulan ini dengan bulan lalu",
  "berapa kg teri terjual bulan ini",
];
for (const [i, q] of questions.entries()) {
  const chip = p.locator(".chat-suggestions button", { hasText: q });
  if (await chip.count()) await chip.click();
  else {
    await p.getByPlaceholder(/Ketik pertanyaan/).fill(q);
    await p.keyboard.press("Enter");
  }
  await p.waitForFunction((n) => document.querySelectorAll(".agent-messages .message:not(.user-message)").length >= n, i + 1, { timeout: 15000 });
  await p.waitForTimeout(400);
  const last = p.locator(".agent-messages .message:not(.user-message)").last();
  console.log(`\nT: ${q}\nJ: ${(await last.locator("> p").first().innerText()).trim()}`);
  await last.scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${out}/390-chat-jawab-${i + 1}.png` });
}
console.log("\nerrors", JSON.stringify(errs));
await b.close();
