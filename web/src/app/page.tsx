"use client";

import React from "react";
import { PixelHero } from "@/components/ui/pixel-perfect-hero";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="relative min-h-screen bg-[#f8fafc]">
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-6 lg:px-10">
          <Link href="/" className="text-xl font-semibold tracking-tight text-slate-900">
            <span className="text-slate-900">Ark</span>
            <span className="text-amber-600">Agentic</span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-700 md:flex">
            <Link href="/products" className="hover:text-slate-900">Product</Link>
            <Link href="/solutions" className="hover:text-slate-900">Solution</Link>
            <Link href="/docs" className="hover:text-slate-900">Docs</Link>
            <Link href="/about" className="hover:text-slate-900">About Us</Link>
          </nav>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-medium text-slate-700 shadow-sm backdrop-blur"
          >
            <span>US</span>
          </button>
        </div>
      </header>

      <PixelHero
        word1="ARK"
        word2="Agentic."
        description="Unified Infrastructure & Financial AI Workspace. Interfaces driven by refined motion and pixel-precision."
        primaryCta="Explore Platform"
        primaryCtaMobile="Explore"
        secondaryCta="View GitHub"
        secondaryCtaMobile="GitHub"
        githubUrl="https://github.com"
        onPrimaryClick={() => {
          const el = document.getElementById("features");
          if (el) el.scrollIntoView({ behavior: "smooth" });
        }}
      />
    </main>
  );
}
