"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { MarketingShell } from "@/components/marketing-shell";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = useMemo(() => (searchParams.get("token") || "").trim(), [searchParams]);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [error, setError] = useState("");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    if (!token) {
      setStatus("error");
      setError("Verification link is invalid or missing.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const resp = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await resp.json().catch(() => ({}))) as { error?: string };
      if (!resp.ok) {
        setStatus("error");
        setError(data.error || "Verification failed");
        return;
      }
      setStatus("ok");
    } catch {
      setStatus("error");
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MarketingShell>
      <section className="mx-auto w-full max-w-lg px-6 py-20 md:py-24">
        <div className="rounded-3xl border border-amber-100/60 bg-white/85 p-8 shadow-[0_18px_40px_rgba(92,56,19,0.12)] md:p-9">
          <h1 className="text-3xl font-semibold text-stone-900">Verify Email</h1>
          <p className="mt-3 text-sm leading-7 text-stone-600">Confirm your email to complete account setup.</p>

          {status === "ok" ? (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Email verified successfully. You can now continue to sign in.
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-7">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-w-[176px] items-center justify-center rounded-xl bg-gradient-to-r from-[#D6A04D] via-[#D7963A] to-[#B4693D] px-6 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? "Verifying..." : "Verify Email"}
              </button>
              {status === "error" ? <p className="pt-3 text-sm text-red-600">{error}</p> : null}
            </form>
          )}

          <p className="mt-7 text-sm text-stone-600">
            <Link href="/login" className="font-semibold text-amber-700">
              Back to Sign In
            </Link>
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
