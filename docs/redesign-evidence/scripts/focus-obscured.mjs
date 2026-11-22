// Tab melalui setiap kontrol; catat bila elemen fokus tertutup action bar/header yang menempel.
import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
for (const [w, h] of [[390, 844], [1440, 900], [390, 508]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: /^Buka contoh/ }).first().click(); await p.waitForTimeout(400);
  await p.getByRole("button", { name: /Konfirmasi catatan timbang/ }).click(); await p.waitForTimeout(600);
  for (const stage of ["nota", "pasangan"]) {
    if (stage === "pasangan") {
      await p.locator('input[placeholder="Belum diketahui"][inputmode="decimal"]').first().fill("10");
      await p.getByRole("button", { name: /Konfirmasi nota/ }).click(); await p.waitForTimeout(600);
    }
    await p.evaluate(() => scrollTo(0, 0));
    await p.locator("h1").first().focus();
    let checked = 0, obscured = [];
    for (let i = 0; i < 80; i++) {
      await p.keyboard.press("Tab");
      await p.waitForTimeout(30);
      const r = await p.evaluate(() => {
        const a = document.activeElement;
        if (!a || a === document.body) return null;
        const ar = a.getBoundingClientRect();
        const covers = [...document.querySelectorAll(".sticky-actions, .site-header")].filter(el => {
          const cs = getComputedStyle(el);
          return (cs.position === "sticky" || cs.position === "fixed") && !el.contains(a);
        });
        const hit = covers.find(el => {
          const r = el.getBoundingClientRect();
          // tertutup penuh = seluruh tinggi elemen fokus di bawah penutup
          return ar.top >= r.top && ar.bottom <= r.bottom && ar.left < r.right && ar.right > r.left;
        });
        return { label: (a.getAttribute("aria-label") || a.textContent || a.tagName).trim().slice(0, 40), hit: hit ? hit.className : null };
      });
      if (!r) continue;
      checked++;
      if (r.hit) obscured.push(r.label + " <- " + r.hit);
    }
    results.push(`${w}x${h} ${stage}: ${checked} fokus diperiksa, tertutup penuh: ${obscured.length}${obscured.length ? " " + JSON.stringify(obscured.slice(0, 5)) : ""}`);
  }
  await p.close();
}
console.log(results.join("\n"));
await b.close();
