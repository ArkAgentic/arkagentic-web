"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { MarketingShell } from "@/components/marketing-shell";
import { useI18n } from "@/lib/i18n";

export default function ForgotPasswordPage() {
  const { t, locale } = useI18n();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const resp = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, locale }),
      });
      if (!resp.ok) {
        setError(t("auth.forgot.error"));
        return;
      }
      setDone(true);
    } catch {
      setError(t("auth.forgot.error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MarketingShell>
      <section className="mx-auto w-full max-w-lg px-6 py-20 md:py-24">
        <div className="rounded-3xl border border-amber-100/60 bg-white/85 p-8 shadow-[0_18px_40px_rgba(92,56,19,0.12)] md:p-9">
          <h1 className="text-3xl font-semibold text-stone-900">{t("auth.forgot.title")}</h1>
          <p className="mt-3 text-sm leading-7 text-stone-600">{t("auth.forgot.subtitle")}</p>

          {done ? (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {t("auth.forgot.success")}
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-7 space-y-4" autoComplete="off">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-amber-100 bg-white px-3.5 py-2.5 text-sm text-stone-800"
                placeholder={t("auth.common.emailPlaceholder")}
                autoComplete="off"
              />
              <div className="pt-1 flex justify-center">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex min-w-[176px] items-center justify-center rounded-xl bg-gradient-to-r from-[#D6A04D] via-[#D7963A] to-[#B4693D] px-6 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? t("auth.forgot.submitting") : t("auth.forgot.submit")}
                </button>
              </div>
              {error ? <p className="pt-1 text-center text-sm text-red-600">{error}</p> : null}
            </form>
          )}

          <p className="mt-7 text-center text-sm text-stone-600">
            <Link href="/login" className="font-semibold text-amber-700">
              {t("auth.forgot.backToLogin")}
            </Link>
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
