// node beranda-fab.mjs <base> [folder-keluaran]
// Mengukur tombol Ombak Pintar (.ombak-fab) terhadap judul bagian di bawah hero
// pada 390x844 di beberapa posisi gulir. Bila folder keluaran diberikan, juga
// menyimpan screenshot beranda 390x844 dan 1440x900 (layar pertama dan penuh).
import { chromium } from "playwright-core";
import fs from "node:fs";

const [base = "http://127.0.0.1:8791", out] = process.argv.slice(2);
if (out) fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });

for (const [w, h] of [[390, 844], [1440, 900]]) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const measure = () =>
    page.evaluate(() => {
      const fab = document.querySelector(".ombak-fab")?.getBoundingClientRect();
      const h2 = document.querySelector("#how-heading");
      const range = document.createRange();
      range.selectNodeContents(h2);
      const text = range.getBoundingClientRect();
      const kicker = document.querySelector(".how-v2 > .section-kicker")?.getBoundingClientRect();
      const r = (b) => b && { x: Math.round(b.left), y: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) };
      const overlap = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const gapX = (a, b) => Math.round(Math.max(a.left - b.right, b.left - a.right));
      const gapY = (a, b) => Math.round(Math.max(a.top - b.bottom, b.top - a.bottom));
      return {
        scrollY: Math.round(scrollY),
        heading: h2.textContent,
        fab: r(fab),
        headingText: r(text),
        overlapHeading: overlap(fab, text),
        overlapKicker: overlap(fab, kicker),
        gapX: gapX(fab, text),
        gapY: gapY(fab, text),
        overflowX: document.documentElement.scrollWidth > innerWidth,
      };
    });

  if (w === 390) {
    const maxY = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const rows = [];
    for (let y = 0; y <= maxY; y += 20) {
      await page.evaluate((v) => scrollTo(0, v), y);
      await page.waitForTimeout(30);
      rows.push(await measure());
    }
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(200);
    const first = await measure();
    const hits = rows.filter((m) => m.overlapHeading || m.overlapKicker);
    const minGapX = Math.min(...rows.filter((m) => m.gapY < 0).map((m) => m.gapX));
    console.log(JSON.stringify({ viewport: `${w}x${h}`, initial: first, positions: rows.length, overlaps: hits.length, minHorizontalGapWhenSameRow: minGapX }, null, 1));
  } else {
    console.log(JSON.stringify({ viewport: `${w}x${h}`, initial: await measure() }));
  }

  if (out) {
    const label = `${w}x${h}`;
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/beranda-${label}.png` });
    const tag = await page.addStyleTag({ content: ".site-header{position:static!important}" });
    await page.screenshot({ path: `${out}/beranda-${label}-penuh.png`, fullPage: true });
    await tag.evaluate((n) => n.remove());
  }
  if (errors.length) console.log("pageerror", errors);
  await context.close();
}
await browser.close();
