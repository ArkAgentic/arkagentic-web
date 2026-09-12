"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient, type OverviewSnapshot } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";

export function OverviewClientPanel() {
  const [data, setData] = useState<OverviewSnapshot | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    apiClient.getOverview().then(setData);
  }, []);

  const translatedMetrics = useMemo(() => {
    if (!data) return [];
    const labelMap: Record<string, string> = {
      "Requests (24h)": t("console.overview.metrics.requests24h"),
      "Request/min": t("console.overview.metrics.requestsPerMin"),
      "Token Usage": t("console.overview.metrics.tokenUsage"),
      "p95 Latency": t("console.overview.metrics.p95Latency"),
    };
    return data.metrics.map((item) => ({ ...item, label: labelMap[item.label] ?? item.label }));
  }, [data, t]);

  if (!data) {
    return <div className="rounded-2xl border border-amber-100/60 bg-white/80 p-6 text-stone-600">{t("console.common.loadingOverview")}</div>;
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        {translatedMetrics.map((item) => (
          <article key={item.label} className="rounded-2xl border border-amber-100/60 bg-white/80 p-5 shadow-[0_10px_24px_rgba(92,56,19,0.1)]">
            <p className="text-xs uppercase tracking-[0.14em] text-stone-500">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">{item.value}</p>
            <p className="mt-1 text-xs font-semibold text-emerald-700">{item.delta}</p>
          </article>
        ))}
      </div>

      <article className="rounded-2xl border border-amber-100/60 bg-white/80 p-6 shadow-[0_10px_24px_rgba(92,56,19,0.1)]">
        <h2 className="text-xl font-semibold text-stone-900">{t("console.overview.trafficTitle")}</h2>
        <p className="mt-2 text-sm text-stone-600">{t("console.overview.trafficDesc")}</p>
        <div className="mt-5 grid h-52 grid-cols-12 items-end gap-2 rounded-xl border border-amber-100 bg-gradient-to-b from-amber-50/80 to-white p-4">
          {data.requestTrend.map((value, idx) => (
            <div key={idx} className="rounded-t bg-gradient-to-t from-[#B4693D] via-[#D7963A] to-[#E3C486]" style={{ height: `${value}%` }} />
          ))}
        </div>
      </article>
    </>
  );
}
