// node ombak-chat.mjs [base] — masuk dengan akun sintetis, ajukan pertanyaan ke Ombak Pintar (Panduan dasar).
import { chromium } from "playwright-core";
const [base = "http://127.0.0.1:8791"] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(base + "/masuk", { waitUntil: "networkidle" });
await p.locator("input[type=email]").fill("demo@buktilaut.test");
await p.locator("input[type=password]").fill("Demo-Sintetis-48!");
await p.locator("form button[type=submit]").click();
await p.waitForURL(/dashboard/, { timeout: 15000 });
await p.waitForTimeout(1000);
await p.getByRole("button", { name: "Buka bantuan Ombak Pintar" }).first().click();
await p.waitForTimeout(800);
const questions = [
  "Total penjualan November 2026 berapa?",
  "Ikan apa paling laku 30 hari terakhir?",
  "Berapa selisih berat bulan November 2026?",
  "Tampilkan transaksi tanggal 20 November",
];
for (const [i, q] of questions.entries()) {
  await p.getByPlaceholder(/Ketik pertanyaan/).fill(q);
  await p.keyboard.press("Enter");
  await p.waitForFunction((n) => document.querySelectorAll(".agent-messages .message:not(.user-message)").length >= n, i + 1, { timeout: 15000 });
  await p.waitForTimeout(400);
  const last = p.locator(".agent-messages .message:not(.user-message)").last();
  console.log(`T: ${q}\nJ: ${(await last.innerText()).replace(/\s+/g, " ").trim().slice(0, 260)}\n`);
}
console.log("galat halaman:", JSON.stringify(errs));
await b.close();
