"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { dict, type Locale } from "@/lib/i18n";
import { buttonClass } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("en");
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const t = dict[locale];

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
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      });
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
          {/* brand bar */}
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
                    placeholder="name@fakeio.eu"
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

            {info && <p className="mt-4 rounded-xl bg-mint-light px-3 py-2 text-sm text-aqua-700">{info}</p>}
            {error && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-ink-600/70">Dateio · 360° Feedback</p>
      </div>
    </main>
  );
}
