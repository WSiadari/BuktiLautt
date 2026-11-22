// node v4hero.mjs <base> <folder-keluaran>
// Bukti hero beranda v4. Untuk setiap ukuran (320x700, 390x844, 768x1024,
// 1440x900): screenshot layar pertama dan halaman penuh, lalu ukur tinggi hero,
// chip yang tampil, tumpang tindih chip (antar-chip, wajah maskot, judul),
// tombol Ombak Pintar (.ombak-fab) saat digulir, overflow horizontal, dan
// galat halaman/konsol. Hasil ukur ditulis ke <folder>/ukur.json.
import { chromium } from "playwright-core";
import fs from "node:fs";

const [base = "http://127.0.0.1:8795", out] = process.argv.slice(2);
if (!out) throw new Error("Tentukan folder keluaran");
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
// SIZES=900x800,1024x768 untuk ukuran lain (misalnya batas breakpoint).
const sizes = process.env.SIZES
  ? process.env.SIZES.split(",").map((s) => s.split("x").map(Number))
  : [[320, 700], [390, 844], [768, 1024], [1440, 900]];
const results = [];

// Wajah maskot dalam koordinat relatif gambar 1332x1181 (area putih, mata, mulut).
const FACE = { x0: 0.36, x1: 0.76, y0: 0.3, y1: 0.6 };

for (const [w, h] of sizes) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
  page.on("requestfailed", (r) => errors.push("requestfailed: " + r.url() + " " + (r.failure()?.errorText ?? "")));
  await page.goto(base + "/", { waitUntil: "networkidle" });
  // Teks pembuka memakai max-width 34ch. Chrome kadang menghitung `ch` dengan
  // font cadangan bila Plus Jakarta Sans belum termuat, dan tidak menghitung
  // ulang setelahnya (lebar 293 atau 398 px di 768 px). Tunggu font, lalu paksa
  // hitung ulang gaya teks itu agar sebelum dan sesudah diukur dalam keadaan
  // yang sama: font sudah termuat.
  await page.evaluate(async () => {
    await document.fonts.ready;
    const lead = document.querySelector(".hero-v2-lead");
    lead.style.maxWidth = "1px";
    void lead.offsetWidth;
    lead.style.maxWidth = "";
    void lead.offsetWidth;
  });
  await page.waitForTimeout(1500);

  const measure = () =>
    page.evaluate((FACE) => {
      const box = (b) => b && { x: Math.round(b.left), y: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) };
      const hit = (a, b) => !!(a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom);
      const hero = document.querySelector(".hero-v2").getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(document.querySelector(".hero-v2 h1"));
      const title = range.getBoundingClientRect();
      const art = document.querySelector(".hero-v2-stage .ombak-hero-art")?.getBoundingClientRect();
      const face = art && {
        left: art.left + art.width * FACE.x0, right: art.left + art.width * FACE.x1,
        top: art.top + art.height * FACE.y0, bottom: art.top + art.height * FACE.y1,
      };
      const chips = [...document.querySelectorAll(".hero-v2-stage .float-chip")]
        .filter((el) => getComputedStyle(el).display !== "none")
        .map((el) => ({ el, rect: el.getBoundingClientRect(), text: el.textContent.replace(/\s+/g, " ").trim() }));
      const pairs = [];
      for (let i = 0; i < chips.length; i++)
        for (let j = i + 1; j < chips.length; j++)
          if (hit(chips[i].rect, chips[j].rect)) pairs.push([chips[i].text, chips[j].text]);
      const fab = document.querySelector(".ombak-fab")?.getBoundingClientRect();
      return {
        scrollY: Math.round(scrollY),
        heroHeight: Math.round(hero.height),
        stageHeight: Math.round(document.querySelector(".hero-v2-stage").getBoundingClientRect().height),
        leadWidth: Math.round(document.querySelector(".hero-v2-lead").getBoundingClientRect().width),
        chips: chips.map((c) => ({ text: c.text, ...box(c.rect), anim: getComputedStyle(c.el).animationName })),
        chipPairsOverlap: pairs,
        chipsOnFace: chips.filter((c) => hit(c.rect, face)).map((c) => c.text),
        chipsOnTitle: chips.filter((c) => hit(c.rect, title)).map((c) => c.text),
        chipsOutsideStage: chips.filter((c) => c.rect.left < 0 || c.rect.right > innerWidth).map((c) => c.text),
        fabOnChip: chips.filter((c) => hit(c.rect, fab)).map((c) => c.text),
        fabOnTitle: hit(fab, title),
        title: box(title),
        face: face && box(face),
        overflowX: document.documentElement.scrollWidth > innerWidth,
        srSummary: document.querySelector(".hero-v2 .sr-only")?.textContent ?? null,
      };
    }, FACE);

  const initial = await measure();
  // Gulir per 20 px sampai hero hilang dari layar: tombol mengambang tidak boleh menutupi chip atau judul.
  const fabHits = [];
  for (let y = 0; y <= initial.heroHeight; y += 20) {
    await page.evaluate((v) => scrollTo(0, v), y);
    await page.waitForTimeout(25);
    const m = await measure();
    if (m.fabOnChip.length || m.fabOnTitle) fabHits.push({ scrollY: m.scrollY, chips: m.fabOnChip, title: m.fabOnTitle });
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(300);

  const label = `${w}x${h}`;
  await page.screenshot({ path: `${out}/beranda-${label}.png` });
  const tag = await page.addStyleTag({ content: ".site-header{position:static!important}" });
  await page.screenshot({ path: `${out}/beranda-${label}-penuh.png`, fullPage: true });
  await tag.evaluate((n) => n.remove());

  // Gerak: dengan prefers-reduced-motion, chip tidak boleh punya animasi.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(100);
  const reduced = await page.evaluate(() =>
    [...document.querySelectorAll(".hero-v2-stage .float-chip")].map((el) => getComputedStyle(el).animationName),
  );

  results.push({ viewport: label, ...initial, fabHitsWhileScrolling: fabHits, reducedMotionAnimations: reduced, errors });
  await context.close();
}
await browser.close();
fs.writeFileSync(`${out}/ukur.json`, JSON.stringify(results, null, 1) + "\n");
for (const r of results)
  console.log(
    `${r.viewport}: hero ${r.heroHeight}px (panggung ${r.stageHeight}, teks pembuka ${r.leadWidth}) · chip ${r.chips.length} · antar-chip ${r.chipPairsOverlap.length} · wajah ${r.chipsOnFace.length} · judul ${r.chipsOnTitle.length} · keluar ${r.chipsOutsideStage.length} · fab ${r.fabHitsWhileScrolling.length} · overflowX ${r.overflowX} · galat ${r.errors.length}`,
  );
