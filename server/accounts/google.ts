import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { AccountFailure } from "./store.ts";

const authorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenEndpoint = "https://oauth2.googleapis.com/token";
const callbackPath = "/api/account/google/callback";
export const googleCookie = "buktilaut_google_flow";
const timeoutSeconds = 600;

export function readGoogleConfig(env = process.env) {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const redirectUri = env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  try {
    const uri = new URL(redirectUri);
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(uri.hostname);
    if ((!loopback || uri.protocol !== "http:") && uri.protocol !== "https:") return null;
    if (uri.pathname !== callbackPath || uri.search || uri.hash || uri.username || uri.password) return null;
    return { clientId, clientSecret, redirectUri, origin: uri.origin, secure: uri.protocol === "https:" };
  } catch {
    return null;
  }
}

type Config = NonNullable<ReturnType<typeof readGoogleConfig>>;
type Intent = { mode: "login" | "register" } | { mode: "link"; sessionHash: string };
type Flow = {
  nonce: string;
  verifier: string;
  expiresAt: number;
  intent: Intent;
};
const random = () => randomBytes(32).toString("base64url");

export function makeGoogleAuth(config: Config) {
  const pending = new Map<string, Flow>();
  const client = new OAuth2Client(config.clientId);

  function start(intent: Intent) {
    const now = Date.now();
    for (const [state, flow] of pending)
      if (flow.expiresAt <= now) pending.delete(state);
    if (pending.size >= 1000)
      throw new AccountFailure(429, "RATE_LIMITED", "Banyak percobaan masuk sedang berlangsung. Coba sebentar lagi.");
    const state = random();
    const nonce = random();
    const verifier = random();
    const url = new URL(authorizationEndpoint);
    url.search = new URLSearchParams({
      client_id: config.clientId, redirect_uri: config.redirectUri,
      response_type: "code", scope: "openid email profile", state, nonce,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256", prompt: "select_account",
    }).toString();
    pending.set(state, { nonce, verifier, intent, expiresAt: now + timeoutSeconds * 1000 });
    return { state, authorizationUrl: url.href };
  }

  function consume(cookie: string | undefined, state: string | null) {
    if (!cookie || !state || !/^[A-Za-z0-9_-]{43}$/.test(state) ||
        !/^[A-Za-z0-9_-]{43}$/.test(cookie) ||
        !timingSafeEqual(Buffer.from(state), Buffer.from(cookie))) return null;
    const flow = pending.get(state);
    pending.delete(state);
    return flow && flow.expiresAt > Date.now() ? flow : null;
  }

  async function verify(code: string, flow: Flow) {
    const tokenResponse = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: config.clientId, client_secret: config.clientSecret,
        redirect_uri: config.redirectUri, grant_type: "authorization_code", code_verifier: flow.verifier,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
    if (!tokenResponse.ok) {
      await tokenResponse.body?.cancel();
      throw new Error("Google token exchange failed");
    }
    const { id_token: idToken } = await tokenResponse.json();
    if (typeof idToken !== "string" || idToken.length > 16_384) throw new Error("Missing ID token");
    const ticket = await client.verifyIdToken({ idToken, audience: config.clientId });
    const claims = ticket.getPayload() as (ReturnType<typeof ticket.getPayload> & { nonce?: string });
    if (!claims || claims.nonce !== flow.nonce || !claims.email_verified || !claims.email ||
        claims.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email) ||
        typeof claims.sub !== "string" || !/^[A-Za-z0-9_-]{1,255}$/.test(claims.sub) ||
        (claims.azp && claims.azp !== config.clientId)) throw new Error("Invalid identity");
    return {
      subject: claims.sub,
      email: claims.email.toLowerCase(),
      name: claims.name?.trim().slice(0, 100) || claims.email.split("@")[0].slice(0, 100),
    };
  }

  function flowCookie(state = "") {
    return `${googleCookie}=${state}; Path=/api/account/google; HttpOnly; SameSite=Lax; Max-Age=${state ? timeoutSeconds : 0}${config.secure ? "; Secure" : ""}`;
  }

  return { start, consume, verify, flowCookie, ...config };
}
