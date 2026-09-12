"use client";

import { CardSpotlight } from "@/components/ui/card-spotlight";
import { motion } from "framer-motion";
import { Cloud, Cpu, Database, Shield, Sparkles, Workflow } from "lucide-react";
import Link from "next/link";

const ecosystemCards = [
  { name: "Azure", icon: Cloud },
  { name: "Google Cloud", icon: Cloud },
  { name: "OpenAI", icon: Sparkles },
  { name: "Anthropic", icon: Shield },
  { name: "DeepSeek", icon: Cpu },
  { name: "PostgreSQL", icon: Database },
  { name: "Redis", icon: Workflow },
  { name: "Stripe", icon: Shield },
];

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-16 md:py-24">
      <section className="text-center">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-amber-700">ArkAgentic Platform</p>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="mx-auto mt-4 max-w-4xl bg-gradient-to-r from-stone-900 via-amber-600 to-stone-900 bg-clip-text text-4xl font-semibold leading-tight text-transparent md:text-6xl"
        >
          Next-Gen Agentic Platform &amp; Infrastructure
        </motion.h1>
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
        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          {ecosystemCards.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.name}
                className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-700 shadow-sm"
              >
                <Icon className="h-4 w-4 text-stone-500" />
                <span>{item.name}</span>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
