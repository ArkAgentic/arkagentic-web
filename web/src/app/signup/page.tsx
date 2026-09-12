"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MarketingShell } from "@/components/marketing-shell";
import { writeSessionUser } from "@/lib/auth-session";
import { setAuthToken } from "@/lib/auth-provider";
import { useI18n } from "@/lib/i18n";

export default function SignupPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [name, setName] = useState("Ark Builder");
  const [email, setEmail] = useState("builder@example.com");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const redirectTarget =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("redirect") || "/console/overview"
      : "/console/overview";

  const completeSignup = async () => {
    if (!email || !password) {
      setError("Please enter email and password.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const resp = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, locale }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        token?: string;
        user?: { email: string; name: string; balanceUsd: number };
        error?: string;
      };
      if (!resp.ok || !data.token || !data.user) {
        setError(data.error || "Sign up failed");
        return;
      }
      setAuthToken(data.token);
      writeSessionUser({
        email: data.user.email,
        name: data.user.name,
        balanceUsd: Number(data.user.balanceUsd ?? 0),
      });
      router.push(redirectTarget);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MarketingShell>
      <section className="mx-auto w-full max-w-xl px-6 py-24">
        <div className="rounded-3xl border border-amber-100/60 bg-white/85 p-8 shadow-[0_18px_40px_rgba(92,56,19,0.12)]">
          <h1 className="text-3xl font-semibold text-stone-900">{t("auth.signup.title")}</h1>
          <p className="mt-2 text-stone-600">{t("auth.signup.subtitle")}</p>

          <div className="space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-amber-100 bg-white px-3 py-2 text-sm text-stone-800"
              placeholder={t("auth.common.fullNamePlaceholder")}
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-amber-100 bg-white px-3 py-2 text-sm text-stone-800"
              placeholder={t("auth.common.emailPlaceholder")}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-amber-100 bg-white px-3 py-2 text-sm text-stone-800"
              placeholder={t("auth.common.passwordPlaceholder")}
            />
            <button
              onClick={() => completeSignup()}
              disabled={submitting}
              className="w-full rounded-xl bg-gradient-to-r from-[#D6A04D] via-[#D7963A] to-[#B4693D] px-4 py-2.5 text-sm font-semibold text-white"
            >
              {submitting ? "Creating account..." : t("auth.signup.submit")}
            </button>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>

          <p className="mt-5 text-sm text-stone-600">
            {t("auth.signup.hasAccount")} <Link href="/login" className="font-semibold text-amber-700">{t("auth.signup.signIn")}</Link>
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
