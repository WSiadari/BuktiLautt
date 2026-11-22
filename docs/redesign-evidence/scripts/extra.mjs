import { chromium } from "playwright-core";
const [out] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await p.getByRole("button", { name: /^Buka contoh/ }).first().click(); await p.waitForTimeout(400);
await p.getByRole("button", { name: /Konfirmasi catatan timbang/ }).click(); await p.waitForTimeout(600);
await p.locator('input[placeholder="Belum diketahui"][inputmode="decimal"]').first().fill("10");
await p.getByRole("button", { name: /Konfirmasi nota/ }).click(); await p.waitForTimeout(600);
// kembali ke Nota: isian Rp0 kini terkonfirmasi
await p.getByRole("button", { name: /Kembali ke nota/ }).click(); await p.waitForTimeout(600);
await p.locator(".nota-amounts").scrollIntoViewIfNeeded();
await p.evaluate(() => scrollBy(0, 120));
console.log("potongan:", await p.locator("#deduction-state").innerText(), "| biaya:", await p.locator("#charges-state").innerText(), "| tombol Isi Rp0:", await p.getByRole("button", { name: /Isi Rp0/ }).count());
await p.screenshot({ path: `${out}/after-390-nota-rp0-terkonfirmasi.png` });
// dock Ombak di samping tombol utama, lalu panel dibuka dari dock
const dock = await p.locator(".ombak-dock").boundingBox();
const primary = await p.getByRole("button", { name: /Konfirmasi nota/ }).boundingBox();
console.log("dock", JSON.stringify(dock), "primary", JSON.stringify(primary), "tumpang tindih:", !(dock.x + dock.width <= primary.x || primary.x + primary.width <= dock.x || dock.y + dock.height <= primary.y || primary.y + primary.height <= dock.y));
await p.locator(".ombak-dock").click(); await p.waitForTimeout(600);
await p.screenshot({ path: `${out}/after-390-chat-dari-dock.png` });
await p.keyboard.press("Escape"); await p.waitForTimeout(400);
console.log("fokus kembali ke:", await p.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.className));
await p.goto("http://127.0.0.1:5173/daftar", { waitUntil: "networkidle" });
await p.screenshot({ path: `${out}/after-390-daftar.png`, fullPage: true });
console.log("daftar overflowX:", await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));
// ukuran maskot yang benar-benar dimuat browser
const p2 = await b.newPage({ viewport: { width: 390, height: 844 } });
const imgs = [];
p2.on("response", async (r) => { if (/ombak|timbang-pesisir|\.webp|\.png/.test(r.url())) { const body = await r.body().catch(() => null); imgs.push(r.url().replace(/^https?:\/\/[^/]+/, "") + " " + (body ? body.length : "?") + " B"); } });
await p2.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await p2.goto("http://127.0.0.1:5173/masuk", { waitUntil: "networkidle" });
console.log("gambar dimuat:", JSON.stringify([...new Set(imgs)]));
await b.close();
