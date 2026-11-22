import test from "node:test";
import assert from "node:assert/strict";
import { readGoogleConfig, makeGoogleAuth } from "./accounts/google.ts";
import { AccountStore } from "./accounts/store.ts";

test("Google OAuth uses a validated same-origin redirect, state, nonce and an expiring one-time PKCE flow", () => {
  const env = {
    GOOGLE_OAUTH_CLIENT_ID: "test-client",
    GOOGLE_OAUTH_CLIENT_SECRET: "test-secret",
    GOOGLE_OAUTH_REDIRECT_URI: "http://127.0.0.1:5173/api/account/google/callback",
  };
  const config = readGoogleConfig(env)!;
  assert.equal(config.origin, "http://127.0.0.1:5173");
  assert.equal(readGoogleConfig({ ...env, GOOGLE_OAUTH_REDIRECT_URI: "http://example.org/api/account/google/callback" }), null);
  const google = makeGoogleAuth(config);
  const request = google.start({ mode: "register" });
  const url = new URL(request.authorizationUrl);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("state"), request.state);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.match(url.searchParams.get("code_challenge")!, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(!request.authorizationUrl.includes("test-secret"));
  assert.equal(google.consume("x".repeat(43), request.state), null);
  const flow = google.consume(request.state, request.state);
  assert.equal(flow?.nonce, url.searchParams.get("nonce"));
  assert.equal(flow?.intent.mode, "register");
  assert.equal(google.consume(request.state, request.state), null);
});

test("Google accounts reuse their provider identity and existing email accounts require explicit linking", async () => {
  const store = new AccountStore(":memory:");
  try {
    const profile = { subject: "google-1", email: "first@example.com", name: "Nelayan" };
    const initial = store.authenticate(store.loginWithGoogle(profile))!;
    const again = store.authenticate(store.loginWithGoogle(profile))!;
    assert.equal(again.userId, initial.userId);
    assert.equal(again.workspaceId, initial.workspaceId);
    const existing = store.authenticate(await store.register("second@example.com", "local-test-password", "Petugas"))!;
    const secondProfile = { subject: "google-2", email: existing.email, name: "Petugas" };
    assert.throws(() => store.loginWithGoogle(secondProfile), { code: "GOOGLE_LINK_REQUIRED" });
    assert.throws(() => store.linkGoogle(existing, profile), { code: "GOOGLE_EMAIL_MISMATCH" });
    store.linkGoogle(existing, secondProfile);
    assert.equal(store.authenticate(store.loginWithGoogle(secondProfile))?.userId, existing.userId);
  } finally {
    store.close();
  }
});
