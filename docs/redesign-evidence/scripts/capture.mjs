// Usage: node capture.mjs <outDir> <prefix>
import { chromium } from "playwright-core";
import fs from "node:fs";
const [out, prefix] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: "chrome", headless: true });
const results = {};
async function run(width, height, tag) {
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errs = [];
  // Full-page capture: action bar yang menempel ditampilkan di posisi alirannya (akhir halaman).
  p.fullShot = async (path) => {
    const h = await p.addStyleTag({ content: ".sticky-actions{position:static!important}" });
    await p.screenshot({ path, fullPage: true });
    await h.evaluate(n => n.remove());
  };
  p.on("pageerror", e => errs.push(e.message));
  await p.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  if (tag === "390") await p.screenshot({ path: `${out}/${prefix}-390-home.png` });
  else await p.screenshot({ path: `${out}/${prefix}-${tag}-home.png` });
  await p.getByRole("button", { name: /Buka contoh/ }).first().click();
  await p.waitForTimeout(600);
  await p.getByRole("button", { name: /Konfirmasi catatan timbang/ }).click();
  await p.waitForTimeout(900);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(300);
  const measure = () => p.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    main: Math.round(document.querySelector("main")?.getBoundingClientRect().height || 0),
    rows: document.querySelectorAll(".fish-row").length,
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
  }));
  const notaInitial = await measure();
  await p.fullShot(`${out}/${prefix}-${tag}-nota.png`);
  await p.screenshot({ path: `${out}/${prefix}-${tag}-nota-viewport.png` });
  // Fill Teri 10 kg (first empty kg input in data panel)
  const kgInputs = p.locator('input[placeholder="Belum diketahui"][inputmode="decimal"]');
  await kgInputs.first().fill("10");
  await p.waitForTimeout(400);
  const notaFilled = await measure();
  await p.fullShot(`${out}/${prefix}-${tag}-nota-filled.png`);
  const fab = p.locator(".chat-launcher, [aria-label='Buka bantuan Ombak Pintar']").first();
  const fabBox = await fab.boundingBox().catch(() => null);
  await p.getByRole("button", { name: /Konfirmasi nota/ }).click();
  await p.waitForTimeout(900);
  await p.evaluate(() => window.scrollTo(0, 0));
  const pairs = await measure();
  await p.fullShot(`${out}/${prefix}-${tag}-pasangan.png`);
  await p.screenshot({ path: `${out}/${prefix}-${tag}-pasangan-viewport.png` });
  // overlap check: FAB vs interactive/text elements in viewport
  const overlaps = await p.evaluate(() => {
    const fab = document.querySelector(".chat-launcher, [aria-label='Buka bantuan Ombak Pintar']");
    if (!fab) return { fab: null };
    const f = fab.getBoundingClientRect();
    const hits = [];
    for (const el of document.querySelectorAll("main button, main a, main h1, main h2, main h3, main strong, main p, main input")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || fab.contains(el)) continue;
      if (r.right > f.left && r.left < f.right && r.bottom > f.top && r.top < f.bottom)
        hits.push((el.tagName + ":" + (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40)));
    }
    return { fab: { x: Math.round(f.x), y: Math.round(f.y), w: Math.round(f.width), h: Math.round(f.height) }, hits: hits.slice(0, 12) };
  });
  // open chat
  await fab.click().catch(() => {});
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/${prefix}-${tag}-chat.png` });
  const chat = await p.evaluate(() => {
    const input = document.querySelector(".chat-form textarea, .chat-form input");
    const send = document.querySelector("[aria-label='Kirim pertanyaan']");
    const msgs = document.querySelector(".chat-messages");
    const r = el => el ? (({ top, bottom, height }) => ({ top: Math.round(top), bottom: Math.round(bottom), height: Math.round(height) }))(el.getBoundingClientRect()) : null;
    return { input: r(input), send: r(send), messages: r(msgs), vh: innerHeight };
  });
  // simulate virtual keyboard: shrink viewport height to 844-336
  await p.locator(".chat-form textarea, .chat-form input").first().focus().catch(() => {});
  await p.setViewportSize({ width, height: Math.max(400, height - 336) });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/${prefix}-${tag}-chat-keyboard.png` });
  const chatKb = await p.evaluate(() => {
    const input = document.querySelector(".chat-form textarea, .chat-form input");
    const send = document.querySelector("[aria-label='Kirim pertanyaan']");
    const msgs = document.querySelector(".chat-messages");
    const r = el => el ? (({ top, bottom, height }) => ({ top: Math.round(top), bottom: Math.round(bottom), height: Math.round(height) }))(el.getBoundingClientRect()) : null;
    return { input: r(input), send: r(send), messages: r(msgs), vh: innerHeight };
  });
  results[tag] = { notaInitial, notaFilled, fabBox, pairs, overlaps, chat, chatKb, errs };
  await ctx.close();
}
await run(390, 844, "390");
await run(1440, 900, "1440");
fs.writeFileSync(`${out}/${prefix}-metrics.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 1));
await b.close();
