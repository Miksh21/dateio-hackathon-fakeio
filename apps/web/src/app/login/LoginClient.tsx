"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { dict, type Locale } from "@/lib/i18n";
import { DEMO_MODE, DEMO_PASSWORD, DEMO_USERS, type DemoUser } from "@/lib/demo";
import { buttonClass } from "@/components/ui";
import { Icon } from "@/components/Icon";

export function LoginClient() {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("en");
  const [view, setView] = useState<"demo" | "email">(DEMO_MODE ? "demo" : "email");
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [goingTo, setGoingTo] = useState<string | null>(null);
  const [roster, setRoster] = useState<DemoUser[]>(DEMO_USERS);
  const t = dict[locale];
  const cs = locale === "cs";

  // Load the full roster for the picker (falls back to the hardcoded cohort).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.rpc("demo_roster");
        if (active && Array.isArray(data) && data.length) setRoster(data as DemoUser[]);
      } catch {
        /* keep fallback */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return roster
      .filter((u) => !q || `${u.first_name} ${u.last_name} ${u.email} ${u.division ?? ""}`.toLowerCase().includes(q))
      .slice(0, 50);
  }, [query, roster]);

  async function pickDemo(u: DemoUser) {
    setGoingTo(u.email);
    setError(null);
    try {
      const supabase = createClient();
      const { error: sErr } = await supabase.auth.signInWithPassword({ email: u.email, password: DEMO_PASSWORD });
      if (sErr) throw sErr;
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGoingTo(null);
    }
  }

  async function requestCode(): Promise<boolean> {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: allowed, error: rpcErr } = await supabase.rpc("can_login", { p_email: email.trim() });
      if (rpcErr) throw rpcErr;
      if (!allowed) {
        setError(t.notInDirectory);
        return false;
      }
      const { error: otpErr } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
      if (otpErr) throw otpErr;
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function onSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (await requestCode()) setStep("code");
  }

  async function onResend() {
    if (await requestCode()) setInfo(t.codeResent);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: vErr } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
      if (vErr) throw vErr;
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-4">
      <div className="w-full max-w-sm">
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.06]">
          <div className="flex items-center justify-between bg-ink px-6 py-4 text-white">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-aqua text-xs font-bold">360</span>
              <span className="text-sm font-semibold">{t.appName}</span>
            </div>
            <button
              type="button"
              onClick={() => setLocale(locale === "en" ? "cs" : "en")}
              className="rounded-lg px-2 py-1 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white"
            >
              {locale === "en" ? "CS" : "EN"}
            </button>
          </div>

          <div className="p-6">
            {view === "demo" && DEMO_MODE ? (
              <>
                <p className="mb-1 text-sm font-medium text-ink">{cs ? "Demo přihlášení" : "Demo sign-in"}</p>
                <p className="mb-4 text-xs text-ink-600">
                  {cs ? "Vyberte osobu a přihlaste se jako ona (jen pro demo)." : "Pick a person and sign in as them (demo only)."}
                </p>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                  placeholder={cs ? "Hledat osobu…" : "Search a person…"}
                  className="mb-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-600/50 focus:border-aqua focus:outline-none focus:ring-2 focus:ring-aqua/30"
                />
                <ul className="max-h-80 space-y-1 overflow-auto">
                  {matches.map((u) => (
                    <li key={u.email}>
                      <button
                        type="button"
                        disabled={!!goingTo}
                        onClick={() => pickDemo(u)}
                        className="flex w-full items-center justify-between gap-2 rounded-xl border border-black/10 px-3 py-2 text-left text-sm transition hover:border-aqua/50 hover:bg-aqua/5 disabled:opacity-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">
                            {u.last_name}, {u.first_name}
                          </span>
                          <span className="block truncate text-xs text-ink-600">
                            {u.is_super_admin ? "admin · " : u.role !== "ic" ? `${u.role} · ` : ""}
                            {u.division ?? u.email}
                          </span>
                        </span>
                        {goingTo === u.email ? (
                          <span className="text-xs text-ink-600">…</span>
                        ) : (
                          <Icon name="chevronRight" size={16} className="shrink-0 text-ink-600/40" />
                        )}
                      </button>
                    </li>
                  ))}
                  {matches.length === 0 && <li className="px-1 py-2 text-xs text-ink-600">{cs ? "Nikdo nenalezen." : "No one found."}</li>}
                </ul>
                <button type="button" onClick={() => setView("email")} className="mt-4 w-full text-center text-xs text-ink-600 hover:text-ink">
                  {cs ? "Přihlásit se e-mailovým kódem" : "Sign in with an email code instead"}
                </button>
              </>
            ) : (
              <>
                <p className="mb-6 text-sm text-ink-600">{t.tagline}</p>
                {step === "email" ? (
                  <form onSubmit={onSendCode} className="space-y-4">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-ink">{t.emailLabel}</span>
                      <input
                        type="email"
                        required
                        autoFocus
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@dateio.eu"
                        className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-600/50 focus:border-aqua focus:outline-none focus:ring-2 focus:ring-aqua/30"
                      />
                    </label>
                    <button type="submit" disabled={loading} className={buttonClass("primary", "w-full py-2.5")}>
                      {loading ? t.loading : t.sendCode}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={verify} className="space-y-4">
                    <p className="text-sm text-ink-600">
                      {t.checkEmail} <span className="font-medium text-ink">{email}</span>
                    </p>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-ink">{t.codeLabel}</span>
                      <input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        required
                        autoFocus
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="123456"
                        className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-center text-lg tracking-[0.4em] text-ink placeholder:text-ink-600/40 focus:border-aqua focus:outline-none focus:ring-2 focus:ring-aqua/30"
                      />
                    </label>
                    <button type="submit" disabled={loading} className={buttonClass("primary", "w-full py-2.5")}>
                      {loading ? t.loading : t.verify}
                    </button>
                    <div className="flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setStep("email");
                          setCode("");
                          setError(null);
                          setInfo(null);
                        }}
                        className="text-ink-600 hover:text-ink"
                      >
                        ← {t.differentEmail}
                      </button>
                      <button type="button" onClick={onResend} disabled={loading} className="font-medium text-aqua hover:text-aqua-700 disabled:opacity-50">
                        {t.resendCode}
                      </button>
                    </div>
                  </form>
                )}
                {DEMO_MODE && (
                  <button
                    type="button"
                    onClick={() => {
                      setView("demo");
                      setStep("email");
                      setError(null);
                    }}
                    className="mt-4 w-full text-center text-xs text-ink-600 hover:text-ink"
                  >
                    ← {cs ? "Zpět na demo výběr osoby" : "Back to demo person picker"}
                  </button>
                )}
              </>
            )}

            {info && <p className="mt-4 rounded-xl bg-mint-light px-3 py-2 text-sm text-aqua-700">{info}</p>}
            {error && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-ink-600/70">Dateio · 360° Feedback</p>
      </div>
    </main>
  );
}
