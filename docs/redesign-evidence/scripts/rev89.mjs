// node rev89.mjs <out> — revisi 8 (kepala maskot saat lompat) & 9 (panah dropdown)
import { chromium } from "playwright-core";
import fs from "node:fs";
const [out, base = "http://127.0.0.1:4173"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: "chrome", headless: true });
const errs = [];
// bekukan animasi lompat di puncaknya (30% dari 2,2 detik)
const freezeHop = (p) => p.evaluate(() => {
  for (const a of document.getAnimations()) {
    if (a.animationName === "ombak-hop") { a.pause(); a.currentTime = 0.3 * 2200; }
  }
});
for (const w of [390, 1440]) {
  const p = await b.newPage({ viewport: { width: w, height: w < 500 ? 844 : 900 }, deviceScaleFactor: 2 });
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(base + "/masuk", { waitUntil: "networkidle" });
  await p.locator("input[type=email]").fill("demo@buktilaut.test");
  await p.locator("input[type=password]").fill("Demo-Sintetis-48!");
  await p.locator("form button[type=submit]").click();
  await p.waitForURL(/dashboard/, { timeout: 15000 });
  await p.waitForTimeout(900);
  // buat draf agar kartu menampilkan "Lanjutkan yang tadi?" (maskot mood positive = melompat)
  await p.getByRole("button", { name: /Mulai pemeriksaan baru/ }).click();
  await p.waitForTimeout(1000);
  await p.goto(base + "/dashboard", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  await freezeHop(p);
  await p.waitForTimeout(100);
  const clip = await p.evaluate(() => {
    const img = document.querySelector(".dash-hero-art img");
    let el = img.parentElement, clipped = [];
    const r = img.getBoundingClientRect();
    while (el && !el.classList.contains("dash-hero")) {
      const cs = getComputedStyle(el), er = el.getBoundingClientRect();
      if (cs.overflow !== "visible" && (r.top < er.top - 0.5)) clipped.push(el.className);
      el = el.parentElement;
    }
    return { imgTop: Math.round(r.top), cardTop: Math.round(document.querySelector(".dash-hero").getBoundingClientRect().top), clipped };
  });
  console.log(w, "lompat puncak:", JSON.stringify(clip));
  await p.locator(".dash-hero").screenshot({ path: `${out}/${w}-r8-maskot-lompat.png` });
  const sel = p.locator(".dashboard-workspace-bar");
  await sel.screenshot({ path: `${out}/${w}-r9-dropdown.png` });
  console.log(w, "select:", await p.locator(".dashboard-workspace-bar select").evaluate((e) => { const c = getComputedStyle(e); return `pl=${c.paddingLeft} pr=${c.paddingRight} bgpos=${c.backgroundPosition} appearance=${c.appearance}`; }));
  // landing hero (maskot besar) + FAB juga diperiksa
  await p.goto(base + "/", { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/${w}-r8-beranda.png` });
  await p.close();
}
console.log("errors", JSON.stringify(errs));
await b.close();
