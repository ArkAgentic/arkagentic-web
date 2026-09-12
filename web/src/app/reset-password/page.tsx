"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { MarketingShell } from "@/components/marketing-shell";
import { useI18n } from "@/lib/i18n";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const token = useMemo(() => (searchParams.get("token") || "").trim(), [searchParams]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    if (!token) {
      setError(t("auth.reset.invalidToken"));
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setError(t("auth.reset.passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("auth.reset.passwordMismatch"));
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const resp = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = (await resp.json().catch(() => ({}))) as { error?: string };
      if (!resp.ok) {
        setError(data.error || t("auth.reset.failed"));
        return;
      }
      setDone(true);
      setTimeout(() => {
        router.replace("/login");
      }, 1200);
    } catch {
      setError(t("auth.reset.failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MarketingShell>
      <section className="mx-auto w-full max-w-lg px-6 py-20 md:py-24">
        <div className="rounded-3xl border border-amber-100/60 bg-white/85 p-8 shadow-[0_18px_40px_rgba(92,56,19,0.12)] md:p-9">
          <h1 className="text-3xl font-semibold text-stone-900">{t("auth.reset.title")}</h1>
          <p className="mt-3 text-sm leading-7 text-stone-600">{t("auth.reset.subtitle")}</p>

          {done ? (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {t("auth.reset.success")}
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-7 space-y-4" autoComplete="off">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl border border-amber-100 bg-white px-3.5 py-2.5 text-sm text-stone-800"
                placeholder={t("auth.reset.newPassword")}
                autoComplete="off"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-amber-100 bg-white px-3.5 py-2.5 text-sm text-stone-800"
                placeholder={t("auth.reset.confirmPassword")}
                autoComplete="off"
              />
              <div className="pt-1 flex justify-center">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex min-w-[176px] items-center justify-center rounded-xl bg-gradient-to-r from-[#D6A04D] via-[#D7963A] to-[#B4693D] px-6 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? t("auth.reset.submitting") : t("auth.reset.submit")}
                </button>
              </div>
              {error ? <p className="pt-1 text-center text-sm text-red-600">{error}</p> : null}
            </form>
          )}

          <p className="mt-7 text-center text-sm text-stone-600">
            <Link href="/login" className="font-semibold text-amber-700">
              {t("auth.reset.backToLogin")}
            </Link>
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
