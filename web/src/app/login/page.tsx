"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { MarketingShell } from "@/components/marketing-shell";
import { writeSessionUser } from "@/lib/auth-session";
import { setAuthToken } from "@/lib/auth-provider";
import { useI18n } from "@/lib/i18n";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const completeLogin = async () => {
    if (!email || !password) {
      setError("Please enter email and password.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        token?: string;
        user?: { email: string; name: string; balanceUsd: number; role?: "user" | "admin" };
        error?: string;
      };
      if (!resp.ok || !data.token || !data.user) {
        setError(data.error || "Sign in failed");
        return;
      }
      setAuthToken(data.token);
      writeSessionUser({
        email: data.user.email,
        name: data.user.name,
        balanceUsd: Number(data.user.balanceUsd ?? 0),
      });
      const queryRedirect =
        typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("redirect") : null;
      const safeRedirect =
        queryRedirect && queryRedirect.startsWith("/") && !queryRedirect.startsWith("/login")
          ? queryRedirect
          : null;
      const fallbackTarget = data.user.role === "admin" ? "/console/admin" : "/console/overview";
      const target = safeRedirect || fallbackTarget;
      if (typeof window !== "undefined") {
        window.location.assign(target);
        return;
      }
      router.replace(target);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    void completeLogin();
  };

  return (
    <MarketingShell>
      <section className="mx-auto w-full max-w-lg px-6 py-20 md:py-24">
        <div className="rounded-3xl border border-amber-100/60 bg-white/85 p-8 shadow-[0_18px_40px_rgba(92,56,19,0.12)] md:p-9">
          <h1 className="text-3xl font-semibold text-stone-900">{t("auth.login.title")}</h1>
          <p className="mt-3 text-sm leading-7 text-stone-600">{t("auth.login.subtitle")}</p>

          <form onSubmit={onSubmit} autoComplete="off" className="mt-7 space-y-4">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-amber-100 bg-white px-3.5 py-2.5 text-sm text-stone-800"
              placeholder={t("auth.login.accountPlaceholder")}
              autoComplete="off"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-amber-100 bg-white px-3.5 py-2.5 text-sm text-stone-800"
              placeholder={t("auth.common.passwordPlaceholder")}
              autoComplete="off"
            />
            <div className="pt-1 flex justify-center">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-w-[176px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#D6A04D] via-[#D7963A] to-[#B4693D] px-6 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" className="opacity-30" />
                      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span>{t("auth.login.submitting")}</span>
                  </>
                ) : (
                  t("auth.login.submit")
                )}
              </button>
            </div>
            {error ? <p className="pt-1 text-center text-sm text-red-600">{error}</p> : null}
          </form>

          <div className="mt-7 flex items-center justify-between text-sm text-stone-600">
            <p>
              {t("auth.login.noAccount")} <Link href="/signup" className="font-semibold text-amber-700">{t("auth.login.getStarted")}</Link>
            </p>
            <Link href="/forgot-password" className="font-medium text-amber-700 hover:text-amber-800">
              {t("auth.login.forgotPassword")}
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
