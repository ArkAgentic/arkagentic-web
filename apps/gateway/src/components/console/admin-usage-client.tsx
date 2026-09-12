"use client";

import { useEffect, useState } from "react";
import { apiClient, formatUsd, type AdminUsageLogsPage, type AdminUsageRange } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";

const PAGE_SIZE = 50;

export function AdminUsageClientPanel() {
  const { t } = useI18n();

  const RANGE_OPTIONS: Array<{ value: AdminUsageRange; label: string }> = [
    { value: "24h", label: t("admin.usage.range.24h") },
    { value: "7d", label: t("admin.usage.range.7d") },
    { value: "30d", label: t("admin.usage.range.30d") },
    { value: "all", label: t("admin.usage.range.all") },
  ];

  const [page, setPage] = useState(1);
  const [range, setRange] = useState<AdminUsageRange>("all");
  const [query, setQuery] = useState("");
  const [payload, setPayload] = useState<AdminUsageLogsPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const next = await apiClient.getAdminUsageLogs(page, PAGE_SIZE, { range, query });
        if (!cancelled) setPayload(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [page, range, query]);

  const total = payload?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const effectivePage = Math.min(page, pageCount);

  const from = total === 0 ? 0 : (effectivePage - 1) * PAGE_SIZE + 1;
  const to = total === 0 ? 0 : Math.min(effectivePage * PAGE_SIZE, total);

  const onExportCsv = async () => {
    setExporting(true);
    try {
      const blob = await apiClient.exportAdminUsageLogsCsv({ range, query });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `admin-usage-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(href);
    } finally {
      setExporting(false);
    }
  };

  if (!payload && loading) {
    return <div className="rounded-2xl border border-amber-100/60 bg-white/80 p-6 text-stone-600">{t("admin.usage.loading")}</div>;
  }

  return (
    <article className="rounded-2xl border border-amber-100/60 bg-white/80 p-6 shadow-[0_10px_24px_rgba(92,56,19,0.1)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-xl font-semibold text-stone-900">{t("admin.usage.title")}</h2>
        <div className="flex items-center gap-2">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                setRange(option.value);
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                range === option.value ? "bg-stone-800 text-white" : "border border-amber-200 bg-white text-stone-700"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-xs">
          <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-stone-500">{t("admin.usage.searchLabel")}</label>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={t("admin.usage.searchPlaceholder")}
            className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-stone-800"
          />
        </div>
        <button
          onClick={onExportCsv}
          disabled={exporting}
          className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {exporting ? t("admin.common.exporting") : t("admin.common.exportCsv")}
        </button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[840px] text-left text-sm">
          <thead>
            <tr className="border-b border-amber-100 text-stone-500">
              <th className="py-2">{t("admin.usage.table.timestamp")}</th>
              <th className="py-2">{t("admin.usage.table.user")}</th>
              <th className="py-2">{t("admin.usage.table.model")}</th>
              <th className="py-2">{t("admin.usage.table.tokens")}</th>
              <th className="py-2">{t("admin.usage.table.charge")}</th>
              <th className="py-2">{t("admin.usage.table.profit")}</th>
            </tr>
          </thead>
          <tbody>
            {(payload?.records ?? []).map((log) => (
              <tr key={log.id} className="border-b border-amber-50 text-stone-700">
                <td className="py-3 text-xs">{log.timestamp}</td>
                <td className="py-3 font-mono text-xs">{log.userId}</td>
                <td className="py-3">{log.modelId}</td>
                <td className="py-3">{log.totalTokens.toLocaleString()}</td>
                <td className="py-3">{formatUsd(log.customerChargeUsd)}</td>
                <td className="py-3 text-emerald-700">{formatUsd(log.netProfitUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-stone-600">
        <p>{`${t("admin.common.showing")} ${from}-${to} ${t("admin.common.of")} ${total}`}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={effectivePage === 1 || loading}
            className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("admin.common.prev")}
          </button>
          <span className="text-xs font-medium text-stone-600">{`${t("admin.common.page")} ${effectivePage} / ${pageCount}`}</span>
          <button
            onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
            disabled={effectivePage >= pageCount || loading}
            className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("admin.common.next")}
          </button>
        </div>
      </div>
    </article>
  );
}
