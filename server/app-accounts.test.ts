import test from "node:test";
import assert from "node:assert/strict";
import { createVisionServer } from "./app.ts";
import { readConfig } from "./config.ts";

test("integrated account routes and basic archive agent require the real session and active workspace", async () => {
  process.env.BUKTILAUT_ACCOUNT_DB_PATH = ":memory:";
  const server = createVisionServer({ config: readConfig({ VISION_ENABLED: "false" }) });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const origin = "http://127.0.0.1:5173";
  const post = (path: string, body: unknown, cookie = "", extra: Record<string, string> = {}) => fetch(base + path, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie,
      "X-BuktiLaut-Account": "1", "X-BuktiLaut-Agent": "1", ...extra }, body: JSON.stringify(body),
  });
  try {
    const question = { requestId: "integrated-date-total", question: "Berapa total transaksi tanggal 11 November 2026?" };
    assert.equal((await post("/api/archive-agent", question)).status, 401);
    const registration = await post("/api/account/register", { email: "route-test@example.invalid", password: "synthetic-test-only", name: "Uji Sintetis" });
    assert.equal(registration.status, 200);
    const cookie = registration.headers.get("set-cookie")!.split(";")[0];
    const session = await registration.json();
    const archive = await fetch(base + "/api/archive?from=2026-11-11&to=2026-11-11", { headers: { Cookie: cookie } });
    assert.equal(archive.status, 200);
    const answer = await post("/api/archive-agent", question, cookie, { "X-BuktiLaut-Workspace": session.activeWorkspaceId });
    assert.equal(answer.status, 200);
    const result = await answer.json();
    assert.equal(result.provider.name, "basic");
    assert.equal(result.workspaceId, session.activeWorkspaceId);
    assert.equal(result.transactionCount, 0);
    assert.equal(result.totalRupiah, null);
    assert.equal(result.fromDate, "2026-11-11");
    assert.equal((await post("/api/archive-agent", { ...question, requestId: "wrong-workspace" }, cookie, { "X-BuktiLaut-Workspace": "other-workspace" })).status, 409);
    assert.equal((await post("/api/archive-agent", question, cookie, { Origin: "https://foreign.invalid" })).status, 403);
    assert.equal((await post("/api/account/logout", {}, cookie)).status, 200);
    assert.equal((await post("/api/archive-agent", question, cookie)).status, 401);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
