"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient, type AdminChannelRecord, type ChannelType } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";

const channelTypeOptions: Array<{ value: ChannelType; label: string }> = [
  { value: "azure_openai", label: "Azure OpenAI" },
  { value: "openai_standard", label: "OpenAI Standard / OpenRouter" },
  { value: "siliconflow", label: "SiliconFlow" },
  { value: "custom", label: "Custom" },
];

type FormState = {
  channel_type: ChannelType;
  name: string;
  base_url: string;
  api_key: string;
  model_mapping_text: string;
  timeout_ms: number;
  enabled: boolean;
};

function defaultForm(): FormState {
  return {
    channel_type: "openai_standard",
    name: "",
    base_url: "",
    api_key: "",
    model_mapping_text: "{\n  \"ark-gpt-4o\": \"gpt-4o\"\n}",
    timeout_ms: 45000,
    enabled: true,
  };
}

function formatClock(value: Date | null): string {
  if (!value) return "-";
  return value.toLocaleTimeString();
}

export function AdminChannelsClientPanel() {
  const { t } = useI18n();
  const [items, setItems] = useState<AdminChannelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminChannelRecord | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [autoProbing, setAutoProbing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const title = editing ? t("admin.channels.modal.editTitle") : t("admin.channels.modal.newTitle");

  const totalHealthy = useMemo(
    () => items.filter((x) => (x.healthStatus === "healthy" || x.healthStatus === "degraded") && x.enabled).length,
    [items],
  );

  function healthBadge(channel: AdminChannelRecord) {
    if (channel.healthStatus === "healthy") {
      return {
        dot: "bg-emerald-500",
        label:
          channel.lastLatencyMs != null
            ? `${t("admin.channels.healthStates.healthy")} - ${channel.lastLatencyMs} ms`
            : t("admin.channels.healthStates.healthy"),
        textClass: "text-emerald-700",
      };
    }
    if (channel.healthStatus === "degraded") {
      return {
        dot: "bg-amber-500",
        label:
          channel.lastLatencyMs != null
            ? `${t("admin.channels.healthStates.degraded")} - ${channel.lastLatencyMs} ms`
            : t("admin.channels.healthStates.degraded"),
        textClass: "text-amber-700",
      };
    }
    if (channel.healthStatus === "unhealthy") {
      return {
        dot: "bg-red-500",
        label: t("admin.channels.healthStates.unreachable"),
        textClass: "text-red-700",
      };
    }
    return { dot: "bg-stone-400", label: t("admin.channels.healthStates.unknown"), textClass: "text-stone-600" };
  }

  const loadChannels = useCallback(async (options?: { withHealthProbe?: boolean }) => {
    const withHealthProbe = Boolean(options?.withHealthProbe);
    setLoading(true);
    setError(null);
    try {
      const channels = await apiClient.listAdminChannels();
      setItems(channels);
      setLastRefresh(new Date());

      if (withHealthProbe) {
        const targets = channels.filter((c) => c.enabled);
        if (targets.length > 0) {
          setAutoProbing(true);
          await Promise.all(
            targets.map(async (target) => {
              try {
                await apiClient.healthCheckAdminChannel(target.id);
              } catch {
                // keep UI non-blocking; row-level health state will reflect error after refetch
              }
            }),
          );
          const refreshed = await apiClient.listAdminChannels();
          setItems(refreshed);
          setLastRefresh(new Date());
          setAutoProbing(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.channels.errors.load"));
      setAutoProbing(false);
    } finally {
      setLoading(false);
    }
  }, [t]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadChannels({ withHealthProbe: true });
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(defaultForm());
    setModalOpen(true);
  }

  function openEdit(channel: AdminChannelRecord) {
    setEditing(channel);
    setForm({
      channel_type: channel.channelType,
      name: channel.name,
      base_url: channel.baseUrl,
      api_key: "",
      model_mapping_text: JSON.stringify(channel.modelMapping, null, 2),
      timeout_ms: channel.timeoutMs,
      enabled: channel.enabled,
    });
    setModalOpen(true);
  }

  async function submitForm() {
    setSaving(true);
    setError(null);

    try {
      const parsed = JSON.parse(form.model_mapping_text) as Record<string, string>;
      const payload = {
        channel_type: form.channel_type,
        name: form.name.trim(),
        base_url: form.base_url.trim(),
        model_mapping: parsed,
        timeout_ms: Number(form.timeout_ms),
        enabled: Boolean(form.enabled),
      };

      if (!editing) {
        if (!form.api_key.trim()) throw new Error(t("admin.channels.errors.apiKeyRequired"));
        await apiClient.createAdminChannel({ ...payload, api_key: form.api_key.trim() });
      } else {
        await apiClient.updateAdminChannel(editing.id, {
          ...payload,
          ...(form.api_key.trim() ? { api_key: form.api_key.trim() } : {}),
        });
      }

      setModalOpen(false);
      setEditing(null);
      setForm(defaultForm());
      await loadChannels({ withHealthProbe: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.channels.errors.save"));
    } finally {
      setSaving(false);
    }
  }

  async function runHealthCheck(channelId: string) {
    setCheckingId(channelId);
    setError(null);
    try {
      await apiClient.healthCheckAdminChannel(channelId);
      await loadChannels({ withHealthProbe: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.channels.errors.ping"));
    } finally {
      setCheckingId(null);
    }
  }

  async function removeChannel(channelId: string) {
    if (!confirm(t("admin.channels.confirmDelete"))) return;
    setError(null);
    try {
      await apiClient.deleteAdminChannel(channelId);
      await loadChannels({ withHealthProbe: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.channels.errors.delete"));
    }
  }

  return (
    <div className="space-y-6">
      <article className="rounded-2xl border border-amber-100/60 bg-white/80 p-6 shadow-[0_10px_24px_rgba(92,56,19,0.1)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-stone-900">{t("admin.channels.title")}</h2>
            <p className="mt-1 text-sm text-stone-600">{t("admin.channels.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadChannels({ withHealthProbe: true })}
              className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-medium text-stone-700"
            >
              {autoProbing ? t("admin.channels.actions.refreshing") : t("admin.channels.actions.refresh")}
            </button>
            <button
              onClick={openCreate}
              className="rounded-lg bg-gradient-to-r from-[#E3C486] via-[#D7963A] to-[#B4693D] px-3 py-2 text-xs font-medium text-white"
            >
              {t("admin.channels.actions.newChannel")}
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Stat label={t("admin.channels.stats.total")} value={String(items.length)} />
          <Stat label={t("admin.channels.stats.healthyEnabled")} value={String(totalHealthy)} />
          <Stat label={t("admin.channels.stats.lastRefresh")} value={formatClock(lastRefresh)} />
        </div>
      </article>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <article className="rounded-2xl border border-amber-100/60 bg-white/80 p-6 shadow-[0_10px_24px_rgba(92,56,19,0.1)]">
        {loading ? (
          <p className="text-sm text-stone-600">{t("admin.channels.loading")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1220px] table-fixed text-left text-sm">
              <thead>
                <tr className="border-b border-amber-100 text-stone-500">
                  <th className="w-[170px] py-2">{t("admin.channels.table.name")}</th>
                  <th className="w-[140px] py-2">{t("admin.channels.table.type")}</th>
                  <th className="w-[320px] py-2">{t("admin.channels.table.baseUrl")}</th>
                  <th className="w-[170px] py-2">{t("admin.channels.table.apiKey")}</th>
                  <th className="w-[100px] py-2">{t("admin.channels.table.latency")}</th>
                  <th className="w-[200px] py-2">{t("admin.channels.table.health")}</th>
                  <th className="w-[100px] py-2">{t("admin.channels.table.enabled")}</th>
                  <th className="w-[220px] py-2">{t("admin.channels.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((channel) => {
                  const health = healthBadge(channel);
                  return (
                    <tr key={channel.id} className="border-b border-amber-50 text-stone-700">
                      <td className="py-3 pr-3 font-medium truncate" title={channel.name}>{channel.name}</td>
                      <td className="py-3 pr-3 truncate" title={channel.channelType}>{channel.channelType}</td>
                      <td className="py-3 pr-3 font-mono text-xs break-all" title={channel.baseUrl}>{channel.baseUrl}</td>
                      <td className="py-3 pr-3 font-mono text-xs truncate" title={channel.apiKeyMasked}>{channel.apiKeyMasked}</td>
                      <td className="py-3 pr-3">{channel.lastLatencyMs == null ? "-" : `${channel.lastLatencyMs} ms`}</td>
                      <td className="py-3 pr-3">
                        <span className={`inline-flex items-center gap-2 ${health.textClass}`}>
                          <span className={`h-2.5 w-2.5 rounded-full ${health.dot}`} />
                          <span className="truncate" title={health.label}>{health.label}</span>
                        </span>
                      </td>
                      <td className="py-3 pr-3">{channel.enabled ? t("admin.common.enabled") : t("admin.common.disabled")}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => void runHealthCheck(channel.id)}
                            disabled={checkingId === channel.id}
                            className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs font-medium text-stone-700 disabled:opacity-50"
                          >
                            {checkingId === channel.id ? t("admin.channels.actions.pinging") : t("admin.channels.actions.ping")}
                          </button>
                          <button
                            onClick={() => openEdit(channel)}
                            className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs font-medium text-stone-700"
                          >
                            {t("admin.common.edit")}
                          </button>
                          <button
                            onClick={() => void removeChannel(channel.id)}
                            className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700"
                          >
                            {t("admin.common.delete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/30 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-amber-100 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-stone-900">{title}</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm text-stone-700">
                {t("admin.channels.modal.type")}
                <select
                  className="mt-1 w-full rounded-lg border border-amber-200 px-3 py-2 text-sm"
                  value={form.channel_type}
                  onChange={(e) => setForm((prev) => ({ ...prev, channel_type: e.target.value as ChannelType }))}
                >
                  {channelTypeOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-stone-700">
                {t("admin.channels.modal.name")}
                <input
                  className="mt-1 w-full rounded-lg border border-amber-200 px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </label>
              <label className="text-sm text-stone-700 md:col-span-2">
                {t("admin.channels.modal.baseUrl")}
                <input
                  className="mt-1 w-full rounded-lg border border-amber-200 px-3 py-2 text-sm"
                  value={form.base_url}
                  onChange={(e) => setForm((prev) => ({ ...prev, base_url: e.target.value }))}
                />
              </label>
              <label className="text-sm text-stone-700 md:col-span-2">
                {editing ? t("admin.channels.modal.apiKeyOptional") : t("admin.channels.modal.apiKey")}
                <input
                  type="password"
                  className="mt-1 w-full rounded-lg border border-amber-200 px-3 py-2 text-sm"
                  value={form.api_key}
                  onChange={(e) => setForm((prev) => ({ ...prev, api_key: e.target.value }))}
                />
              </label>
              <label className="text-sm text-stone-700">
                {t("admin.channels.modal.timeoutMs")}
                <input
                  type="number"
                  className="mt-1 w-full rounded-lg border border-amber-200 px-3 py-2 text-sm"
                  value={form.timeout_ms}
                  onChange={(e) => setForm((prev) => ({ ...prev, timeout_ms: Number(e.target.value) || 45000 }))}
                />
              </label>
              <label className="flex items-end gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                />
                {t("admin.common.enabled")}
              </label>
              <label className="text-sm text-stone-700 md:col-span-2">
                {t("admin.channels.modal.modelMapping")}
                <textarea
                  rows={8}
                  className="mt-1 w-full rounded-lg border border-amber-200 px-3 py-2 font-mono text-xs"
                  value={form.model_mapping_text}
                  onChange={(e) => setForm((prev) => ({ ...prev, model_mapping_text: e.target.value }))}
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-medium text-stone-700"
              >
                {t("admin.common.cancel")}
              </button>
              <button
                onClick={() => void submitForm()}
                disabled={saving}
                className="rounded-lg bg-gradient-to-r from-[#E3C486] via-[#D7963A] to-[#B4693D] px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
              >
                {saving ? t("admin.common.saving") : editing ? t("admin.channels.actions.saveChanges") : t("admin.channels.actions.createChannel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-amber-100/70 bg-white p-3">
      <p className="text-xs uppercase tracking-[0.12em] text-stone-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-stone-900">{value}</p>
    </div>
  );
}
