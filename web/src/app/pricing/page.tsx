"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MarketingShell } from "@/components/marketing-shell";
import { tierMultipliers } from "@/lib/pricing-schema";
import { calculateTieredCost } from "@/lib/pricing-engine";
import { useI18n } from "@/lib/i18n";

type RuntimePricingRow = {
  modelId: string;
  inputPricePer1k: number;
  outputPricePer1k: number;
  source: "db" | "static";
};

type ModelCategory = "all" | "chat" | "rag" | "audio";
type EstimatorMode = "text" | "audio_stt" | "audio_tts" | "image";

type ModelUxMeta = {
  nameKey: string;
  category: Exclude<ModelCategory, "all">;
  badgeKey: string;
  mode: EstimatorMode;
  contextWindow: string;
  latencyMs: number;
  region: string;
};

const TOPUP_TIERS = [
  { id: "starter", amount: 10 },
  { id: "growth", amount: 50 },
  { id: "enterprise", amount: 200 },
] as const;

const PAGE_SIZE = 10;

const MODEL_META: Record<string, ModelUxMeta> = {
  "ark-gpt-4o": {
    nameKey: "pricing.page.models.names.ark-gpt-4o",
    category: "chat",
    badgeKey: "console.models.badges.text",
    mode: "text",
    contextWindow: "128k",
    latencyMs: 172,
    region: "Global Cluster",
  },
  "ark-gpt-5.3-codex": {
    nameKey: "pricing.page.models.names.ark-gpt-5.3-codex",
    category: "chat",
    badgeKey: "console.models.badges.code",
    mode: "text",
    contextWindow: "200k",
    latencyMs: 185,
    region: "US East",
  },
  "ark-claude-sonnet-5": {
    nameKey: "pricing.page.models.names.ark-claude-sonnet-5",
    category: "chat",
    badgeKey: "console.models.badges.text",
    mode: "text",
    contextWindow: "200k",
    latencyMs: 186,
    region: "US East",
  },
  "ark-claude-opus-5": {
    nameKey: "pricing.page.models.names.ark-claude-opus-5",
    category: "chat",
    badgeKey: "console.models.badges.text",
    mode: "text",
    contextWindow: "200k",
    latencyMs: 210,
    region: "US East",
  },
  "ark-deepseek-v4-pro": {
    nameKey: "pricing.page.models.names.ark-deepseek-v4-pro",
    category: "chat",
    badgeKey: "console.models.badges.reasoning",
    mode: "text",
    contextWindow: "128k",
    latencyMs: 148,
    region: "US East",
  },
  "ark-deepseek-v4-flash": {
    nameKey: "pricing.page.models.names.ark-deepseek-v4-flash",
    category: "chat",
    badgeKey: "console.models.badges.reasoning",
    mode: "text",
    contextWindow: "128k",
    latencyMs: 152,
    region: "US East",
  },
  "ark-mai-thinking-1": {
    nameKey: "pricing.page.models.names.ark-mai-thinking-1",
    category: "chat",
    badgeKey: "console.models.badges.thinking",
    mode: "text",
    contextWindow: "128k",
    latencyMs: 159,
    region: "US East",
  },
  "ark-cohere-embed-v3": {
    nameKey: "pricing.page.models.names.ark-cohere-embed-v3",
    category: "rag",
    badgeKey: "console.models.badges.embedding",
    mode: "text",
    contextWindow: "128k",
    latencyMs: 150,
    region: "Global Cluster",
  },
  "ark-cohere-rerank-v4-pro": {
    nameKey: "pricing.page.models.names.ark-cohere-rerank-v4-pro",
    category: "rag",
    badgeKey: "console.models.badges.rerank",
    mode: "text",
    contextWindow: "128k",
    latencyMs: 158,
    region: "Global Cluster",
  },
  "ark-cohere-rerank-v4-fast": {
    nameKey: "pricing.page.models.names.ark-cohere-rerank-v4-fast",
    category: "rag",
    badgeKey: "console.models.badges.rerank",
    mode: "text",
    contextWindow: "128k",
    latencyMs: 145,
    region: "Global Cluster",
  },
  "ark-mai-image-2.5-pro": {
    nameKey: "pricing.page.models.names.ark-mai-image-2.5-pro",
    category: "audio",
    badgeKey: "console.models.badges.imageGen",
    mode: "image",
    contextWindow: "128k",
    latencyMs: 170,
    region: "US East",
  },
  "ark-mai-transcribe-1.5": {
    nameKey: "pricing.page.models.names.ark-mai-transcribe-1.5",
    category: "audio",
    badgeKey: "console.models.badges.audioStt",
    mode: "audio_stt",
    contextWindow: "128k",
    latencyMs: 162,
    region: "US East",
  },
  "ark-mai-voice-2": {
    nameKey: "pricing.page.models.names.ark-mai-voice-2",
    category: "audio",
    badgeKey: "console.models.badges.audioTts",
    mode: "audio_tts",
    contextWindow: "128k",
    latencyMs: 166,
    region: "US East",
  },
};

function badgeColorByKey(key: string): string {
  if (key.includes("thinking")) return "bg-violet-100 text-violet-700";
  if (key.includes("audio")) return "bg-sky-100 text-sky-700";
  if (key.includes("image")) return "bg-fuchsia-100 text-fuchsia-700";
  if (key.includes("rerank") || key.includes("embedding")) return "bg-emerald-100 text-emerald-700";
  if (key.includes("code")) return "bg-amber-100 text-amber-700";
  return "bg-stone-100 text-stone-700";
}

function PriceEstimator({
  inputPer1M,
  outputPer1M,
  mode,
}: {
  inputPer1M: number;
  outputPer1M: number;
  mode: EstimatorMode;
}) {
  const [promptTokens, setPromptTokens] = useState(1200);
  const [completionTokens, setCompletionTokens] = useState(700);
  const [audioSeconds, setAudioSeconds] = useState(30);
  const [ttsChars, setTtsChars] = useState(240);
  const [imageCount, setImageCount] = useState(2);
  const { t } = useI18n();

  const usage = useMemo(() => {
    if (mode === "audio_stt") return { prompt: Math.round(Math.max(0, audioSeconds) * 50), completion: 0 };
    if (mode === "audio_tts") return { prompt: Math.round(Math.max(0, ttsChars) * 0.25), completion: 0 };
    if (mode === "image") return { prompt: Math.max(0, imageCount) * 1000, completion: 0 };
    return { prompt: Math.max(0, promptTokens), completion: Math.max(0, completionTokens) };
  }, [audioSeconds, completionTokens, imageCount, mode, promptTokens, ttsChars]);

  const estimated = useMemo(() => {
    return usage.prompt * (inputPer1M / 1_000_000) + usage.completion * (outputPer1M / 1_000_000);
  }, [inputPer1M, outputPer1M, usage.completion, usage.prompt]);

  const formulaText = useMemo(() => {
    if (mode === "audio_stt") {
      return `${t("console.models.formula.stt")} (${audioSeconds.toLocaleString()}s × ~50 ${t("console.models.formula.tokensPerSecond")} × $${inputPer1M.toFixed(2)}/1M) = $${estimated.toFixed(6)}`;
    }
    if (mode === "audio_tts") {
      return `${t("console.models.formula.tts")} (${ttsChars.toLocaleString()} ${t("console.models.formula.characters")} × 0.25 ${t("console.models.formula.tokenPerCharacter")} × $${inputPer1M.toFixed(2)}/1M) = $${estimated.toFixed(6)}`;
    }
    if (mode === "image") {
      const perImage = inputPer1M / 1000;
      return `${t("console.models.formula.image")} (${imageCount.toLocaleString()} × $${perImage.toFixed(6)}/${t("console.models.formula.perImage")}) = $${estimated.toFixed(6)}`;
    }
    return `${t("console.models.formula.input")} (${usage.prompt.toLocaleString()} × $${inputPer1M.toFixed(2)}/1M) + ${t("console.models.formula.output")} (${usage.completion.toLocaleString()} × $${outputPer1M.toFixed(2)}/1M) = $${estimated.toFixed(6)}`;
  }, [audioSeconds, estimated, imageCount, inputPer1M, mode, outputPer1M, t, ttsChars, usage.completion, usage.prompt]);

  return (
    <div className="mt-4 rounded-xl border border-amber-100 bg-white/90 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{t("console.models.estimatorTitle")}</p>

      {mode === "audio_stt" ? (
        <label className="mt-2 block text-xs text-stone-600">
          {t("console.models.inputs.audioSeconds")}
          <input
            type="number"
            min={0}
            value={audioSeconds}
            onChange={(e) => setAudioSeconds(Number(e.target.value || 0))}
            className="mt-1 w-full rounded-lg border border-amber-100 px-2 py-1.5 text-sm text-stone-800"
          />
        </label>
      ) : null}

      {mode === "audio_tts" ? (
        <label className="mt-2 block text-xs text-stone-600">
          {t("console.models.inputs.characters")}
          <input
            type="number"
            min={0}
            value={ttsChars}
            onChange={(e) => setTtsChars(Number(e.target.value || 0))}
            className="mt-1 w-full rounded-lg border border-amber-100 px-2 py-1.5 text-sm text-stone-800"
          />
        </label>
      ) : null}

      {mode === "image" ? (
        <label className="mt-2 block text-xs text-stone-600">
          {t("console.models.inputs.generatedImages")}
          <input
            type="number"
            min={0}
            value={imageCount}
            onChange={(e) => setImageCount(Number(e.target.value || 0))}
            className="mt-1 w-full rounded-lg border border-amber-100 px-2 py-1.5 text-sm text-stone-800"
          />
        </label>
      ) : null}

      {mode === "text" ? (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="text-xs text-stone-600">
            {t("console.models.promptTokens")}
            <input
              type="number"
              min={0}
              value={promptTokens}
              onChange={(e) => setPromptTokens(Number(e.target.value || 0))}
              className="mt-1 w-full rounded-lg border border-amber-100 px-2 py-1.5 text-sm text-stone-800"
            />
          </label>
          <label className="text-xs text-stone-600">
            {t("console.models.completionTokens")}
            <input
              type="number"
              min={0}
              value={completionTokens}
              onChange={(e) => setCompletionTokens(Number(e.target.value || 0))}
              className="mt-1 w-full rounded-lg border border-amber-100 px-2 py-1.5 text-sm text-stone-800"
            />
          </label>
        </div>
      ) : null}

      <p className="mt-2 text-xs text-stone-500">{formulaText}</p>
      <div className="mt-2 text-sm font-semibold text-stone-900">{t("console.models.estimatedCharge")}: ${estimated.toFixed(6)}</div>
    </div>
  );
}

export default function PricingPage() {
  const [category, setCategory] = useState<ModelCategory>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [runtimePricingRows, setRuntimePricingRows] = useState<RuntimePricingRow[]>([]);
  const { t } = useI18n();

  const categoryLabel = (key: ModelCategory): string => {
    if (key === "chat") return t("pricing.page.filters.chat");
    if (key === "rag") return t("pricing.page.filters.rag");
    if (key === "audio") return t("pricing.page.filters.audio");
    return t("pricing.page.filters.all");
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/pricing/models", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { pricing?: RuntimePricingRow[] };
        if (!cancelled && Array.isArray(data.pricing)) {
          setRuntimePricingRows(data.pricing);
        }
      } catch {
        // DB is required for pricing page in production path; keep empty on failure
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const modelRows = useMemo(() => {
    const runtimeMap = new Map(runtimePricingRows.map((x) => [x.modelId, x]));
    const modelIds = Array.from(runtimeMap.keys()).sort((a, b) => a.localeCompare(b));

    return modelIds
      .map((modelId) => {
        const runtime = runtimeMap.get(modelId);
        if (!runtime) return null;

        const meta = MODEL_META[modelId] ?? {
          nameKey: "",
          category: "chat" as const,
          badgeKey: "console.models.badges.text",
          mode: "text" as const,
          contextWindow: "128k",
          latencyMs: 180,
          region: "Global Cluster",
        };

        const tierMultiplier = tierMultipliers.tier_1;
        const name = meta.nameKey ? t(meta.nameKey) : modelId;

        return {
          id: modelId,
          name,
          category: meta.category,
          badgeKey: meta.badgeKey,
          mode: meta.mode,
          contextWindow: meta.contextWindow,
          latencyMs: meta.latencyMs,
          region: meta.region,
          inputPer1M: runtime.inputPricePer1k * tierMultiplier * 1000,
          outputPer1M: runtime.outputPricePer1k * tierMultiplier * 1000,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [runtimePricingRows, t]);


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return modelRows.filter((m) => {
      const byCategory = category === "all" || m.category === category;
      const bySearch = !q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
      return byCategory && bySearch;
    });
  }, [category, search, modelRows]);

  useEffect(() => {
    setPage(1);
  }, [category, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedModels = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const categories: ModelCategory[] = ["all", "chat", "rag", "audio"];

  return (
    <MarketingShell active="pricing">
      <main className="mx-auto w-full max-w-7xl px-6 py-14 md:py-20">
        <section className="rounded-3xl border border-amber-100/80 bg-gradient-to-b from-white to-amber-50/40 p-8 shadow-[0_16px_40px_rgba(123,75,28,0.10)] md:p-10">
          <h1 className="text-4xl font-semibold tracking-tight text-stone-900 md:text-5xl">{t("pricing.page.title")}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600 md:text-base">{t("pricing.page.subtitle")}</p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {TOPUP_TIERS.map((tier) => (
              <article key={tier.amount} className="rounded-2xl border border-amber-200/70 bg-white p-5 shadow-[0_10px_26px_rgba(123,75,28,0.08)]">
                <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">{t(`pricing.page.tiers.${tier.id}.badge`)}</span>
                <p className="mt-3 text-3xl font-semibold text-stone-900">${tier.amount}</p>
                <p className="mt-1 text-base font-medium text-stone-800">{t(`pricing.page.tiers.${tier.id}.title`)}</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">{t(`pricing.page.tiers.${tier.id}.subtitle`)}</p>
                <Link
                  href="/console/billing"
                  className="mt-4 inline-flex rounded-xl bg-gradient-to-r from-[#E3C486] via-[#D7963A] to-[#B4693D] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(123,75,28,0.22)]"
                >
                  {t("pricing.page.tiers.goBilling")}
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-amber-100/80 bg-white/90 p-8 shadow-[0_16px_40px_rgba(123,75,28,0.08)] md:p-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold text-stone-900">{t("pricing.page.modelCenter.title")}</h2>
            <Link href="/console/models" className="inline-flex rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-stone-800">
              {t("pricing.page.modelCenter.cta")}
            </Link>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                  category === c
                    ? "border-transparent bg-gradient-to-r from-[#E3C486] via-[#D7963A] to-[#B4693D] text-white"
                    : "border-amber-200 bg-white text-stone-700"
                }`}
              >
                {categoryLabel(c)}
              </button>
            ))}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("pricing.page.searchPlaceholder")}
              className="ml-auto w-full max-w-xs rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-800"
            />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {pagedModels.map((model) => (
              <article key={model.id} className="h-full rounded-2xl border border-amber-100/60 bg-white/80 p-5 shadow-[0_10px_24px_rgba(92,56,19,0.1)]">
                <div className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs text-stone-500">{model.id}</p>
                      <h3 className="mt-1 text-lg font-semibold text-stone-900">{model.name}</h3>
                      <div className="mt-1.5">
                        <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-100 bg-amber-50/70 px-2 py-0.5 text-[11px] font-medium text-stone-700">
                          <span className="truncate">{model.region}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeColorByKey(model.badgeKey)}`}>{t(model.badgeKey)}</span>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{t("console.models.active")}</span>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                    <div className="rounded-lg border border-amber-100 bg-white p-2">
                      <p className="text-xs text-stone-500">{t("console.models.context")}</p>
                      <p className="font-semibold text-stone-900">{model.contextWindow}</p>
                    </div>
                    <div className="rounded-lg border border-amber-100 bg-white p-2">
                      <p className="text-xs text-stone-500">{t("console.models.inputPrice")}</p>
                      <p className="font-semibold text-stone-900">${model.inputPer1M.toFixed(2)}/1M</p>
                    </div>
                    <div className="rounded-lg border border-amber-100 bg-white p-2">
                      <p className="text-xs text-stone-500">{t("console.models.latency")}</p>
                      <p className="font-semibold text-stone-900">{model.latencyMs}ms</p>
                    </div>
                  </div>

                  <div className="mt-2 rounded-lg border border-amber-100 bg-white p-2 text-sm">
                    <p className="text-xs text-stone-500">{t("console.models.outputPrice")}</p>
                    <p className="font-semibold text-stone-900">${model.outputPer1M.toFixed(2)}/1M</p>
                  </div>

                  <PriceEstimator inputPer1M={model.inputPer1M} outputPer1M={model.outputPer1M} mode={model.mode} />
                </div>
              </article>
            ))}

            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-amber-100/60 bg-white/80 p-6 text-sm text-stone-600 md:col-span-2">
                {t("console.models.empty")}
              </div>
            ) : null}
          </div>

          {filtered.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-amber-100/60 bg-white/80 p-4 text-sm text-stone-700 shadow-[0_10px_24px_rgba(92,56,19,0.08)]">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("pricing.page.modelCenter.pagination.previous")}
              </button>

              <span className="px-2 text-sm font-medium text-stone-700">
                {t("pricing.page.modelCenter.pagination.pageLabel")} {safePage}/{totalPages}
              </span>

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("pricing.page.modelCenter.pagination.next")}
              </button>
            </div>
          ) : null}
        </section>
      </main>
    </MarketingShell>
  );
}
