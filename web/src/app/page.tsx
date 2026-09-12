export const dynamic = "force-dynamic";

import Link from "next/link";

export default function HomePageHero() {
  return (
    <main className="mx-auto flex min-h-[75vh] w-full max-w-6xl items-center px-6 py-20">
      <section className="w-full rounded-3xl border border-stone-200 bg-gradient-to-b from-white to-stone-50 p-10 shadow-sm md:p-14">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-amber-700">ArkAgentic Platform</p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight text-stone-900 md:text-5xl">
          Global AI Gateway Infrastructure
        </h1>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-stone-700 md:text-base">
          Enterprise LLM API Gateway for reliable multi-model routing, usage governance, and low-latency global access.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="https://gateway.arkagentic.com"
            className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
          >
            Open Gateway
          </Link>
          <Link
            href="https://gateway.arkagentic.com/docs"
            className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
          >
            Developer Docs
          </Link>
        </div>
      </section>
    </main>
  );
}
