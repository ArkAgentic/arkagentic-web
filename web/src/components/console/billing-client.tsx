"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient, formatUsd, type BillingSummary } from "@/lib/api-client";
import { useI18n, type LocaleCode } from "@/lib/i18n";

const topupPlans = [
  { amount: 10, credited: 10, bonus: 0, badgeKey: "console.billing.plans.starter.badge" },
  { amount: 50, credited: 55, bonus: 5, badgeKey: "console.billing.plans.growth.badge" },
  { amount: 200, credited: 230, bonus: 30, badgeKey: "console.billing.plans.enterprise.badge" },
] as const;

const FX_USD_TO_CNY = 7.2;

type CheckoutCurrency = "usd" | "cny";

const CNY_TOPUP_PRICE_BY_USD: Record<number, number> = {
  10: Math.round(10 * FX_USD_TO_CNY),
  50: Math.round(50 * FX_USD_TO_CNY),
  200: Math.round(200 * FX_USD_TO_CNY),
};

function resolveCheckoutCurrencyByLocale(locale: LocaleCode): CheckoutCurrency {
  return locale === "zh" ? "cny" : "usd";
}

function formatCheckoutAmount(amount: number, currency: CheckoutCurrency): string {
  if (currency === "cny") {
    return `CNY ${CNY_TOPUP_PRICE_BY_USD[amount]}`;
  }
  return formatUsd(amount);
}

type PaymentMethod = "stripe" | "card" | "alipay" | "wechat_pay" | "redeem_code" | "system";

function methodLabel(method: PaymentMethod, t: (k: string) => string): string {
  switch (method) {
    case "card":
      return t("console.billing.method.card");
    case "alipay":
      return t("console.billing.method.alipay");
    case "wechat_pay":
      return t("console.billing.method.wechatPay");
    case "redeem_code":
      return t("console.billing.method.redeemCode");
    case "system":
      return t("console.billing.method.system");
    default:
      return t("console.billing.method.stripe");
  }
}

function statusLabel(status: "success" | "pending" | "failed", t: (k: string) => string): string {
  if (status === "success") return t("console.billing.status.success");
  if (status === "pending") return t("console.billing.status.pending");
  return t("console.billing.status.failed");
}

function tokenLabel(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return `${tokens}`;
}

function UsageChart({ summary, t }: { summary: BillingSummary; t: (k: string) => string }) {
  const points = summary.dailyUsage;
  const maxAmount = Math.max(1, ...points.map((item) => item.amountUsd));

  if (points.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-5 text-sm text-stone-500">
        {t("console.billing.chart.empty")}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-stone-200 p-4">
      <div className="grid grid-cols-10 gap-2">
        {points.slice(-30).map((item) => {
          const h = Math.max(10, Math.round((item.amountUsd / maxAmount) * 120));
          return (
            <div key={item.date} className="flex min-w-0 flex-col items-center gap-1">
              <div className="w-full rounded-t bg-stone-900/90" style={{ height: `${h}px` }} title={`${item.date} ${formatUsd(item.amountUsd)}`} />
              <p className="w-full truncate text-center text-[10px] text-stone-500">{item.date.slice(5)}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-stone-500">{t("console.billing.chart.caption")}</p>
    </div>
  );
}

function TopupPanel({
  selectedTopup,
  setSelectedTopup,
  selectedPlan,
  checkoutLoading,
  onTopup,
  paymentStatus,
  checkoutMessage,
  t,
  checkoutCurrency,
}: {
  selectedTopup: number;
  setSelectedTopup: (value: number) => void;
  selectedPlan: { amount: number; credited: number; bonus: number; badgeKey: string };
  checkoutLoading: boolean;
  onTopup: () => void;
  paymentStatus: string;
  checkoutMessage: string;
  t: (key: string) => string;
  checkoutCurrency: CheckoutCurrency;
}) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-stone-900">{t("console.billing.topupTitle")}</h2>
      <p className="mt-2 text-sm text-stone-600">{t("console.billing.topupDesc")}</p>


      {paymentStatus === "success" ? (
        <p className="mt-3 rounded-lg bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-800">{t("console.billing.success")}</p>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {topupPlans.map((plan) => {
          const selected = selectedTopup === plan.amount;
          const isFeatured = plan.amount === 50;
          const isEnterprise = plan.amount === 200;
          const badgeClass = isEnterprise
            ? "bg-gradient-to-r from-[#E3C486] via-[#D7963A] to-[#B4693D] text-white"
            : isFeatured
              ? "bg-emerald-600 text-white"
              : selected
                ? "bg-stone-200 text-stone-800"
                : "bg-stone-100 text-stone-700";
          return (
            <button
              key={plan.amount}
              onClick={() => setSelectedTopup(plan.amount)}
              className={`relative rounded-xl border p-4 text-left transition ${
                isEnterprise
                  ? selected
                    ? "border-[#D7963A] bg-gradient-to-b from-[#FCECC7] to-[#F6DFA6] text-stone-900"
                    : "border-amber-300 bg-amber-50 text-stone-800 hover:bg-amber-100"
                  : selected
                    ? isFeatured
                      ? "border-emerald-500 bg-emerald-100 text-stone-900"
                      : "border-stone-300 bg-stone-100 text-stone-900"
                    : isFeatured
                      ? "border-emerald-400 bg-emerald-50 text-stone-800"
                      : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
              }`}
            >
              <span className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}>
                {t(plan.badgeKey)}
              </span>
              <p className="text-xl font-semibold">{formatCheckoutAmount(plan.amount, checkoutCurrency)}</p>
              <p className={`mt-2 text-xs ${selected ? "text-stone-700" : "text-stone-600"}`}>
                {t("console.billing.planLine")
                  .replace("{paid}", formatCheckoutAmount(plan.amount, checkoutCurrency))
                  .replace("{credited}", formatUsd(plan.credited))}
              </p>
              {plan.bonus > 0 ? (
                <p className={`mt-1 text-xs font-medium ${selected ? "text-emerald-800" : "text-emerald-700"}`}>
                  {t("console.billing.planBonus").replace("{bonus}", formatUsd(plan.bonus))}
                </p>
              ) : null}
            </button>
          );
        })}
      </div>

      <button
        onClick={onTopup}
        disabled={checkoutLoading}
        className="mt-4 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-70"
      >
        {checkoutLoading
          ? t("console.billing.creatingCheckout")
          : t("console.billing.topupButtonWithCredit")
              .replace("{paid}", formatCheckoutAmount(selectedPlan.amount, checkoutCurrency))
              .replace("{credited}", formatUsd(selectedPlan.credited))}
      </button>

      {checkoutMessage ? <p className="mt-2 text-sm text-rose-700">{checkoutMessage}</p> : null}

      <p className="mt-3 text-xs text-stone-500">
        {t("console.billing.topupFootnote")} {checkoutCurrency === "cny" ? t("console.billing.fxDisclaimer") : ""}
      </p>

      <p className="mt-3 text-xs text-stone-500">
        {t("console.billing.largeTopupHint.before")}
        <a href="mailto:support@arkagentic.com" className="ml-1 font-medium text-stone-700 hover:text-stone-900">
          support@arkagentic.com
        </a>
        {t("console.billing.largeTopupHint.after")}
      </p>
    </article>
  );
}

function UsageBreakdown({ summary, t }: { summary: BillingSummary; t: (k: string) => string }) {
  const rows = summary.modelBreakdown;
  const totalAmount = rows.reduce((sum, item) => sum + item.amountUsd, 0);

  if (rows.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-5 text-sm text-stone-500">
        {t("console.billing.breakdown.empty")}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {rows.map((item) => {
        const pct = totalAmount > 0 ? Math.round((item.amountUsd / totalAmount) * 100) : 0;
        return (
          <div key={item.modelId} className="rounded-xl border border-stone-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="font-medium text-stone-900">{item.modelId}</p>
              <p className="text-stone-600">
                {tokenLabel(item.totalTokens)} Tokens | {formatUsd(item.amountUsd)} ({pct}%)
              </p>
            </div>
            <div className="mt-2 h-2 rounded-full bg-stone-100">
              <div className="h-2 rounded-full bg-stone-900" style={{ width: `${Math.max(4, pct)}%` }} />
            </div>
            <p className="mt-2 text-xs text-stone-500">
              {t("console.billing.breakdown.calls").replace("{count}", String(item.callCount))}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function BillingClientPanel({
  showTopup = false,
  tableMode,
}: {
  showTopup?: boolean;
  tableMode?: "topup" | "usage";
}) {
  const resolvedTableMode = tableMode ?? (showTopup ? "topup" : "usage");
  const [selectedTopup, setSelectedTopup] = useState<number>(10);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [tablePage, setTablePage] = useState<number>(1);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState<string>("");
  const [paymentStatus] = useState<string>(() =>
    typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("status") ?? "",
  );
  const { t, locale } = useI18n();

  const refresh = async (page = tablePage) => {
    const next = await apiClient.getBilling({ mode: resolvedTableMode, page });
    setSummary(next);
  };

  useEffect(() => {
    void apiClient.getBilling({ mode: resolvedTableMode, page: tablePage }).then(setSummary);
  }, [resolvedTableMode, tablePage]);

  const selectedPlan = useMemo(() => topupPlans.find((item) => item.amount === selectedTopup) ?? topupPlans[0], [selectedTopup]);
  const checkoutCurrency = useMemo(() => resolveCheckoutCurrencyByLocale(locale), [locale]);

  const summaryCards = useMemo(() => {
    if (!summary) return [] as Array<[string, string]>;
    return [
      [t("console.billing.cards.balance"), formatUsd(summary.balanceUsd)],
      [t("console.billing.cards.monthToDate"), formatUsd(summary.monthToDateUsd)],
      [t("console.billing.cards.avgDaily"), formatUsd(summary.avgDailyUsd)],
    ];
  }, [summary, t]);

  const onTopup = async () => {
    try {
      setCheckoutLoading(true);
      setCheckoutMessage("");
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount: selectedTopup, currency: checkoutCurrency }),
      });

      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || t("console.billing.checkoutFailed"));
      }

      window.location.assign(payload.url);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("console.billing.checkoutFailed");
      setCheckoutMessage(message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (!summary) {
    return <div className="rounded-2xl border border-stone-200 bg-white p-6 text-stone-600">{t("console.common.loadingBilling")}</div>;
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {summaryCards.map(([k, v]) => (
          <article key={k} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-stone-500">{k}</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">{v}</p>
          </article>
        ))}
      </div>

      {showTopup ? (
        <TopupPanel
          selectedTopup={selectedTopup}
          setSelectedTopup={setSelectedTopup}
          selectedPlan={selectedPlan}
          checkoutLoading={checkoutLoading}
          onTopup={onTopup}
          paymentStatus={paymentStatus}
          checkoutMessage={checkoutMessage}
          t={t}
          checkoutCurrency={checkoutCurrency}
        />
      ) : null}

      <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-900">{t("console.billing.breakdown.title")}</h2>
        <p className="mt-2 text-sm text-stone-600">{t("console.billing.breakdown.desc")}</p>
        <UsageBreakdown summary={summary} t={t} />
      </article>

      <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-900">{t("console.billing.chart.title")}</h2>
        <UsageChart summary={summary} t={t} />
      </article>

      <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-900">
          {resolvedTableMode === "topup" ? t("console.billing.historyTitle") : t("console.billing.usageLogsTitle")}
        </h2>

        {resolvedTableMode === "topup" ? (
          summary.topupHistory.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-5 text-sm text-stone-500">
              {t("console.billing.empty")}
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="py-2">{t("console.billing.table.invoice")}</th>
                    <th className="py-2">{t("console.billing.table.time")}</th>
                    <th className="py-2">{t("console.billing.table.paid")}</th>
                    <th className="py-2">{t("console.billing.table.credited")}</th>
                    <th className="py-2">{t("console.billing.table.method")}</th>
                    <th className="py-2">{t("console.billing.table.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.topupHistory.map((item) => (
                    <tr key={`${item.id}-${item.occurredAt}`} className="border-b border-stone-100 text-stone-700">
                      <td className="py-3 font-medium text-stone-900">{item.id}</td>
                      <td className="py-3">{new Date(item.occurredAt).toISOString().replace("T", " ").slice(0, 16)}</td>
                      <td className="py-3">{formatUsd(item.amountPaidUsd)}</td>
                      <td className="py-3">{formatUsd(item.amountCreditedUsd)}</td>
                      <td className="py-3">{methodLabel(item.paymentMethod, t)}</td>
                      <td className="py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            item.status === "success"
                              ? "bg-emerald-100 text-emerald-700"
                              : item.status === "pending"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {statusLabel(item.status, t)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : summary.usageLogs.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-5 text-sm text-stone-500">
            {t("console.billing.empty")}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500">
                  <th className="py-2">{t("console.billing.table.time")}</th>
                  <th className="py-2">{t("console.billing.table.model")}</th>
                  <th className="py-2">{t("console.billing.table.promptTokens")}</th>
                  <th className="py-2">{t("console.billing.table.completionTokens")}</th>
                  <th className="py-2">{t("console.billing.table.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {summary.usageLogs.map((item) => (
                  <tr key={`${item.id}-${item.occurredAt}`} className="border-b border-stone-100 text-stone-700">
                    <td className="py-3">{new Date(item.occurredAt).toISOString().replace("T", " ").slice(0, 16)}</td>
                    <td className="py-3 font-medium text-stone-900">{item.modelId}</td>
                    <td className="py-3">{tokenLabel(item.promptTokens)}</td>
                    <td className="py-3">{tokenLabel(item.completionTokens)}</td>
                    <td className="py-3">{formatUsd(item.amountUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2 text-sm text-stone-600">
          <button
            onClick={() => setTablePage((prev) => Math.max(1, prev - 1))}
            disabled={!summary.tableHasPrev}
            className="rounded-lg border border-stone-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("console.billing.pagination.prev")}
          </button>
          <span>
            {t("console.billing.pagination.page").replace("{page}", String(summary.tablePage)).replace("{total}", String(Math.max(1, Math.ceil(summary.tableTotal / summary.tablePageSize))))}
          </span>
          <button
            onClick={() => setTablePage((prev) => prev + 1)}
            disabled={!summary.tableHasNext}
            className="rounded-lg border border-stone-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("console.billing.pagination.next")}
          </button>
        </div>
      </article>
    </>
  );
}
