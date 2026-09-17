"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient, type ModelRecord, type ModelsSnapshot } from "@/lib/api-client";
import { calculateTieredCost, formatPricePer1M } from "@/lib/pricing-engine";
import { useI18n } from "@/lib/i18n";

type ModelCategory = "all" | "chat" | "rag" | "audio";
type EstimatorMode = "text" | "audio_stt" | "audio_tts" | "image";

type ModelUxMeta = {
  category: Exclude<ModelCategory, "all">;
  badgeKey: string;
  mode: EstimatorMode;
};

const FEATURED_MODEL_IDS = [
  "ark-gpt-4o",
  "ark-gpt-5.3-codex",
  "ark-claude-sonnet-5",
  "ark-claude-opus-5",
  "ark-deepseek-v4-pro",
  "ark-deepseek-v4-flash",
  "ark-mai-thinking-1",
  "ark-cohere-embed-v3",
  "ark-cohere-rerank-v4-pro",
  "ark-cohere-rerank-v4-fast",
  "ark-mai-image-2.5-pro",
  "ark-mai-transcribe-1.5",
  "ark-mai-voice-2",
] as const;

const PAGE_SIZE = 10;

const MODEL_META: Record<string, ModelUxMeta> = {
  "ark-gpt-4o": { category: "chat", badgeKey: "console.models.badges.text", mode: "text" },
  "ark-gpt-5.3-codex": { category: "chat", badgeKey: "console.models.badges.code", mode: "text" },
  "ark-claude-sonnet-5": { category: "chat", badgeKey: "console.models.badges.text", mode: "text" },
  "ark-claude-opus-5": { category: "chat", badgeKey: "console.models.badges.text", mode: "text" },
  "ark-deepseek-v4-pro": { category: "chat", badgeKey: "console.models.badges.reasoning", mode: "text" },
  "ark-deepseek-v4-flash": { category: "chat", badgeKey: "console.models.badges.reasoning", mode: "text" },
  "ark-mai-thinking-1": { category: "chat", badgeKey: "console.models.badges.thinking", mode: "text" },
  "ark-cohere-embed-v3": { category: "rag", badgeKey: "console.models.badges.embedding", mode: "text" },
  "ark-cohere-rerank-v4-pro": { category: "rag", badgeKey: "console.models.badges.rerank", mode: "text" },
  "ark-cohere-rerank-v4-fast": { category: "rag", badgeKey: "console.models.badges.rerank", mode: "text" },
  "ark-mai-image-2.5-pro": { category: "audio", badgeKey: "console.models.badges.imageGen", mode: "image" },
  "ark-mai-transcribe-1.5": { category: "audio", badgeKey: "console.models.badges.audioStt", mode: "audio_stt" },
  "ark-mai-voice-2": { category: "audio", badgeKey: "console.models.badges.audioTts", mode: "audio_tts" },
};

function normalizeTargetModels(models: ModelRecord[]): ModelRecord[] {
  const byId = new Map(models.map((item) => [item.id, item]));
  const activeIds = models.filter((item) => item.active).map((item) => item.id);

  const featured = FEATURED_MODEL_IDS.filter((id) => activeIds.includes(id));
  const featuredSet = new Set<string>(featured);
  const dynamic = activeIds.filter((id) => !featuredSet.has(id)).sort((a, b) => a.localeCompare(b));

  return [...featured, ...dynamic]
    .map((id) => byId.get(id))
    .filter((item): item is ModelRecord => Boolean(item));
}

function badgeColorByKey(key: string): string {
  if (key.includes("thinking")) return "bg-violet-100 text-violet-700";
  if (key.includes("audio")) return "bg-sky-100 text-sky-700";
  if (key.includes("image")) return "bg-fuchsia-100 text-fuchsia-700";
  if (key.includes("rerank") || key.includes("embedding")) return "bg-emerald-100 text-emerald-700";
  if (key.includes("code")) return "bg-amber-100 text-amber-700";
  return "bg-stone-100 text-stone-700";
}

function getActionButtonClass(iconOnly = false): string {
  const sizeClass = iconOnly ? "h-9 w-9 justify-center" : "h-9 px-3";
  return `inline-flex items-center gap-1.5 ${sizeClass} rounded-full border border-amber-200 bg-amber-50/80 text-stone-700 shadow-[0_4px_12px_rgba(123,75,28,0.08)] transition hover:bg-amber-100/90 hover:shadow-[0_7px_16px_rgba(123,75,28,0.12)]`;
}

function getRegionTooltip(modelRegion: string, t: (key: string) => string): string {
  return modelRegion === "US East"
    ? t("console.models.residency.tooltipUsEast")
    : t("console.models.residency.tooltipGlobal");
}

function ModelPricingCard({
  model,
  pricingSnapshot,
  onCopy,
}: {
  model: ModelRecord;
  pricingSnapshot: ModelsSnapshot["pricing"];
  onCopy: (modelId: string) => void;
}) {
  const [promptTokens, setPromptTokens] = useState(1200);
  const [completionTokens, setCompletionTokens] = useState(700);
  const [audioSeconds, setAudioSeconds] = useState(30);
  const [ttsChars, setTtsChars] = useState(240);
  const [imageCount, setImageCount] = useState(2);
  const pricing =
    model.inputPricePer1k != null && model.outputPricePer1k != null
      ? {
          costPer1kInputToken: Number(model.inputPricePer1k),
          costPer1kOutputToken: Number(model.outputPricePer1k),
        }
      : null;
  const meta = MODEL_META[model.id] ?? { category: "chat", badgeKey: "console.models.badges.text", mode: "text" as const };
  const { t } = useI18n();

  const usage = useMemo(() => {
    if (meta.mode === "audio_stt") return { prompt: Math.round(Math.max(0, audioSeconds) * 50), completion: 0 };
    if (meta.mode === "audio_tts") return { prompt: Math.round(Math.max(0, ttsChars) * 0.25), completion: 0 };
    if (meta.mode === "image") return { prompt: Math.max(0, imageCount) * 1000, completion: 0 };
    return { prompt: Math.max(0, promptTokens), completion: Math.max(0, completionTokens) };
  }, [audioSeconds, completionTokens, imageCount, meta.mode, promptTokens, ttsChars]);

  const estimate = pricing
    ? calculateTieredCost({
        promptTokens: usage.prompt,
        completionTokens: usage.completion,
        totalDepositedUsd: pricingSnapshot.totalDepositedUsd,
        inputCostPer1k: pricing.costPer1kInputToken,
        outputCostPer1k: pricing.costPer1kOutputToken,
      })
    : null;

  const standardMultiplier = 1;
  const appliedTierRate = estimate ? estimate.multiplier / standardMultiplier : 1;
  const standardInputPer1M = pricing ? pricing.costPer1kInputToken * standardMultiplier * 1000 : 0;
  const standardOutputPer1M = pricing ? pricing.costPer1kOutputToken * standardMultiplier * 1000 : 0;
  const standardTotal =
    usage.prompt * (standardInputPer1M / 1_000_000) + usage.completion * (standardOutputPer1M / 1_000_000);
  const discountedTotal = standardTotal * appliedTierRate;

  const formulaText = useMemo(() => {
    if (!pricing) return t("console.models.formula.unavailable");

    if (meta.mode === "audio_stt") {
      return `${t("console.models.formula.stt")} (${audioSeconds.toLocaleString()}s × ~50 ${t("console.models.formula.tokensPerSecond")} × $${standardInputPer1M.toFixed(2)}/1M) = $${standardTotal.toFixed(6)}`;
    }
    if (meta.mode === "audio_tts") {
      return `${t("console.models.formula.tts")} (${ttsChars.toLocaleString()} ${t("console.models.formula.characters")} × 0.25 ${t("console.models.formula.tokenPerCharacter")} × $${standardInputPer1M.toFixed(2)}/1M) = $${standardTotal.toFixed(6)}`;
    }
    if (meta.mode === "image") {
      const perImage = standardInputPer1M / 1000;
      return `${t("console.models.formula.image")} (${imageCount.toLocaleString()} × $${perImage.toFixed(6)}/${t("console.models.formula.perImage")}) = $${standardTotal.toFixed(6)}`;
    }

    const inputCost = usage.prompt * (standardInputPer1M / 1_000_000);
    const outputCost = usage.completion * (standardOutputPer1M / 1_000_000);
    return `${t("console.models.formula.input")} (${usage.prompt.toLocaleString()} × $${standardInputPer1M.toFixed(2)}/1M) + ${t("console.models.formula.output")} (${usage.completion.toLocaleString()} × $${standardOutputPer1M.toFixed(2)}/1M) = $${(inputCost + outputCost).toFixed(6)}`;
  }, [audioSeconds, imageCount, meta.mode, pricing, standardInputPer1M, standardOutputPer1M, standardTotal, t, ttsChars, usage.completion, usage.prompt]);

  return (
    <article className="h-full rounded-2xl border border-amber-100/60 bg-white/80 p-5 shadow-[0_10px_24px_rgba(92,56,19,0.1)]">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => onCopy(model.id)}
              className="font-mono text-xs text-stone-500 transition hover:text-stone-900"
              title={t("console.models.copyModelId")}
            >
              {model.id}
            </button>
            <h2 className="mt-1 text-lg font-semibold text-stone-900">{model.name}</h2>
            <div className="mt-1.5">
              <div className="group relative inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-100 bg-amber-50/70 px-2 py-0.5 text-[11px] font-medium text-stone-700">
                <span className="inline-flex h-3.5 w-3.5 items-center justify-center text-stone-500" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3 w-3">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18" />
                  </svg>
                </span>
                <span className="truncate">{model.region}</span>
                <div className="pointer-events-none absolute left-0 top-full z-20 mt-1 w-72 rounded-lg border border-amber-100 bg-white px-2 py-1.5 text-[11px] font-normal leading-snug text-stone-600 opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100">
                  {getRegionTooltip(model.region, t)}
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeColorByKey(meta.badgeKey)}`}>{t(meta.badgeKey)}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                model.active ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-600"
              }`}
            >
              {model.active ? t("console.models.active") : t("admin.common.disabled")}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-lg border border-amber-100 bg-white p-2">
            <p className="text-xs text-stone-500">{t("console.models.context")}</p>
            <p className="font-semibold text-stone-900">{model.contextWindow}</p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-white p-2">
            <p className="text-xs text-stone-500">{t("console.models.inputPrice")}</p>
            <p className="font-semibold text-stone-900">{pricing ? formatPricePer1M(pricing.costPer1kInputToken * pricingSnapshot.multiplier) : "N/A"}</p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-white p-2">
            <p className="text-xs text-stone-500">{t("console.models.latency")}</p>
            <p className="font-semibold text-stone-900">{model.latencyMs}ms</p>
          </div>
        </div>

        <div className="mt-2 rounded-lg border border-amber-100 bg-white p-2 text-sm">
          <p className="text-xs text-stone-500">{t("console.models.outputPrice")}</p>
          <p className="font-semibold text-stone-900">
            {pricing ? formatPricePer1M(pricing.costPer1kOutputToken * pricingSnapshot.multiplier) : "N/A"}
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-amber-100 bg-white/90 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{t("console.models.estimatorTitle")}</p>

          {meta.mode === "audio_stt" ? (
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

          {meta.mode === "audio_tts" ? (
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

          {meta.mode === "image" ? (
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

          {meta.mode === "text" ? (
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

          <div className="mt-2 text-sm font-semibold text-stone-900 transition-all duration-200">
            {t("console.models.estimatedCharge")}: <span className="inline-block transition-all duration-200">{estimate ? `$${discountedTotal.toFixed(6)}` : "$0.000000"}</span>
          </div>

        </div>
      </div>
    </article>
  );
}

export function ModelsClientPanel() {
  const [category, setCategory] = useState<ModelCategory>("all");
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [pricingSnapshot, setPricingSnapshot] = useState<ModelsSnapshot["pricing"]>({
    totalDepositedUsd: 0,
    multiplier: 1,
  });
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const { t } = useI18n();

  const refreshSnapshot = useCallback(async (silentSync = true) => {
    try {
      setError(null);
      if (silentSync) {
        await apiClient.syncModels().catch(() => null);
      }
      const snapshot = await apiClient.getModels("all");
      setModels(normalizeTargetModels(snapshot.models));
      setPricingSnapshot(snapshot.pricing);
    } catch {
      setError(t("console.models.errors.load"));
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await refreshSnapshot(true);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSnapshot]);

  const onRefresh = async () => {
    setSyncing(true);
    await refreshSnapshot(true);
    setSyncing(false);
  };

  const filters: Array<{ key: ModelCategory; label: string }> = [
    { key: "all", label: t("console.models.filters.all") },
    { key: "chat", label: t("console.models.filters.chat") },
    { key: "rag", label: t("console.models.filters.rag") },
    { key: "audio", label: t("console.models.filters.audio") },
  ];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models.filter((m) => {
      const meta = MODEL_META[m.id];
      const categoryMatched = category === "all" || meta?.category === category;
      const searchMatched = !q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
      return categoryMatched && searchMatched;
    });
  }, [category, models, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedModels = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleCopyModelId = async (modelId: string) => {
    try {
      await navigator.clipboard.writeText(modelId);
      setToastMessage(t("console.models.toast.copied"));
      setTimeout(() => setToastMessage(null), 1600);
    } catch {
      setToastMessage(t("console.models.toast.copyFailed"));
      setTimeout(() => setToastMessage(null), 1600);
    }
  };

  return (
    <>
      <article className="rounded-2xl border border-amber-100/60 bg-white/80 p-6 shadow-[0_10px_24px_rgba(92,56,19,0.1)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold text-stone-900">{t("console.models.title")}</h1>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPricingModal(true)}
              className={getActionButtonClass()}
            >
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-stone-400 text-[10px] leading-none">i</span>
              <span className="text-xs font-medium">{t("console.models.pricingDetailsButton")}</span>
            </button>

            <button
              type="button"
              onClick={onRefresh}
              className={getActionButtonClass(true)}
              title={t("console.models.refresh")}
            >
              {syncing ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
              ) : (
                <span className="text-base leading-none">↻</span>
              )}
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {filters.map((item) => (
            <button
              key={item.key}
              onClick={() => {
                setCategory(item.key);
                setPage(1);
              }}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                category === item.key
                  ? "border-transparent bg-gradient-to-r from-[#E3C486] via-[#D7963A] to-[#B4693D] text-white"
                  : "border-amber-100 bg-white text-stone-700"
              }`}
            >
              {item.label}
            </button>
          ))}

          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t("console.models.searchPlaceholder")}
            className="w-full max-w-xs rounded-xl border border-amber-100 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400"
          />
        </div>

        <div className="mt-3">
          <div className="group relative inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50/70 px-2 py-1 text-xs font-medium text-emerald-800">
            <span className="inline-flex h-3.5 w-3.5 items-center justify-center" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3 w-3">
                <path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3z" />
              </svg>
            </span>
            <span>{t("console.models.enterpriseTrust.label")}</span>
            <div className="pointer-events-none absolute left-0 top-full z-20 mt-1 w-80 rounded-lg border border-amber-100 bg-white px-2 py-1.5 text-[11px] font-normal leading-snug text-stone-600 opacity-0 shadow-lg transition group-hover:opacity-100">
              {t("console.models.enterpriseTrust.tooltip")}
            </div>
          </div>
        </div>

        {error ? <p className="mt-3 text-xs text-rose-600">{error}</p> : null}
      </article>

      {loading ? (
        <div className="rounded-2xl border border-amber-100/60 bg-white/80 p-6 text-sm text-stone-600">{t("console.models.loading")}</div>
      ) : (
        <>
          <div className="grid items-stretch gap-4 md:grid-cols-2">
            {pagedModels.map((model) => (
              <ModelPricingCard key={model.id} model={model} pricingSnapshot={pricingSnapshot} onCopy={handleCopyModelId} />
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
                {t("console.models.pagination.previous")}
              </button>

              <span className="px-2 text-sm font-medium text-stone-700">
                {t("console.models.pagination.pageLabel")} {safePage} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("console.models.pagination.next")}
              </button>

            </div>
          ) : null}
        </>
      )}

      {showPricingModal ? (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/35 p-4">
          <div className="flex min-h-full items-center justify-center">
            <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-amber-100 bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-stone-900">{t("console.models.modal.title")}</h3>
                  <p className="mt-1 text-sm text-stone-600">{t("console.models.modal.subtitle")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPricingModal(false)}
                  className="rounded-lg border border-amber-100 px-2 py-1 text-xs text-stone-600"
                >
                  {t("console.models.modal.close")}
                </button>
              </div>

              <div className="mt-4 space-y-3 text-sm text-stone-700">
                <p>
                  <span className="font-semibold text-stone-900">{t("console.models.modal.inputTitle")}</span>: {t("console.models.modal.inputDesc")}
                </p>
                <p>
                  <span className="font-semibold text-stone-900">{t("console.models.modal.outputTitle")}</span>: {t("console.models.modal.outputDesc")}
                </p>
                <p>
                  <span className="font-semibold text-stone-900">{t("console.models.modal.formulaTitle")}</span>: {t("console.models.modal.formulaDesc")}
                </p>
                <p className="rounded-lg border border-amber-100 bg-amber-50/40 px-2 py-1.5 text-xs text-stone-700">
                  <span className="font-semibold text-stone-900">{t("console.models.modal.residencyTitle")}</span>: {t("console.models.modal.residencyDesc")}
                </p>
              </div>

            </div>
          </div>
        </div>
      ) : null}

      {toastMessage ? (
        <div className="fixed bottom-6 right-6 z-[80] rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-medium text-emerald-700 shadow-lg">
          {toastMessage}
        </div>
      ) : null}
    </>
  );
}
