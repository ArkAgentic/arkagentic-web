"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MarketingShell } from "@/components/marketing-shell";
import { getAuthSessionState } from "@/lib/auth-provider";
import { useI18n } from "@/lib/i18n";
import { modelPricingTable } from "@/lib/pricing-schema";

type CodeTab = "curl" | "python" | "node";
type RoutingCategory = "all" | "openai" | "anthropic" | "deepseek" | "qwen" | "moonshot" | "siliconflow";

type CodeSample = { label: string; language: string; code: string };
type RoutingRow = {
  modelId: string;
  alias: string;
  category: Exclude<RoutingCategory, "all">;
  notesKey: string;
};

const sectionOrder = ["quickstart", "routing", "advanced"] as const;
const routingPageSize = 10;

function getCategory(provider: string): Exclude<RoutingCategory, "all"> {
  switch (provider) {
    case "anthropic":
    case "deepseek":
    case "qwen":
    case "moonshot":
    case "siliconflow":
      return provider;
    default:
      return "openai";
  }
}

function getNotesKey(modelId: string): string {
  const id = modelId.toLowerCase();
  if (id.includes("codex")) return "docs.page.routing.notes.codeHeavy";
  if (id.includes("thinking") || id.includes("deepseek-r1")) return "docs.page.routing.notes.reasoning";
  if (id.includes("embed")) return "docs.page.routing.notes.embedding";
  if (id.includes("rerank")) return "docs.page.routing.notes.rerank";
  if (id.includes("image")) return "docs.page.routing.notes.image";
  if (id.includes("transcribe") || id.includes("voice")) return "docs.page.routing.notes.audio";
  return "docs.page.routing.notes.generalChat";
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const { t } = useI18n();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-2xl border border-amber-100 bg-[#fffdf8]">
      <div className="flex items-center justify-between border-b border-amber-100 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{title}</p>
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-amber-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-amber-50"
        >
          {copied ? t("docs.page.code.copied") : t("docs.page.code.copy")}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-6 text-stone-700">{code}</pre>
    </div>
  );
}

export default function DocsPage() {
  const [tab, setTab] = useState<CodeTab>("curl");
  const [routingQuery, setRoutingQuery] = useState("");
  const [routingCategory, setRoutingCategory] = useState<RoutingCategory>("all");
  const [routingPage, setRoutingPage] = useState(1);
  const { t } = useI18n();

  const isAuthenticated = getAuthSessionState().status === "authenticated";
  const apiKeyHref = isAuthenticated ? "/console/keys" : "/login";

  const codeSamples: Record<CodeTab, CodeSample> = useMemo(() => {
    const prompt = t("docs.page.samplePrompt");
    return {
      curl: {
        label: t("docs.page.quickstart.tab.curl"),
        language: "bash",
        code: `curl https://arkagentic.com/v1/chat/completions \\
  -H "Authorization: Bearer <YOUR_API_KEY>" \\\\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "ark-gpt-4o",
    "messages": [{"role":"user","content":"${prompt}"}],
    "temperature": 0.2,
    "stream": false
  }'`,
      },
      python: {
        label: t("docs.page.quickstart.tab.python"),
        language: "python",
        code: `from openai import OpenAI
import os

client = OpenAI(
    api_key=os.environ["ARK_API_KEY"],
    base_url="https://arkagentic.com/v1",
)

resp = client.chat.completions.create(
    model="ark-gpt-4o",
    messages=[{"role": "user", "content": "${prompt}"}],
)

print(resp.choices[0].message.content)`,
      },
      node: {
        label: t("docs.page.quickstart.tab.node"),
        language: "ts",
        code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.ARK_API_KEY,
  baseURL: "https://arkagentic.com/v1",
});

const resp = await client.chat.completions.create({
  model: "ark-gpt-4o",
  messages: [{ role: "user", content: "${prompt}" }],
});

console.log(resp.choices[0]?.message?.content);`,
      },
    };
  }, [t]);

  const allRoutingRows = useMemo<RoutingRow[]>(() => {
    return modelPricingTable
      .map((entry) => ({
        modelId: entry.modelId,
        alias: entry.upstreamModelId,
        category: getCategory(entry.provider),
        notesKey: getNotesKey(entry.modelId),
      }))
      .sort((a, b) => a.modelId.localeCompare(b.modelId));
  }, []);

  const filteredRoutingRows = useMemo(() => {
    const q = routingQuery.trim().toLowerCase();
    return allRoutingRows.filter((row) => {
      const categoryMatched = routingCategory === "all" || row.category === routingCategory;
      const searchMatched =
        !q || row.modelId.toLowerCase().includes(q) || row.alias.toLowerCase().includes(q) || row.category.toLowerCase().includes(q);
      return categoryMatched && searchMatched;
    });
  }, [allRoutingRows, routingCategory, routingQuery]);

  useEffect(() => {
    setRoutingPage(1);
  }, [routingCategory, routingQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRoutingRows.length / routingPageSize));
  const safePage = Math.min(routingPage, totalPages);
  const currentRoutingRows = filteredRoutingRows.slice((safePage - 1) * routingPageSize, safePage * routingPageSize);

  const currentCode = codeSamples[tab];

  return (
    <MarketingShell active="docs">
      <section className="mx-auto w-full max-w-[1380px] px-6 py-14 md:py-18">
        <header className="mb-8 rounded-3xl border border-amber-100/80 bg-gradient-to-b from-white to-amber-50/40 p-8 shadow-[0_14px_36px_rgba(123,75,28,0.08)] md:p-10">
          <h1 className="text-4xl font-semibold tracking-tight text-stone-900 md:text-5xl">{t("docs.page.title")}</h1>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-stone-600 md:text-base">{t("docs.page.subtitle")}</p>

        </header>

        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="h-fit max-h-[78vh] overflow-auto rounded-2xl border border-amber-100/70 bg-white/85 p-4 shadow-[0_10px_24px_rgba(123,75,28,0.06)] lg:sticky lg:top-24">
            <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{t("docs.page.contents")}</p>
            <nav className="space-y-1 text-sm">
              {sectionOrder.map((id, idx) => (
                <a key={id} href={`#${id}`} className="block rounded-lg px-2 py-2 text-stone-700 transition hover:bg-amber-50 hover:text-stone-900">
                  {idx + 1}. {t(`docs.page.sections.${id}`)}
                </a>
              ))}
            </nav>
          </aside>

          <article className="space-y-8 rounded-2xl border border-amber-100/70 bg-white/90 p-6 shadow-[0_10px_24px_rgba(123,75,28,0.06)] md:p-8">
            <section id="quickstart" className="scroll-mt-28">
              <h2 className="text-2xl font-semibold text-stone-900">1. {t("docs.page.sections.quickstart")}</h2>
              <p className="mt-3 text-sm leading-7 text-stone-600 md:text-base">
                {t("docs.page.quickstart.body.pre")}
                <span className="mx-1 rounded bg-amber-100 px-1.5 py-0.5 font-mono text-amber-900">https://arkagentic.com/v1</span>
                {t("docs.page.quickstart.body.post")}
              </p>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-xl border border-amber-200 bg-white p-1">
                  {(Object.keys(codeSamples) as CodeTab[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setTab(k)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === k ? "bg-amber-100 text-amber-900" : "text-stone-600"}`}
                    >
                      {codeSamples[k].label}
                    </button>
                  ))}
                </div>

                <Link
                  href={apiKeyHref}
                  className="text-sm font-medium text-amber-900 underline-offset-4 transition hover:text-amber-800 hover:underline"
                >
                  {t("docs.page.quickstart.getApiKey")}
                </Link>
              </div>

              <div className="mt-4">
                <CodeBlock title={`${currentCode.label} · ${currentCode.language}`} code={currentCode.code} />
              </div>
            </section>

            <section id="routing" className="scroll-mt-28">
              <h2 className="text-2xl font-semibold text-stone-900">2. {t("docs.page.sections.routing")}</h2>
              <p className="mt-3 text-sm leading-7 text-stone-600 md:text-base">{t("docs.page.routing.body")}</p>

              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px]">
                <input
                  value={routingQuery}
                  onChange={(e) => setRoutingQuery(e.target.value)}
                  placeholder={t("docs.page.routing.searchPlaceholder")}
                  className="h-10 rounded-xl border border-amber-200 bg-white px-3 text-sm text-stone-800 outline-none focus:border-amber-300"
                />
                <select
                  value={routingCategory}
                  onChange={(e) => setRoutingCategory(e.target.value as RoutingCategory)}
                  className="h-10 rounded-xl border border-amber-200 bg-white px-3 text-sm text-stone-800 outline-none focus:border-amber-300"
                >
                  <option value="all">{t("docs.page.routing.filters.all")}</option>
                  <option value="openai">{t("docs.page.routing.filters.openai")}</option>
                  <option value="anthropic">{t("docs.page.routing.filters.anthropic")}</option>
                  <option value="deepseek">{t("docs.page.routing.filters.deepseek")}</option>
                  <option value="qwen">{t("docs.page.routing.filters.qwen")}</option>
                  <option value="moonshot">{t("docs.page.routing.filters.moonshot")}</option>
                  <option value="siliconflow">{t("docs.page.routing.filters.siliconflow")}</option>
                </select>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-amber-100 text-stone-500">
                      <th className="py-2 pr-4">{t("docs.page.routing.table.modelId")}</th>
                      <th className="py-2 pr-4">{t("docs.page.routing.table.category")}</th>
                      <th className="py-2 pr-4">{t("docs.page.routing.table.alias")}</th>
                      <th className="py-2">{t("docs.page.routing.table.notes")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentRoutingRows.length === 0 ? (
                      <tr>
                        <td className="py-4 text-sm text-stone-600" colSpan={4}>
                          {t("docs.page.routing.empty")}
                        </td>
                      </tr>
                    ) : (
                      currentRoutingRows.map((row) => (
                        <tr key={row.modelId} className="border-b border-amber-50 text-stone-700">
                          <td className="py-3 pr-4 font-mono text-xs text-stone-900">{row.modelId}</td>
                          <td className="py-3 pr-4">{t(`docs.page.routing.categories.${row.category}`)}</td>
                          <td className="py-3 pr-4 font-mono text-xs">{row.alias}</td>
                          <td className="py-3">{t(row.notesKey)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-stone-600">
                  {t("docs.page.routing.pricingHint.pre")}
                  <Link href="/pricing" className="mx-1 font-medium text-amber-900 underline-offset-4 hover:underline">
                    {t("docs.page.routing.pricingHint.link")}
                  </Link>
                  {t("docs.page.routing.pricingHint.post")}
                </p>
                <Link href="/console/models" className="text-sm font-medium text-amber-900 underline-offset-4 hover:underline">
                  {t("docs.page.routing.viewAllPrefix")} {allRoutingRows.length} {t("docs.page.routing.viewAllSuffix")}
                </Link>

                <div className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRoutingPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t("docs.page.routing.pagination.previous")}
                  </button>
                  <span className="text-xs text-stone-600">
                    {t("docs.page.routing.pagination.pageLabel")} {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRoutingPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t("docs.page.routing.pagination.next")}
                  </button>
                </div>
              </div>
            </section>

            <section id="advanced" className="scroll-mt-28">
              <h2 className="text-2xl font-semibold text-stone-900">3. {t("docs.page.sections.advanced")}</h2>

              <div className="mt-4 space-y-5">
                <div className="rounded-xl border border-amber-100 bg-white p-4">
                  <p className="text-sm font-semibold text-stone-900">{t("docs.page.advanced.failover.title")}</p>
                  <p className="mt-2 text-sm leading-7 text-stone-600">{t("docs.page.advanced.failover.body")}</p>
                </div>

                <div className="rounded-xl border border-amber-100 bg-white p-4">
                  <p className="text-sm font-semibold text-stone-900">{t("docs.page.advanced.streaming.title")}</p>
                  <p className="mt-2 text-sm leading-7 text-stone-600">
                    {t("docs.page.advanced.streaming.body.pre")}
                    <span className="mx-1 rounded bg-amber-100 px-1.5 py-0.5 font-mono text-amber-900">stream: true</span>
                    {t("docs.page.advanced.streaming.body.post")}
                  </p>
                  <CodeBlock
                    title={t("docs.page.advanced.streaming.requestTitle")}
                    code={`{
  "model": "ark-gpt-4o",
  "messages": [{"role":"user","content":"stream this response"}],
  "stream": true
}`}
                  />
                </div>

                <div className="rounded-xl border border-amber-100 bg-white p-4">
                  <p className="text-sm font-semibold text-stone-900">{t("docs.page.advanced.errors.title")}</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-amber-100 text-stone-500">
                          <th className="py-2 pr-3">{t("docs.page.advanced.errors.table.code")}</th>
                          <th className="py-2 pr-3">{t("docs.page.advanced.errors.table.meaning")}</th>
                          <th className="py-2">{t("docs.page.advanced.errors.table.action")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {["400", "401", "429", "5xx"].map((code) => (
                          <tr key={code} className="border-b border-amber-50">
                            <td className="py-2 pr-3 font-mono">{code}</td>
                            <td className="py-2 pr-3">{t(`docs.page.advanced.errors.rows.${code}.meaning`)}</td>
                            <td className="py-2">{t(`docs.page.advanced.errors.rows.${code}.action`)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>
          </article>
        </div>
      </section>
    </MarketingShell>
  );
}
