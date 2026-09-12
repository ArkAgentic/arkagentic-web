import Link from "next/link";
import { MarketingShell } from "@/components/marketing-shell";

export default function LlmApiGatewayProductPage() {
  return (
    <MarketingShell>
      <section className="mx-auto w-full max-w-7xl px-6 py-24">
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-amber-700">AI Infrastructure</p>
        <h1 className="mt-3 text-5xl font-semibold leading-tight text-stone-900">ArkAgentic LLM API Gateway</h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-stone-600">
          Production-grade model routing, API key governance, usage billing, and upstream failover for multi-model enterprise workloads.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link href="/llmapigateway/console/overview" className="rounded-xl bg-gradient-to-r from-[#E3C486] via-[#D7963A] to-[#B4693D] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(123,75,28,0.28)]">
            Open Gateway Console
          </Link>
          <Link href="/docs" className="rounded-xl border border-amber-100 bg-white/85 px-6 py-3 text-sm font-semibold text-stone-700">
            Developer Docs
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
