// node rev36.mjs <out> — revisi 3–6
import { chromium } from "playwright-core";
import fs from "node:fs";
const [out, base = "http://127.0.0.1:4173"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: "chrome", headless: true });
const errs = [];
const rect = (p, sel) => p.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); return `${s}: x${Math.round(r.left)} y${Math.round(r.top)} w${Math.round(r.width)} h${Math.round(r.height)}`; }).join("\n"), sel);
for (const w of [390, 1440]) {
  const p = await b.newPage({ viewport: { width: w, height: w < 500 ? 844 : 900 }, deviceScaleFactor: 2 });
  p.on("pageerror", (e) => errs.push(e.message));
  // revisi 6: baris ikan (draf baru, kosong)
  await p.goto(base + "/", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: /^Mulai periksa/ }).click();
  await p.waitForTimeout(700);
  const row = p.locator(".fish-row").first();
  await row.scrollIntoViewIfNeeded();
  await row.screenshot({ path: `${out}/${w}-r6-baris-ikan.png` });
  console.log(w, "r6\n" + await rect(p, ".fish-row:first-of-type input"));
  // revisi 5 + 4: alur contoh -> laporan -> chat
  await p.goto(base + "/", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: /^Buka contoh/ }).first().click();
  await p.waitForTimeout(600);
  await p.getByRole("button", { name: /Konfirmasi catatan timbang/ }).click();
  await p.waitForTimeout(600);
  await p.locator('input[placeholder="Belum diketahui"][inputmode="decimal"]').first().fill("10");
  await p.getByRole("button", { name: /Konfirmasi nota/ }).click();
  await p.waitForTimeout(700);
  await p.getByRole("button", { name: /Konfirmasi pasangan Teri/ }).click();
  await p.waitForTimeout(300);
  await p.getByRole("button", { name: /Catat penyesuaian/ }).click().catch(() => {});
  await p.waitForTimeout(300);
  await p.keyboard.press("Escape");
  await p.getByRole("button", { name: /Konfirmasi pasangan Tongkol/ }).click();
  await p.waitForTimeout(300);
  await p.getByRole("button", { name: /Lihat laporan/ }).click();
  await p.waitForTimeout(900);
  const head = p.locator(".report-paper .report-status-group").first();
  await head.scrollIntoViewIfNeeded();
  await p.locator(".report-paper > div").first().screenshot({ path: `${out}/${w}-r5-laporan.png` });
  console.log(w, "r5\n" + await rect(p, ".report-status-group, .report-status-group > *"));
  await p.locator(".chat-launcher").click();
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${out}/${w}-r4-chat.png` });
  console.log(w, "r4\n" + await rect(p, "dialog[open], dialog[open] > *, dialog[open] .agent-header, dialog[open] .agent-identity"));
  await p.keyboard.press("Escape");
  // revisi 3: dasbor
  await p.goto(base + "/masuk", { waitUntil: "networkidle" });
  await p.locator("input[type=email]").fill("demo@buktilaut.test");
  await p.locator("input[type=password]").fill("Demo-Sintetis-48!");
  await p.locator("form button[type=submit]").click();
  await p.waitForURL(/dashboard/, { timeout: 15000 });
  await p.waitForTimeout(1200);
  await p.locator(".dashboard-workspace-bar").screenshot({ path: `${out}/${w}-r3-ruang-kerja.png` });
  console.log(w, "r3\n" + await rect(p, ".dashboard-workspace-bar select, .dashboard-workspace-bar summary, .dashboard-avatar"));
  await p.close();
}
console.log("errors", JSON.stringify(errs));
await b.close();
