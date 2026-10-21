import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../state/auth.jsx";
import { Button, Field, Input } from "../components/ui/Glass.jsx";
import Logo from "../components/ui/Logo.jsx";

function loadGsiScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.getElementById("gsi-script");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const s = document.createElement("script");
    s.id = "gsi-script";
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google script"));
    document.head.appendChild(s);
  });
}

export default function AuthPage() {
  const { signIn } = useAuth();
  const [tab, setTab] = useState("signin");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleCfg, setGoogleCfg] = useState(null);
  const googleBtnRef = useRef(null);
  const isElectron = typeof window !== "undefined" && !!window.joiDesktop?.startGoogleDesktopOAuth;
  const [form, setForm] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    confirmPassword: "",
  });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleDesktopGoogle() {
    if (!googleCfg?.google_client_id) return;
    setBusy(true);
    setStatus("");
    try {
      const res = await window.joiDesktop.startGoogleDesktopOAuth(googleCfg.google_client_id);
      signIn(await api.googleDesktopSignIn(res));
    } catch (err) {
      setStatus(err.message || "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await api.authConfig();
        if (cancelled || !cfg.google_enabled || !cfg.google_client_id) return;
        setGoogleCfg(cfg);
        if (isElectron) return; // desktop app uses the IPC OAuth flow (button below)
        await loadGsiScript();
        if (cancelled || !window.google?.accounts?.id || !googleBtnRef.current) return;
        window.google.accounts.id.initialize({
          client_id: cfg.google_client_id,
          callback: async (resp) => {
            try {
              setBusy(true);
              signIn(await api.googleSignIn(resp.credential));
            } catch (err) {
              setStatus(err.message || "Google sign-in failed.");
            } finally {
              setBusy(false);
            }
          },
        });
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          width: 300,
        });
      } catch {
        /* hidden if unavailable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signIn, isElectron]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const payload =
        tab === "signin"
          ? await api.login(form.email, form.password)
          : await api.signup({
              first_name: form.firstName,
              last_name: form.lastName,
              email: form.email,
              password: form.password,
              confirm_password: form.confirmPassword,
            });
      signIn(payload);
    } catch (err) {
      setStatus(err.message || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-2">
      {/* Left: editorial brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-clay-gradient p-14 text-white lg:flex">
        <Logo size={44} light />
        <div>
          <h1 className="font-display text-6xl font-bold leading-[0.95] tracking-tight">
            Your calm,
            <br />
            capable
            <br />
            assistant.
          </h1>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-white/80">
            Chat, search, manage files, email and your calendar — running locally and privately on your machine.
          </p>
        </div>
        <div className="flex gap-6 text-sm text-white/70">
          <span>● Private</span>
          <span>● Secure</span>
          <span>● Voice</span>
        </div>
        <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 right-16 h-72 w-72 rounded-full bg-black/10 blur-2xl" />
      </div>

      {/* Right: form */}
      <div className="grid place-items-center p-6">
        <div className="w-[min(420px,100%)] animate-rise">
          <div className="mb-8">
            <Logo size={36} className="mb-5 lg:hidden" />
            <h2 className="font-display text-4xl font-bold tracking-tight text-ink">
              {tab === "signin" ? "Welcome back" : "Create account"}
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              {tab === "signin"
                ? "Sign in to continue to your assistant."
                : "A few details and you're in."}
            </p>
          </div>

          <div className="mb-6 inline-flex rounded-full bg-cream-200/70 p-1">
            {["signin", "signup"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-full px-5 py-2 text-sm font-medium transition ${
                  tab === t ? "bg-white text-ink shadow-soft" : "text-ink-muted hover:text-ink"
                }`}
              >
                {t === "signin" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">
            {tab === "signup" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="First name">
                  <Input value={form.firstName} onChange={set("firstName")} required />
                </Field>
                <Field label="Last name">
                  <Input value={form.lastName} onChange={set("lastName")} required />
                </Field>
              </div>
            )}
            <Field label="Email">
              <Input type="email" autoComplete="email" value={form.email} onChange={set("email")} required />
            </Field>
            <Field label="Password">
              <Input type="password" value={form.password} onChange={set("password")} required />
            </Field>
            {tab === "signup" && (
              <Field label="Confirm password">
                <Input type="password" value={form.confirmPassword} onChange={set("confirmPassword")} required />
              </Field>
            )}
            <Button type="submit" disabled={busy} className="mt-1 w-full py-3">
              {busy ? "Please wait…" : tab === "signin" ? "Sign In →" : "Create Account →"}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs text-ink-faint">
            <span className="h-px flex-1 bg-ink/10" />
            or continue with
            <span className="h-px flex-1 bg-ink/10" />
          </div>
          {isElectron ? (
            googleCfg?.google_enabled && (
              <button
                type="button"
                onClick={handleDesktopGoogle}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2.5 rounded-full border border-ink/15 bg-white px-5 py-3 text-sm font-medium text-ink shadow-soft transition hover:border-clay/50 disabled:opacity-50"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.28-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
                  <path fill="#FBBC05" d="M5.85 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.67-2.84Z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.67 2.84C6.72 7.3 9.14 5.38 12 5.38Z" />
                </svg>
                Continue with Google
              </button>
            )
          ) : (
            <div ref={googleBtnRef} className="flex justify-center" />
          )}

          {status && (
            <div className="mt-5 rounded-2xl border border-clay/30 bg-clay-50 px-4 py-3 text-sm text-clay-700">
              {status}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
