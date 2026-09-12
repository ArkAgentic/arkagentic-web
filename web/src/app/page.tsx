"use client";

import { CardSpotlight } from "@/components/ui/card-spotlight";
import { InfiniteMovingCards } from "@/components/ui/infinite-moving-cards";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";
import { Bot, Cloud, Database, Flame, Shield, Sparkles } from "lucide-react";
import Link from "next/link";

const ecosystemCards = [
  { name: "Azure", icon: Cloud },
  { name: "Google Cloud (GCP)", icon: Cloud },
  { name: "Firebase", icon: Flame },
  { name: "OpenAI", icon: Sparkles },
  { name: "Anthropic", icon: Bot },
  { name: "PostgreSQL", icon: Database },
  { name: "Stripe", icon: Shield },
];

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-16 md:py-24">
      <section className="text-center">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-amber-700">ArkAgentic Platform</p>
        <div className="relative mx-auto mt-4 max-w-4xl">
          <TextGenerateEffect
            words="Next-Gen Agentic Platform & Infrastructure"
            className="bg-gradient-to-r from-stone-900 via-amber-500 to-stone-900 bg-clip-text text-transparent"
          />
          <div className="pointer-events-none absolute inset-0 -z-10 blur-2xl">
            <div className="mx-auto h-full w-5/6 bg-gradient-to-r from-amber-200/0 via-amber-300/35 to-amber-200/0" />
          </div>
        </div>
        <p className="mx-auto mt-5 max-w-3xl text-sm leading-7 text-stone-700 md:text-base">
          Unified infrastructure for finance automation and global AI gateway routing with enterprise-grade reliability.
        </p>
      </section>

      <section className="mt-12 grid gap-6 md:grid-cols-2">
        <CardSpotlight className="h-full bg-gradient-to-b from-white to-stone-50">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">Ledgerly</p>
          <h2 className="mt-2 text-2xl font-semibold text-stone-900">Intelligent Finance Agent Workspace</h2>
          <p className="mt-3 text-sm leading-7 text-stone-700">
            Automate bookkeeping pipelines, ledger operations, and financial analysis workflows with a dedicated AI-native stack.
          </p>
          <Link
            href="https://ledgerly.arkagentic.com"
            className="mt-6 inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Open Ledgerly
          </Link>
        </CardSpotlight>

        <CardSpotlight className="h-full bg-gradient-to-b from-white to-stone-50" color="251, 191, 36">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-amber-700">Gateway</p>
          <h2 className="mt-2 text-2xl font-semibold text-stone-900">API Proxy and Gateway Control Plane</h2>
          <p className="mt-3 text-sm leading-7 text-stone-700">
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
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">Compatible Ecosystem</h3>
        <p className="mt-2 text-sm text-stone-600">Unified with a modern, continuously moving infrastructure card wall.</p>
        <InfiniteMovingCards className="mt-4" items={ecosystemCards} />
      </section>
    </main>
  );
}
