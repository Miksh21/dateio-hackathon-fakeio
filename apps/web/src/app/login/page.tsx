"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { dict, type Locale } from "@/lib/i18n";

export default function LoginPage() {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("en");
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = dict[locale];

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: allowed, error: rpcErr } = await supabase.rpc("can_login", {
        p_email: email.trim(),
      });
      if (rpcErr) throw rpcErr;
      if (!allowed) {
        setError(t.notInDirectory);
        return;
      }
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      });
      if (otpErr) throw otpErr;
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: vErr } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: "email",
      });
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
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">{t.appName}</h1>
          <button
            type="button"
            onClick={() => setLocale(locale === "en" ? "cs" : "en")}
            className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            {locale === "en" ? "CS" : "EN"}
          </button>
        </div>
        <p className="mb-6 text-sm text-gray-500">{t.tagline}</p>

        {step === "email" ? (
          <form onSubmit={sendCode} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">{t.emailLabel}</span>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@fakeio.eu"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {loading ? t.loading : t.sendCode}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!email.trim()) {
                  setError("Enter your email first.");
                  return;
                }
                setError(null);
                setStep("code");
              }}
              className="w-full text-xs text-gray-500 hover:text-gray-900"
            >
              Already have a code?
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-4">
            <p className="text-sm text-gray-600">
              {t.checkEmail} <span className="font-medium">{email}</span>
            </p>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">{t.codeLabel}</span>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-center text-lg tracking-widest text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {loading ? t.loading : t.verify}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
              className="w-full text-xs text-gray-500 hover:text-gray-900"
            >
              ← {t.emailLabel}
            </button>
          </form>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
      </div>
    </main>
  );
}
