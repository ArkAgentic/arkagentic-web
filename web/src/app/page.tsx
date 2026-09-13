"use client";

import React from "react";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="gateway-hero-bg relative min-h-screen overflow-hidden text-[var(--gateway-text-main)]">
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-6 lg:px-10">
          <Link href="/" className="text-xl font-semibold tracking-tight">
            <span className="text-slate-900">Ark</span>
            <span className="text-amber-600">Agentic</span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-700 md:flex">
            <Link href="/products" className="hover:text-slate-900">
              Product
            </Link>
            <Link href="/solutions" className="hover:text-slate-900">
              Solution
            </Link>
            <Link href="/docs" className="hover:text-slate-900">
              Docs
            </Link>
            <Link href="/about" className="hover:text-slate-900">
              About Us
            </Link>
          </nav>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-amber-100 bg-white/80 px-3 py-2 text-xs font-medium text-slate-700 shadow-sm backdrop-blur"
          >
            <span>US</span>
          </button>
        </div>
      </header>

      <section className="mx-auto flex min-h-screen w-full max-w-7xl items-center px-6 pb-20 pt-32 lg:px-10">
        <div className="max-w-4xl">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-[var(--gateway-text-muted)]">Global AI Compute Infrastructure</p>
          <h1 className="mt-4 text-5xl font-semibold leading-tight text-slate-900 md:text-6xl">
            Enterprise <span className="brand-amber-gradient-text">LLM API Gateway</span>
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-[var(--gateway-text-muted)]">
            Unified infrastructure for global model routing, low-latency access, and production-grade governance across enterprise workloads.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/llmapigateway/console/overview"
              className="gateway-primary-btn rounded-xl px-6 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5"
            >
              Open Gateway Console
            </Link>
            <Link
              href="/docs"
              className="rounded-xl border border-amber-100 bg-white/75 px-6 py-3 text-sm font-semibold text-slate-700 shadow-[0_6px_16px_rgba(148,163,184,0.14)] transition-colors hover:bg-white"
            >
              Developer Docs
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
