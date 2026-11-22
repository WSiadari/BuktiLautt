import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createVisionServer } from "./app.ts";
import { readConfig } from "./config.ts";

const config = readConfig();
// Bila `npm run build` sudah dijalankan, halaman dan API dilayani dari satu alamat.
const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const frontendRoot = existsSync(new URL("../dist/index.html", import.meta.url)) ? dist : undefined;
const server = createVisionServer({ config, frontendRoot });
const localOnly = config.allowedHosts.every(name => ["localhost", "127.0.0.1", "[::1]"].includes(name));
if (frontendRoot && !config.secureCookies && !localOnly)
  console.warn("Host publik terdeteksi. Pakai HTTPS dan BUKTILAUT_COOKIE_SECURE=true agar cookie sesi hanya dikirim lewat koneksi aman.");
const shownHost = config.host.includes(":") ? `[${config.host}]` : config.host;
server.listen(config.port, config.host, () => {
  console.log(`BuktiLaut ${frontendRoot ? "website dan API" : "API"} siap di http://${shownHost}:${config.port}. Pemrosesan AI eksternal ${config.enabled ? "diaktifkan pengelola" : "nonaktif"}.`);
});
