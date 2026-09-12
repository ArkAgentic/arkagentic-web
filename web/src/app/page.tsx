"use client";

import { CardSpotlight } from "@/components/ui/card-spotlight";
import { InfiniteMovingCards } from "@/components/ui/infinite-moving-cards";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";
import { Bot, Cloud, Database, Flame, Shield, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";

const ecosystemCards = [
  { name: "Azure", icon: Cloud },
  { name: "Google Cloud (GCP)", icon: Cloud },
  { name: "Firebase", icon: Flame },
  { name: "OpenAI", icon: Sparkles },
  { name: "Anthropic", icon: Bot },
  { name: "PostgreSQL", icon: Database },
  { name: "Stripe", icon: Shield },
];

const rotatingHeadlines = [
  "Next-Gen Agentic Platform & Infrastructure",
  "Intelligent Finance Agent Workspace",
];

const starField = [
  { top: "8%", left: "10%", delay: 0 },
  { top: "14%", left: "82%", delay: 0.2 },
  { top: "20%", left: "66%", delay: 0.35 },
  { top: "26%", left: "24%", delay: 0.5 },
  { top: "32%", left: "90%", delay: 0.7 },
  { top: "36%", left: "50%", delay: 0.9 },
  { top: "44%", left: "16%", delay: 1.1 },
  { top: "48%", left: "72%", delay: 1.3 },
  { top: "54%", left: "38%", delay: 1.5 },
  { top: "60%", left: "84%", delay: 1.8 },
  { top: "64%", left: "8%", delay: 2.1 },
  { top: "72%", left: "62%", delay: 2.4 },
];

export const dynamic = "force-dynamic";

export default function HomePage() {
  const [headlineIndex, setHeadlineIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setHeadlineIndex((current) => (current + 1) % rotatingHeadlines.length);
    }, 2600);
    return () => clearInterval(timer);
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07090f] text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(251,191,36,0.2),transparent_35%),radial-gradient(circle_at_78%_28%,rgba(56,189,248,0.18),transparent_30%),radial-gradient(circle_at_50%_100%,rgba(251,191,36,0.14),transparent_42%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:48px_48px] opacity-20" />
      {starField.map((star, index) => (
        <motion.span
          key={`star-${index}`}
          className="pointer-events-none absolute h-1 w-1 rounded-full bg-amber-200"
          style={{ top: star.top, left: star.left }}
          initial={{ opacity: 0.2, scale: 0.8 }}
          animate={{ opacity: [0.2, 0.9, 0.2], scale: [0.8, 1.2, 0.8] }}
          transition={{ duration: 2.8, delay: star.delay, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        />
      ))}

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-16 pt-6 md:pb-24 md:pt-8">
        <header className="rounded-2xl border border-white/15 bg-zinc-900/55 px-5 py-3 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link href="/" className="text-sm font-semibold tracking-wide text-zinc-100">
              ArkAgentic
            </Link>

            <nav className="flex items-center gap-6 text-sm text-zinc-300">
              <Link href="/docs" className="hover:text-white">
                Developer Docs
              </Link>
              <Link href="/pricing" className="hover:text-white">
                Pricing
              </Link>
              <Link href="/about" className="hover:text-white">
                About Us
              </Link>
            </nav>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-xl border border-white/20 bg-zinc-900/70 px-3 py-2 text-xs font-medium text-zinc-200"
              >
                🇺🇸 US
              </button>
              <Link
                href="/signup"
                className="rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_0_22px_rgba(245,158,11,0.42)] hover:brightness-110"
              >
                Get Started
              </Link>
            </div>
          </div>
        </header>

        <section className="relative mt-16 text-center md:mt-20">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-amber-300">ArkAgentic Platform</p>

          <div className="relative mx-auto mt-5 max-w-5xl">
            <AnimatePresence mode="wait">
              <motion.div
                key={rotatingHeadlines[headlineIndex]}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              >
                <TextGenerateEffect
                  words={rotatingHeadlines[headlineIndex]}
                  className="bg-gradient-to-r from-white via-amber-300 to-zinc-200 bg-clip-text text-transparent drop-shadow-[0_0_28px_rgba(251,191,36,0.35)]"
                />
              </motion.div>
            </AnimatePresence>
            <div className="pointer-events-none absolute inset-0 -z-10 blur-3xl">
              <div className="mx-auto h-full w-4/5 rounded-full bg-gradient-to-r from-amber-300/10 via-amber-300/30 to-cyan-300/10" />
            </div>
          </div>

          <p className="mx-auto mt-6 max-w-3xl text-sm leading-7 text-zinc-300 md:text-base">
            Unified infrastructure for finance automation and global AI gateway routing with enterprise-grade reliability.
          </p>
        </section>

        <section className="mt-12 grid gap-6 md:grid-cols-2">
          <CardSpotlight className="h-full border-white/10 bg-zinc-900/70">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-300">Ledgerly</p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-50">Intelligent Finance Agent Workspace</h2>
            <p className="mt-3 text-sm leading-7 text-zinc-300">
              Automate bookkeeping pipelines, ledger operations, and financial analysis workflows with a dedicated AI-native stack.
            </p>
            <Link
              href="https://ledgerly.arkagentic.com"
              className="mt-6 inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Open Ledgerly
            </Link>
          </CardSpotlight>

          <CardSpotlight className="h-full border-white/10 bg-zinc-900/70" color="251, 191, 36">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-amber-300">Gateway</p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-50">API Proxy and Gateway Control Plane</h2>
            <p className="mt-3 text-sm leading-7 text-zinc-300">
              OpenAI-compatible routing, multi-provider failover, and usage governance for production-grade enterprise AI traffic.
            </p>
            <Link
              href="https://gateway.arkagentic.com"
              className="mt-6 inline-flex rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
            >
              Open Gateway
            </Link>
          </CardSpotlight>
        </section>

        <section className="mt-14">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-400">Compatible Ecosystem</h3>
          <p className="mt-2 text-sm text-zinc-400">Unified with a modern, continuously moving infrastructure card wall.</p>
          <InfiniteMovingCards className="mt-4" items={ecosystemCards} />
        </section>
      </div>
    </main>
  );
}
