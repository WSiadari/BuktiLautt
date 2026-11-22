import { createReadStream, realpathSync, statSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};
const pages = new Set(["/", "/masuk", "/daftar", "/dashboard", "/arsip", "/tim"]);

export function createFrontendHandler(directory: string) {
  let root: string;
  try {
    root = realpathSync(directory);
    if (!statSync(join(root, "index.html")).isFile()) throw new Error();
  } catch {
    throw new Error("Hasil build belum tersedia. Jalankan npm run build sebelum npm start.");
  }

  async function findFile(pathname: string) {
    try {
      const file = await realpath(resolve(root, "." + pathname));
      const fromRoot = relative(root, file);
      if (isAbsolute(fromRoot) || fromRoot === ".." || fromRoot.startsWith(".." + sep))
        return null;
      const info = await stat(file);
      return info.isFile() ? { file, size: info.size } : null;
    } catch (error) {
      if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? ""))
        return null;
      throw error;
    }
  }

  return async function serveFrontend(request: IncomingMessage, response: ServerResponse) {
    if (request.method !== "GET" && request.method !== "HEAD") return false;
    let path: string;
    try {
      path = decodeURIComponent((request.url || "/").split("?", 1)[0]);
    } catch {
      return false;
    }
    if (
      !path.startsWith("/") || path.startsWith("//") ||
      path.includes("\\") || path.includes("\0") || path.includes(":") ||
      path.split("/").some((part) => part.startsWith(".")) ||
      /^\/api(?:\/|$)/i.test(path)
    ) return false;

    let asset = await findFile(path);
    if (!asset && !extname(path) && !/^\/(?:assets|brand)(?:\/|$)/.test(path)) {
      const html = (request.headers.accept || "").includes("text/html");
      if (html || pages.has(path.replace(/\/+$/, "") || "/"))
        asset = await findFile("/index.html");
    }
    if (!asset) return false;
    const ext = extname(asset.file).toLowerCase();
    const hashed = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i.test(path);
    response.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Content-Length": asset.size,
      "Cache-Control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") response.end();
    else await pipeline(createReadStream(asset.file), response);
    return true;
  };
}
