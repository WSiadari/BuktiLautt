import { chromium } from "playwright-core";
const out = process.argv[2];
const b = await chromium.launch({ channel: "chrome", headless: true });
for (const w of [320, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2 });
  await p.goto("http://127.0.0.1:4173/masuk", { waitUntil: "networkidle" });
  await p.locator("input[type=email]").fill("demo@buktilaut.test");
  await p.locator("input[type=password]").fill("Demo-Sintetis-48!");
  await p.locator("form button[type=submit]").click();
  await p.waitForURL(/dashboard/, { timeout: 15000 });
  await p.waitForTimeout(1500);
  await p.getByRole("button", { name: /Mulai pemeriksaan baru/ }).click();
  await p.waitForTimeout(1200);
  await p.goto("http://127.0.0.1:4173/dashboard", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  console.log(w, await p.locator(".dash-hero h2").innerText());
  await p.locator(".dash-hero").screenshot({ path: `${out}/${w}-dasbor-lanjutkan.png` });
  await p.close();
}
await b.close();
