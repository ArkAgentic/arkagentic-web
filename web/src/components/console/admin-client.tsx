"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient, formatUsd, type AdminDashboardSnapshot } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";

const PAGE_SIZE = 10;

export function AdminClientPanel() {
  const { t } = useI18n();
  const [data, setData] = useState<AdminDashboardSnapshot | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [keyQuery, setKeyQuery] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [keyPage, setKeyPage] = useState(1);

  useEffect(() => {
    apiClient.getAdminDashboard().then(setData);
  }, []);

  const onToggleUser = async (userId: string) => {
    const next = await apiClient.toggleAdminUserStatus(userId);
    setData(next);
  };

  const filteredUsers = useMemo(() => {
    if (!data) return [];
    const q = userQuery.trim().toLowerCase();
    if (!q) return data.users;
    return data.users.filter((user) => user.userId.toLowerCase().includes(q) || user.email.toLowerCase().includes(q));
  }, [data, userQuery]);

  const filteredKeys = useMemo(() => {
    if (!data) return [];
    const q = keyQuery.trim().toLowerCase();
    if (!q) return data.keyRecords;
    return data.keyRecords.filter(
      (key) => key.userId.toLowerCase().includes(q) || key.keyPrefix.toLowerCase().includes(q) || key.status.toLowerCase().includes(q),
    );
  }, [data, keyQuery]);

  const userPageCount = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const keyPageCount = Math.max(1, Math.ceil(filteredKeys.length / PAGE_SIZE));

  const effectiveUserPage = Math.min(userPage, userPageCount);
  const effectiveKeyPage = Math.min(keyPage, keyPageCount);

  const pagedUsers = filteredUsers.slice((effectiveUserPage - 1) * PAGE_SIZE, effectiveUserPage * PAGE_SIZE);
  const pagedKeys = filteredKeys.slice((effectiveKeyPage - 1) * PAGE_SIZE, effectiveKeyPage * PAGE_SIZE);

  if (!data) {
    return <div className="rounded-2xl border border-amber-100/60 bg-white/80 p-6 text-stone-600">{t("admin.overview.loading")}</div>;
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={t("admin.overview.metrics.totalUsers")} value={data.kpi.totalUsers.toLocaleString()} />
        <MetricCard label={t("admin.overview.metrics.grossDeposits")} value={formatUsd(data.kpi.grossDepositsUsd)} />
        <MetricCard label={t("admin.overview.metrics.totalBalance")} value={formatUsd(data.kpi.totalUserBalanceUsd)} />
        <MetricCard label={t("admin.overview.metrics.netProfit")} value={formatUsd(data.kpi.cumulativeNetProfitUsd)} />
      </div>

      <article className="rounded-2xl border border-amber-100/60 bg-white/80 p-6 shadow-[0_10px_24px_rgba(92,56,19,0.1)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl font-semibold text-stone-900">{t("admin.overview.usersSection.title")}</h2>
          <div className="w-full max-w-xs">
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-stone-500">{t("admin.overview.usersSection.searchLabel")}</label>
            <input
              value={userQuery}
              onChange={(e) => {
                setUserQuery(e.target.value);
                setUserPage(1);
              }}
              placeholder={t("admin.overview.usersSection.searchPlaceholder")}
              className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-stone-800"
            />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead>
              <tr className="border-b border-amber-100 text-stone-500">
                <th className="py-2">{t("admin.overview.usersSection.table.userId")}</th>
                <th className="py-2">{t("admin.overview.usersSection.table.email")}</th>
                <th className="py-2">{t("admin.overview.usersSection.table.registeredAt")}</th>
                <th className="py-2">{t("admin.overview.usersSection.table.totalDeposited")}</th>
                <th className="py-2">{t("admin.overview.usersSection.table.currentBalance")}</th>
                <th className="py-2">{t("admin.overview.usersSection.table.tier")}</th>
                <th className="py-2">{t("admin.overview.usersSection.table.status")}</th>
                <th className="py-2">{t("admin.overview.usersSection.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {pagedUsers.map((user) => (
                <tr key={user.userId} className="border-b border-amber-50 text-stone-700">
                  <td className="py-3 font-mono text-xs">{user.userId}</td>
                  <td className="py-3">{user.email}</td>
                  <td className="py-3">{user.registeredAt}</td>
                  <td className="py-3">{formatUsd(user.totalDepositedUsd)}</td>
                  <td className="py-3">{formatUsd(user.currentBalanceUsd)}</td>
                  <td className="py-3">
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">{user.pricingTier.toUpperCase()}</span>
                  </td>
                  <td className="py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${user.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-700"}`}>
                      {user.status === "active" ? t("admin.common.active") : t("admin.common.inactive")}
                    </span>
                  </td>
                  <td className="py-3">
                    <button
                      onClick={() => onToggleUser(user.userId)}
                      className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700"
                    >
                      {user.status === "active" ? t("admin.overview.usersSection.disable") : t("admin.overview.usersSection.enable")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-stone-600">
          <p>{`${t("admin.common.showing")} ${pagedUsers.length === 0 ? 0 : (effectiveUserPage - 1) * PAGE_SIZE + 1}-${(effectiveUserPage - 1) * PAGE_SIZE + pagedUsers.length} ${t("admin.common.of")} ${filteredUsers.length}`}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setUserPage((prev) => Math.max(1, prev - 1))}
              disabled={effectiveUserPage === 1}
              className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("admin.common.prev")}
            </button>
            <span className="text-xs font-medium text-stone-600">{`${t("admin.common.page")} ${effectiveUserPage} / ${userPageCount}`}</span>
            <button
              onClick={() => setUserPage((prev) => Math.min(userPageCount, prev + 1))}
              disabled={effectiveUserPage >= userPageCount}
              className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("admin.common.next")}
            </button>
          </div>
        </div>
      </article>

      <article className="rounded-2xl border border-amber-100/60 bg-white/80 p-6 shadow-[0_10px_24px_rgba(92,56,19,0.1)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl font-semibold text-stone-900">{t("admin.overview.keysSection.title")}</h2>
          <div className="w-full max-w-xs">
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-stone-500">{t("admin.overview.keysSection.searchLabel")}</label>
            <input
              value={keyQuery}
              onChange={(e) => {
                setKeyQuery(e.target.value);
                setKeyPage(1);
              }}
              placeholder={t("admin.overview.keysSection.searchPlaceholder")}
              className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-stone-800"
            />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-amber-100 text-stone-500">
                <th className="py-2">{t("admin.overview.keysSection.table.userId")}</th>
                <th className="py-2">{t("admin.overview.keysSection.table.keyPrefix")}</th>
                <th className="py-2">{t("admin.overview.keysSection.table.quota")}</th>
                <th className="py-2">{t("admin.overview.keysSection.table.status")}</th>
              </tr>
            </thead>
            <tbody>
              {pagedKeys.map((item) => (
                <tr key={`${item.userId}-${item.keyPrefix}`} className="border-b border-amber-50 text-stone-700">
                  <td className="py-3 font-mono text-xs">{item.userId}</td>
                  <td className="py-3 font-mono text-xs">{item.keyPrefix}</td>
                  <td className="py-3">{`${item.quotaLimit.toLocaleString()} / day`}</td>
                  <td className="py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-700"}`}>
                      {item.status === "active" ? t("admin.common.active") : t("admin.common.inactive")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-stone-600">
          <p>{`${t("admin.common.showing")} ${pagedKeys.length === 0 ? 0 : (effectiveKeyPage - 1) * PAGE_SIZE + 1}-${(effectiveKeyPage - 1) * PAGE_SIZE + pagedKeys.length} ${t("admin.common.of")} ${filteredKeys.length}`}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setKeyPage((prev) => Math.max(1, prev - 1))}
              disabled={effectiveKeyPage === 1}
              className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("admin.common.prev")}
            </button>
            <span className="text-xs font-medium text-stone-600">{`${t("admin.common.page")} ${effectiveKeyPage} / ${keyPageCount}`}</span>
            <button
              onClick={() => setKeyPage((prev) => Math.min(keyPageCount, prev + 1))}
              disabled={effectiveKeyPage >= keyPageCount}
              className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("admin.common.next")}
            </button>
          </div>
        </div>
      </article>
    </>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-amber-100/60 bg-white/80 p-5 shadow-[0_10px_24px_rgba(92,56,19,0.1)]">
      <p className="text-xs uppercase tracking-[0.14em] text-stone-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-stone-900">{value}</p>
    </article>
  );
}
