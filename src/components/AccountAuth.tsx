import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  getGoogleAvailability,
  loginAccount,
  registerAccount,
  startGoogleAccount,
  type AccountSession,
  type GoogleAvailability,
} from "../services/accounts";
import { OmbakPintar } from "./OmbakPintar";
import { Icon } from "./ui";

const googleErrors: Record<string, string> = {
  dibatalkan: "Proses masuk dengan Google dibatalkan. Silakan coba lagi.",
  gagal: "Google belum dapat memastikan identitas Anda. Coba lagi atau gunakan email.",
  hubungkan: "Email ini sudah punya akun BuktiLaut. Masuk dengan kata sandi, lalu hubungkan Google dari Dashboard.",
};
const googleHints = {
  checking: "Memeriksa layanan Google…",
  configuration: "Google belum tersedia. Silakan gunakan email Anda.",
  origin: "Google tersedia di alamat BuktiLaut yang dikonfigurasi. Gunakan email di halaman ini.",
  offline: "Layanan Google belum dapat diperiksa. Gunakan email atau muat ulang halaman.",
};
export function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.2C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.24 5.47-4.76 7.16l7.73 6C44.42 38 46.98 31.82 46.98 24.55z"/>
      <path fill="#FBBC05" d="M10.53 28.58a14.4 14.4 0 0 1 0-9.16l-7.98-6.2a24 24 0 0 0 0 21.56z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.82l-7.73-6c-2.15 1.45-4.93 2.32-8.18 2.32-6.26 0-11.57-4.22-13.47-9.92l-7.98 6.2C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

type AuthProps = {
  mode: "login" | "register";
  onSession: (session: AccountSession) => void;
  onNavigate: (path: string) => void;
  onBack: () => void;
};

export function AccountAuth({ mode, onSession, onNavigate, onBack }: AuthProps) {
  const isRegister = mode === "register";
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  const [googleStatus, setGoogleStatus] = useState<GoogleAvailability["reason"] | "checking" | "offline">("checking");
  const [error, setError] = useState(() => googleErrors[new URLSearchParams(location.search).get("google") || ""] || "");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const operation = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    heading.current?.focus();
    const controller = new AbortController();
    getGoogleAvailability(controller.signal)
      .then(result => { if (!controller.signal.aborted) setGoogleStatus(result.available ? null : result.reason ?? "configuration"); })
      .catch(() => { if (!controller.signal.aborted) setGoogleStatus("offline"); });
    return () => { controller.abort(); operation.current?.abort(); };
  }, []);
  async function run(kind: "email" | "google", action: (signal: AbortSignal) => Promise<void>) {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(kind); setError("");
    try { await action(controller.signal); }
    catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Permintaan belum berhasil. Silakan coba lagi."); }
    finally { operation.current = null; if (!controller.signal.aborted) setBusy(null); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email") || "");
    const password = String(fields.get("password") || "");
    const name = String(fields.get("name") || "");
    void run("email", async signal => {
      const session = isRegister ? await registerAccount({ email, password, name }, signal) : await loginAccount({ email, password }, signal);
      if (!signal.aborted) onSession(session);
    });
  }
  return (
    <div className="auth-page auth-v2" role="dialog" aria-modal="true" aria-labelledby="auth-heading" ref={panel}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); onBack(); }
        if (event.key !== "Tab") return;
        const items = [...(panel.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled)') || [])].filter(item => item.getClientRects().length);
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <div className="auth-shell auth-card">
        <div className="auth-card-mascot" aria-hidden="true">
          <OmbakPintar mood={busy ? "thinking" : error ? "error" : "welcome"} size="hero" />
        </div>
        <div className="auth-card-top">
          <a href="/" className="auth-back" onClick={event => { event.preventDefault(); onBack(); }}><Icon name="arrow-left" size={17} /> Kembali</a>
          <a href="/" className="auth-brand" aria-label="BuktiLaut, kembali ke halaman sebelumnya" onClick={event => { event.preventDefault(); onBack(); }}>
            <img src="/brand/buktilaut-horizontal.svg" alt="BuktiLaut" width="132" />
          </a>
        </div>
        <section className="auth-content" aria-labelledby="auth-heading">
          <h1 id="auth-heading" ref={heading} tabIndex={-1}>{isRegister ? "Buat akun baru" : "Selamat datang kembali"}</h1>
          <p className="auth-intro">{isRegister ? "Simpan pemeriksaan dan buka dari HP mana pun." : "Masuk untuk membuka arsip dan ruang kerja Anda."}</p>
          {error && <p className="auth-error" role="alert"><Icon name="alert" size={18} />{error}</p>}
          <button type="button" className="auth-google" disabled={!!busy || googleStatus !== null} aria-describedby={googleStatus ? "auth-google-hint" : undefined}
            onClick={() => void run("google", async signal => { const { authorizationUrl } = await startGoogleAccount(mode, signal); if (!signal.aborted) location.assign(authorizationUrl); })}>
            <GoogleMark />{busy === "google" ? "Membuka Google…" : isRegister ? "Daftar dengan Google" : "Masuk dengan Google"}
          </button>
          {googleStatus && <p id="auth-google-hint" className="auth-hint auth-google-hint" role="status">{googleHints[googleStatus]}</p>}
          <div className="auth-divider"><span>atau gunakan email</span></div>
          <form className="auth-form" onSubmit={submit} aria-busy={busy === "email"}
            onInvalid={event => { const input = event.target as HTMLInputElement; setInvalid(current => ({ ...current, [input.name]: true })); }}
            onInput={event => { const input = event.target as HTMLInputElement; setInvalid(current => ({ ...current, [input.name]: false })); setError(""); }}>
            {isRegister && <label>Nama lengkap<input name="name" autoComplete="name" placeholder="Nama Anda" required maxLength={100} disabled={!!busy} aria-invalid={invalid.name || undefined} /></label>}
            <label>Email<input name="email" type="email" autoComplete="username" placeholder="nama@email.com" required disabled={!!busy} aria-invalid={invalid.email || undefined} /></label>
            <div className="auth-password-field">
              <label htmlFor="auth-password">Kata sandi</label>
              <div className="auth-password-control">
                <input id="auth-password" name="password" type={passwordVisible ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} placeholder={isRegister ? "Buat kata sandi" : "Masukkan kata sandi"} required minLength={10} maxLength={128} disabled={!!busy} aria-invalid={invalid.password || undefined} aria-describedby={isRegister || invalid.password ? "auth-password-hint" : undefined} />
                <button type="button" className="auth-password-toggle" aria-label={passwordVisible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} aria-controls="auth-password" aria-pressed={passwordVisible} onClick={() => setPasswordVisible(value => !value)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {passwordVisible ? <path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10 10 0 0 1 12 5c6.3 0 10 7 10 7a17 17 0 0 1-3.1 3.8M6.5 6.5A19 19 0 0 0 2 12s3.7 7 10 7a11 11 0 0 0 5.5-1.5" /> : <><path d="M2 12s3.7-7 10-7 10 7 10 7-3.7 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>}
                  </svg>
                </button>
              </div>
              {(isRegister || invalid.password) && <p id="auth-password-hint" className={invalid.password ? "auth-field-error" : "auth-hint"}>{invalid.password ? "Isi kata sandi dengan 10–128 karakter." : "Minimal 10 karakter. Pilih yang sulit ditebak."}</p>}
            </div>
            <button type="submit" className="button primary auth-submit" disabled={!!busy}>
              {busy === "email" && <span className="auth-spinner" aria-hidden="true" />}{busy === "email" ? isRegister ? "Membuat akun…" : "Sedang masuk…" : isRegister ? "Buat akun" : "Masuk"} {!busy && <Icon name="arrow" />}
            </button>
          </form>
          <p className="auth-switch">{isRegister ? "Sudah punya akun? " : "Belum punya akun? "}<a href={isRegister ? "/masuk" : "/daftar"} onClick={event => { event.preventDefault(); onNavigate(isRegister ? "/masuk" : "/daftar"); }}>{isRegister ? "Masuk" : "Daftar sekarang"}</a></p>
        </section>
      </div>
    </div>
  );
}
