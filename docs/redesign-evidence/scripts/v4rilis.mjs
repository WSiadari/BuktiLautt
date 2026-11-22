// node v4rilis.mjs <base> <folder-keluaran>
// Pemeriksaan rilis di build produksi (`npm start`):
// 1. Buka contoh -> Timbang -> Nota (Teri 10 kg) -> Pasangan -> catat 2 kg Teri
//    tidak terjual -> Laporan. Cek angka Teri 12 / 10 / 2 / sisa 0 dan Tongkol 8 / 8.
// 2. Pratinjau cetak laporan (media print, 390 px) dan PDF A4.
// 3. Masuk dengan akun sintetis (evaluation/seed-synthetic.mjs) dan tanyakan satu
//    pertanyaan arsip ke Ombak Pintar.
// Galat halaman, galat konsol, dan permintaan gagal dicatat di setiap bagian.
import { chromium } from "playwright-core";
import fs from "node:fs";

const [base = "http://127.0.0.1:8795", out] = process.argv.slice(2);
if (!out) throw new Error("Tentukan folder keluaran");
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const log = [];
const check = (label, ok, detail = "") => log.push(`${ok ? "LULUS" : "GAGAL"} ${label}${detail ? " · " + detail : ""}`);
const text = async (locator) => (await locator.innerText()).replace(/\s+/g, " ").trim();

function watch(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
  page.on("requestfailed", (r) => errors.push("requestfailed: " + r.url() + " " + (r.failure()?.errorText ?? "")));
  return errors;
}

// ---------- 1 dan 2: alur contoh sampai laporan, lalu pratinjau cetak ----------
for (const [w, h] of [[390, 844], [1440, 900]]) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = watch(page);
  const settle = (ms = 700) => page.waitForTimeout(ms);
  try {
    await page.goto(base + "/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^Buka contoh/ }).first().click();
    await settle();
    await page.getByRole("button", { name: /Konfirmasi catatan timbang/ }).click();
    await settle();
    await page.locator('input[placeholder="Belum diketahui"][inputmode="decimal"]').first().fill("10");
    await page.getByRole("button", { name: /Konfirmasi nota/ }).click();
    await settle();
    await page.getByRole("button", { name: /Konfirmasi pasangan Teri/ }).click();
    await settle(300);
    await page.getByRole("button", { name: /Konfirmasi pasangan Tongkol/ }).click();
    await settle(500);

    // Catat 2 kg Teri tidak terjual.
    const adjust = page.getByRole("button", { name: "Catat penyesuaian" });
    if (!(await adjust.isVisible())) await page.locator("#inspection-pair-" + (await page.evaluate(() => {
      const card = [...document.querySelectorAll(".pair-card")].find((el) => el.querySelector("h3")?.textContent === "Teri");
      return card?.id.replace("inspection-pair-", "");
    })) + " > summary").click();
    await adjust.click();
    await settle(400);
    await page.getByLabel("Berat tidak terjual (kg)").fill("2");
    await page.getByLabel("Keterangan Anda").fill("Dibawa pulang untuk lauk.");
    const previewSisa = await text(page.locator(".adjustment-preview strong"));
    check(`${w} pratinjau sisa jika disimpan`, previewSisa === "0 kg", previewSisa);
    await page.getByRole("button", { name: "Simpan penyesuaian" }).click();
    await settle(800);

    await page.getByRole("button", { name: /Lihat laporan/ }).click();
    await settle(900);
    await page.evaluate(() => scrollTo(0, 0));

    // Baris tabel laporan: Jenis, Timbang, Nota, Selisih awal, Tidak terjual, Sisa, ...
    const rows = await page.evaluate(() => {
      const table = [...document.querySelectorAll("table")].find((t) => /Tidak terjual/.test(t.textContent));
      if (!table) return null;
      const head = [...table.querySelectorAll("thead th")].map((c) => c.textContent.trim());
      return {
        head,
        body: [...table.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("th,td")].map((c) => c.textContent.replace(/\s+/g, " ").trim())),
      };
    });
    const teri = rows?.body.find((r) => r[0].startsWith("Teri"));
    const tongkol = rows?.body.find((r) => r[0].startsWith("Tongkol"));
    const col = (name) => rows?.head.indexOf(name);
    check(`${w} laporan Teri timbang 12 kg`, teri?.[col("Timbang")] === "12 kg", teri?.[col("Timbang")]);
    check(`${w} laporan Teri nota 10 kg`, teri?.[col("Nota")] === "10 kg", teri?.[col("Nota")]);
    check(`${w} laporan Teri tidak terjual 2 kg`, teri?.[col("Tidak terjual")] === "2 kg", teri?.[col("Tidak terjual")]);
    check(`${w} laporan Teri sisa 0 kg`, teri?.[col("Sisa")] === "0 kg", teri?.[col("Sisa")]);
    check(`${w} laporan Tongkol 8 / 8`, tongkol?.[col("Timbang")] === "8 kg" && tongkol?.[col("Nota")] === "8 kg", tongkol?.slice(0, 3).join(" | "));
    log.push(`     kolom: ${rows?.head.join(" | ")}`);
    for (const r of rows?.body ?? []) log.push(`     baris: ${r.join(" | ")}`);

    await page.screenshot({ path: `${out}/laporan-${w}.png` });
    if (w === 390) {
      await page.emulateMedia({ media: "print" });
      await settle(300);
      const printInfo = await page.evaluate(() => ({
        hidden: [".action-bar", ".site-header", ".chat-launcher", ".report-glance"].map((s) => {
          const el = document.querySelector(s);
          return `${s}:${el ? getComputedStyle(el).display : "tidak ada"}`;
        }),
        overflowX: document.documentElement.scrollWidth > innerWidth,
      }));
      check("390 cetak: header, action bar, tombol Ombak, ringkasan layar disembunyikan",
        printInfo.hidden.every((s) => /:(none|tidak ada)$/.test(s)), printInfo.hidden.join(", "));
      check("390 cetak: tanpa overflow horizontal", !printInfo.overflowX);
      await page.screenshot({ path: `${out}/laporan-cetak-390.png`, fullPage: true });
      fs.writeFileSync(`${out}/laporan-cetak-a4.pdf`, await page.pdf({ format: "A4", printBackground: true }));
      await page.emulateMedia({ media: "screen" });
    }
  } catch (e) {
    check(`${w} alur contoh`, false, e.message.split("\n")[0]);
  }
  check(`${w} alur contoh tanpa galat konsol/halaman`, errors.length === 0, errors.join(" ; "));
  await context.close();
}

// ---------- 3: akun sintetis dan Ombak Pintar ----------
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = watch(page);
  try {
    await page.goto(base + "/masuk", { waitUntil: "networkidle" });
    await page.locator("input[type=email]").fill("demo@buktilaut.test");
    await page.locator("input[type=password]").fill("Demo-Sintetis-48!");
    await page.locator("form button[type=submit]").click();
    await page.waitForURL(/dashboard/, { timeout: 15000 });
    await page.waitForTimeout(1200);
    check("masuk akun sintetis -> dashboard", true, page.url().replace(base, ""));
    await page.getByRole("button", { name: "Buka bantuan Ombak Pintar" }).first().click();
    await page.waitForTimeout(800);
    const question = "Berapa selisih berat bulan November 2026?";
    await page.getByPlaceholder(/Ketik pertanyaan/).fill(question);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelectorAll(".agent-messages .message:not(.user-message)").length >= 1, null, { timeout: 20000 });
    await page.waitForTimeout(600);
    const answer = await text(page.locator(".agent-messages .message:not(.user-message)").last());
    const mode = await page.evaluate(() => /Panduan dasar/.test(document.body.innerText) ? "Panduan dasar" : "AI");
    check("Ombak Pintar menjawab pertanyaan arsip", answer.length > 0, `mode ${mode}`);
    log.push(`     T: ${question}`);
    log.push(`     J: ${answer.slice(0, 400)}`);
    await page.screenshot({ path: `${out}/ombak-pintar-arsip-1440.png` });
  } catch (e) {
    check("akun sintetis dan Ombak Pintar", false, e.message.split("\n")[0]);
  }
  check("akun dan Ombak Pintar tanpa galat konsol/halaman", errors.length === 0, errors.join(" ; "));
  await context.close();
}

await browser.close();
fs.writeFileSync(`${out}/rilis.log`, log.join("\n") + "\n");
console.log(log.join("\n"));
