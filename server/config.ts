import { isIP } from "node:net";

export type VisionConfig = {
  enabled: boolean;
  privacyAcknowledged: boolean;
  apiKey: string;
  model: string;
  /** Port server. Mengikuti VISION_PORT, lalu PORT dari layanan hosting. */
  port: number;
  /** Alamat listen. Bawaan 127.0.0.1; isi 0.0.0.0 bila hosting membutuhkannya. */
  host: string;
  /** Nama host (tanpa skema dan port) yang boleh dilayani. */
  allowedHosts: string[];
  allowedOrigins: string[];
  /** Paksa atribut Secure pada cookie sesi, misalnya di belakang reverse proxy HTTPS. */
  secureCookies: boolean;
  timeoutMs: number;
  maxConcurrency: number;
  requestsPerMinute: number;
  requestsPerDay: number;
};
function integer(value: string | undefined, fallback: number, max: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) throw new Error("Invalid vision service numeric configuration");
  return parsed;
}
/** Ambil nama host dari header Host; null bila formatnya tidak valid. */
export function requestHostname(value: string): string | null {
  const match = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::([0-9]{1,5}))?$/i.exec(value);
  if (!match || (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535))) return null;
  const hostname = match[1].toLowerCase();
  if (hostname.startsWith("[")) return isIP(hostname.slice(1, -1)) === 6 ? hostname : null;
  return hostname.length <= 253 && hostname.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    ? hostname
    : null;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): VisionConfig {
  const model = env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  if (!/^gemini-[a-z0-9.-]{1,80}$/.test(model)) throw new Error("Invalid vision model configuration");
  const port = integer(env.VISION_PORT || env.PORT || undefined, 8787, 65535);
  const host = env.BUKTILAUT_HOST || "127.0.0.1";
  if (host !== "localhost" && !isIP(host)) throw new Error("BUKTILAUT_HOST harus berupa localhost atau alamat IP.");
  const allowedHosts = (env.BUKTILAUT_ALLOWED_HOSTS || "localhost,127.0.0.1")
    .split(",").map(value => value.trim().toLowerCase());
  if (allowedHosts.some(value => requestHostname(value) !== value))
    throw new Error("BUKTILAUT_ALLOWED_HOSTS harus berisi nama host tanpa skema atau port.");
  const cookieSecure = env.BUKTILAUT_COOKIE_SECURE || "false";
  if (cookieSecure !== "true" && cookieSecure !== "false")
    throw new Error("BUKTILAUT_COOKIE_SECURE harus true atau false.");
  const allowedOrigins = (env.VISION_ALLOWED_ORIGINS || `http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173,http://127.0.0.1:${port},http://localhost:${port}`).split(",").map(value => value.trim());
  for (const origin of allowedOrigins) {
    const parsed = new URL(origin);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password) throw new Error("Invalid vision origin configuration");
  }
  return {
    enabled: env.VISION_ENABLED === "true", privacyAcknowledged: env.VISION_DATA_PROCESSING_ACKNOWLEDGED === "true",
    apiKey: env.GEMINI_API_KEY || "", model,
    port, host, allowedHosts, allowedOrigins, secureCookies: cookieSecure === "true",
    timeoutMs: integer(env.VISION_TIMEOUT_MS, 30_000, 180_000),
    maxConcurrency: integer(env.VISION_MAX_CONCURRENCY, 2, 4),
    requestsPerMinute: integer(env.VISION_REQUESTS_PER_MINUTE, 6, 60),
    requestsPerDay: integer(env.VISION_REQUESTS_PER_DAY, 30, 1000),
  };
}
export function unavailableReason(config: VisionConfig): string | null {
  if (!config.enabled) return "Integrasi AI belum diaktifkan oleh pengelola. Gunakan pengisian manual.";
  if (!config.privacyAcknowledged) return "Pengelola belum menyetujui pengiriman dokumen ke penyedia AI. Gunakan pengisian manual.";
  if (!config.apiKey) return "Kredensial layanan AI belum tersedia di server. Gunakan pengisian manual.";
  return null;
}
