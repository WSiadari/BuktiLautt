import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createVisionServer } from "./app.ts";
import { readConfig } from "./config.ts";

test("built site and authenticated API share the configured host", async () => {
  process.env.BUKTILAUT_ACCOUNT_DB_PATH = ":memory:";
  const directory = await mkdtemp(join(tmpdir(), "buktilaut-production-"));
  const dist = join(directory, "dist");
  const page = "<!doctype html><main>Frontend build fixture</main>";
  await mkdir(join(dist, "assets"), { recursive: true });
  await writeFile(join(dist, "index.html"), page);
  await writeFile(join(dist, "assets", "app-ab12cd34.js"), "console.log('frontend');");
  await writeFile(join(directory, "private.txt"), "fixture outside public build");
  await writeFile(join(dist, ".private"), "hidden fixture");
  const domain = "demo.buktilaut.test";
  const origin = "https://" + domain;
  const config = readConfig({
    BUKTILAUT_ALLOWED_HOSTS: "localhost," + domain,
    BUKTILAUT_COOKIE_SECURE: "true",
    VISION_ALLOWED_ORIGINS: origin,
  });
  const server = createVisionServer({ config, frontendRoot: dist });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;

  function send(path: string, method = "GET", headers: Record<string, string> = {}, data?: unknown) {
    return new Promise<{ status: number; text: string; headers: import("node:http").IncomingHttpHeaders }>((resolve, reject) => {
      const req = request({
        hostname: "127.0.0.1", port, path, method,
        headers: { Host: domain, Accept: "text/html", ...headers },
      }, (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => { text += chunk; });
        response.on("end", () => resolve({ status: response.statusCode!, text, headers: response.headers }));
        response.on("error", reject);
      });
      req.on("error", reject);
      req.end(data === undefined ? undefined : JSON.stringify(data));
    });
  }

  try {
    for (const route of ["/", "/masuk", "/daftar", "/dashboard", "/arsip?status=confirmed", "/tim"]) {
      const response = await send(route);
      assert.equal(response.status, 200, route);
      assert.equal(response.text, page, route);
      assert.match(String(response.headers["content-type"]), /^text\/html/);
      assert.equal(response.headers["cache-control"], "no-cache");
    }
    const head = await send("/arsip", "HEAD");
    assert.equal(head.status, 200);
    assert.equal(head.text, "");
    assert.equal(head.headers["content-length"], String(Buffer.byteLength(page)));
    const asset = await send("/assets/app-ab12cd34.js");
    assert.equal(asset.status, 200);
    assert.match(String(asset.headers["content-type"]), /^text\/javascript/);
    assert.match(String(asset.headers["cache-control"]), /immutable/);
    for (const missing of ["/api/unknown", "/api", "/%61pi/unknown", "/assets/missing.js", "/%2e%2e/private.txt", "/.private"]) {
      const response = await send(missing);
      assert.equal(response.status, 404, missing);
      assert.match(String(response.headers["content-type"]), /^application\/json/);
    }
    assert.equal((await send("/", "GET", { Host: "other.example" })).status, 403);

    const credentials = { email: "production-qa@example.invalid", password: "synthetic-test-only" };
    const headers = { Origin: origin, "Content-Type": "application/json", "X-BuktiLaut-Account": "1" };
    const registration = await send("/api/account/register", "POST", headers, { ...credentials, name: "QA sintetis" });
    assert.equal(registration.status, 200, registration.text);
    const login = await send("/api/account/login", "POST", headers, credentials);
    assert.equal(login.status, 200, login.text);
    const cookie = login.headers["set-cookie"]![0];
    assert.match(cookie, /; Secure(?:;|$)/);
    assert.match(cookie, /; HttpOnly(?:;|$)/);
    const session = { Cookie: cookie.split(";")[0] };
    assert.equal((await send("/api/archive", "GET", session)).status, 200);
    const logout = await send("/api/account/logout", "POST", { ...headers, ...session }, {});
    assert.equal(logout.status, 200);
    assert.match(logout.headers["set-cookie"]![0], /; Secure(?:;|$)/);
    assert.equal((await send("/api/archive", "GET", session)).status, 401);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
