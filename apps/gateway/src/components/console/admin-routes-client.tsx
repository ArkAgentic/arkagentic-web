"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient, type AdminChannelRecord, type AdminRouteRecord } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";

type RouteForm = {
  ark_model_id: string;
  channel_id: string;
  priority: number;
  enabled: boolean;
  upstream_model_override: string;
};

const MODEL_ID_SUGGESTIONS = [
  "ark-gpt-4o",
  "ark-gpt-5.3-codex",
  "ark-claude-sonnet-5",
  "ark-claude-opus-5",
  "ark-deepseek-v4-pro",
  "ark-deepseek-v4-flash",
  "ark-mai-thinking-1",
  "ark-qwen-3.5-max",
];

function defaultForm(channels: AdminChannelRecord[]): RouteForm {
  const enabledChannels = channels.filter((item) => item.enabled);
  return {
    ark_model_id: "",
    channel_id: enabledChannels[0]?.id ?? "",
    priority: 1,
    enabled: true,
    upstream_model_override: "",
  };
}

export function AdminRoutesClientPanel() {
  const { t } = useI18n();
  const [routes, setRoutes] = useState<AdminRouteRecord[]>([]);
  const [channels, setChannels] = useState<AdminChannelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<RouteForm>(defaultForm([]));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Omit<RouteForm, "ark_model_id">>({
    channel_id: "",
    priority: 1,
    enabled: true,
    upstream_model_override: "",
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextRoutes, nextChannels] = await Promise.all([apiClient.listAdminRoutes(), apiClient.listAdminChannels()]);
      const sorted = nextRoutes.slice().sort((a, b) => {
        if (a.arkModelId !== b.arkModelId) return a.arkModelId.localeCompare(b.arkModelId);
        return a.priority - b.priority;
      });
      setRoutes(sorted);
      setChannels(nextChannels);
      setForm((prev) => ({ ...defaultForm(nextChannels), ...prev, channel_id: prev.channel_id || defaultForm(nextChannels).channel_id }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.routes.errors.load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll();
  }, []);

  const enabledChannels = useMemo(() => channels.filter((item) => item.enabled), [channels]);

  const groupedByModel = useMemo(() => {
    const map = new Map<string, AdminRouteRecord[]>();
    for (const route of routes) {
      if (!map.has(route.arkModelId)) map.set(route.arkModelId, []);
      map.get(route.arkModelId)!.push(route);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.priority - b.priority);
    }
    return map;
  }, [routes]);

  const modelSuggestions = useMemo(() => {
    const fromRoutes = routes.map((item) => item.arkModelId);
    return Array.from(new Set([...MODEL_ID_SUGGESTIONS, ...fromRoutes])).sort((a, b) => a.localeCompare(b));
  }, [routes]);

  async function createRoute() {
    if (enabledChannels.length === 0) {
      setError(t("admin.routes.errors.noEnabledChannels"));
      return;
    }

    setCreating(true);
    setError(null);
    try {
      await apiClient.createAdminRoute({
        ark_model_id: form.ark_model_id.trim(),
        channel_id: form.channel_id,
        priority: Number(form.priority),
        enabled: form.enabled,
        upstream_model_override: form.upstream_model_override.trim() || undefined,
      });
      await loadAll();
      setForm(defaultForm(channels));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.routes.errors.create"));
    } finally {
      setCreating(false);
    }
  }

  function startEdit(route: AdminRouteRecord) {
    setEditingId(route.id);
    setEditForm({
      channel_id: route.channelId,
      priority: route.priority,
      enabled: route.enabled,
      upstream_model_override: route.upstreamModelOverride ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(route: AdminRouteRecord) {
    setSavingId(route.id);
    setError(null);
    try {
      await apiClient.updateAdminRoute(route.id, {
        channel_id: editForm.channel_id,
        priority: Number(editForm.priority),
        enabled: editForm.enabled,
        upstream_model_override: editForm.upstream_model_override.trim() || "",
      });
      setEditingId(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.routes.errors.update"));
    } finally {
      setSavingId(null);
    }
  }

  async function deleteRoute(routeId: string) {
    if (!confirm(t("admin.routes.confirmDelete"))) return;
    setSavingId(routeId);
    setError(null);
    try {
      await apiClient.deleteAdminRoute(routeId);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.routes.errors.delete"));
    } finally {
      setSavingId(null);
    }
  }

  async function movePriority(route: AdminRouteRecord, direction: "up" | "down") {
    const siblings = (groupedByModel.get(route.arkModelId) || []).slice().sort((a, b) => a.priority - b.priority);
    const index = siblings.findIndex((item) => item.id === route.id);
    if (index < 0) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= siblings.length) return;

    const current = siblings[index];
    const target = siblings[targetIndex];
    const used = new Set(siblings.map((item) => item.priority));
    let tempPriority = 1;
    while (used.has(tempPriority) && tempPriority <= 10) tempPriority += 1;
    if (tempPriority > 10) {
      setError(t("admin.routes.errors.swap"));
      return;
    }

    setSavingId(route.id);
    setError(null);
    try {
      await apiClient.updateAdminRoute(current.id, { priority: tempPriority });
      await apiClient.updateAdminRoute(target.id, { priority: current.priority });
      await apiClient.updateAdminRoute(current.id, { priority: target.priority });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.routes.errors.priority"));
      await loadAll();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <article className="rounded-2xl border border-amber-100/60 bg-white/80 p-6 shadow-[0_10px_24px_rgba(92,56,19,0.1)]">
        <h2 className="text-xl font-semibold text-stone-900">{t("admin.routes.title")}</h2>
        <p className="mt-1 text-sm text-stone-600">{t("admin.routes.subtitle")}</p>
      </article>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <article className="rounded-2xl border border-amber-100/60 bg-white/80 p-4 shadow-[0_10px_24px_rgba(92,56,19,0.1)] md:p-6">
        <h3 className="text-sm font-semibold text-stone-900">{t("admin.routes.create.title")}</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-12">
          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-medium text-stone-600">{t("admin.routes.table.modelId")}</label>
            <input
              className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm"
              list="admin-route-model-suggestions"
              placeholder={t("admin.routes.create.modelPlaceholder")}
              value={form.ark_model_id}
              onChange={(e) => setForm((prev) => ({ ...prev, ark_model_id: e.target.value }))}
            />
            <datalist id="admin-route-model-suggestions">
              {modelSuggestions.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </div>

          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-medium text-stone-600">{t("admin.routes.table.channel")}</label>
            <select
              className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm"
              value={form.channel_id}
              onChange={(e) => setForm((prev) => ({ ...prev, channel_id: e.target.value }))}
            >
              {enabledChannels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-stone-600">{t("admin.routes.table.priority")}</label>
            <input
              type="number"
              min={1}
              max={10}
              className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm"
              value={form.priority}
              onChange={(e) => setForm((prev) => ({ ...prev, priority: Number(e.target.value) || 1 }))}
            />
          </div>

          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-medium text-stone-600">{t("admin.routes.table.override")}</label>
            <input
              className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm"
              placeholder={t("admin.routes.create.overridePlaceholder")}
              value={form.upstream_model_override}
              onChange={(e) => setForm((prev) => ({ ...prev, upstream_model_override: e.target.value }))}
            />
          </div>

          <div className="flex items-end md:col-span-1">
            <button
              onClick={() => void createRoute()}
              disabled={creating}
              className="w-full rounded-lg bg-gradient-to-r from-[#E3C486] via-[#D7963A] to-[#B4693D] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {creating ? t("admin.common.creating") : t("admin.routes.create.add")}
            </button>
          </div>
        </div>
      </article>

      <article className="rounded-2xl border border-amber-100/60 bg-white/80 p-4 shadow-[0_10px_24px_rgba(92,56,19,0.1)] md:p-6">
        {loading ? (
          <p className="text-sm text-stone-600">{t("admin.routes.loading")}</p>
        ) : routes.length === 0 ? (
          <p className="text-sm text-stone-600">{t("admin.routes.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-sm text-stone-700">
              <thead>
                <tr className="border-b border-amber-100 text-xs uppercase tracking-[0.08em] text-stone-500">
                  <th className="w-[260px] py-3 pr-3">{t("admin.routes.table.modelId")}</th>
                  <th className="w-[90px] py-3 pr-3">{t("admin.routes.table.priority")}</th>
                  <th className="w-[230px] py-3 pr-3">{t("admin.routes.table.channel")}</th>
                  <th className="w-[260px] py-3 pr-3">{t("admin.routes.table.override")}</th>
                  <th className="w-[110px] py-3 pr-3">{t("admin.routes.table.enabled")}</th>
                  <th className="w-[280px] py-3">{t("admin.routes.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((route) => {
                  const siblings = groupedByModel.get(route.arkModelId) || [];
                  const idx = siblings.findIndex((item) => item.id === route.id);
                  const canUp = idx > 0;
                  const canDown = idx >= 0 && idx < siblings.length - 1;
                  const editing = editingId === route.id;

                  return (
                    <tr key={route.id} className="border-b border-amber-50 align-top">
                      <td className="py-3 pr-3 font-mono text-xs text-stone-700">{route.arkModelId}</td>

                      <td className="py-3 pr-3">
                        {editing ? (
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={editForm.priority}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, priority: Number(e.target.value) || 1 }))}
                            className="w-20 rounded-md border border-amber-200 px-2 py-1.5 text-sm"
                          />
                        ) : (
                          <span className="font-mono text-xs">{route.priority}</span>
                        )}
                      </td>

                      <td className="py-3 pr-3">
                        {editing ? (
                          <select
                            value={editForm.channel_id}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, channel_id: e.target.value }))}
                            className="w-full rounded-md border border-amber-200 px-2 py-1.5 text-sm"
                          >
                            {enabledChannels.map((channel) => (
                              <option key={channel.id} value={channel.id}>
                                {channel.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span>{route.channelName}</span>
                        )}
                      </td>

                      <td className="py-3 pr-3">
                        {editing ? (
                          <input
                            value={editForm.upstream_model_override}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, upstream_model_override: e.target.value }))}
                            placeholder={t("admin.routes.create.overridePlaceholder")}
                            className="w-full rounded-md border border-amber-200 px-2 py-1.5 text-sm"
                          />
                        ) : (
                          <span className="font-mono text-xs text-stone-600">{route.upstreamModelOverride || "-"}</span>
                        )}
                      </td>

                      <td className="py-3 pr-3">
                        {editing ? (
                          <button
                            type="button"
                            onClick={() => setEditForm((prev) => ({ ...prev, enabled: !prev.enabled }))}
                            className={`rounded-full px-2 py-1 text-xs font-medium ${
                              editForm.enabled ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-600"
                            }`}
                          >
                            {editForm.enabled ? t("admin.common.enabled") : t("admin.common.disabled")}
                          </button>
                        ) : (
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-medium ${
                              route.enabled ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-600"
                            }`}
                          >
                            {route.enabled ? t("admin.common.enabled") : t("admin.common.disabled")}
                          </span>
                        )}
                      </td>

                      <td className="py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => void movePriority(route, "up")}
                            disabled={!canUp || savingId === route.id || editing}
                            className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs font-medium text-stone-700 disabled:opacity-40"
                          >
                            {t("admin.routes.actions.up")}
                          </button>
                          <button
                            onClick={() => void movePriority(route, "down")}
                            disabled={!canDown || savingId === route.id || editing}
                            className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs font-medium text-stone-700 disabled:opacity-40"
                          >
                            {t("admin.routes.actions.down")}
                          </button>

                          {!editing ? (
                            <button
                              onClick={() => startEdit(route)}
                              disabled={savingId === route.id}
                              className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs font-medium text-stone-700 disabled:opacity-40"
                            >
                              {t("admin.common.edit")}
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => void saveEdit(route)}
                                disabled={savingId === route.id}
                                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 disabled:opacity-40"
                              >
                                {savingId === route.id ? t("admin.common.saving") : t("admin.routes.actions.save")}
                              </button>
                              <button
                                onClick={cancelEdit}
                                disabled={savingId === route.id}
                                className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-medium text-stone-700 disabled:opacity-40"
                              >
                                {t("admin.common.cancel")}
                              </button>
                            </>
                          )}

                          <button
                            onClick={() => void deleteRoute(route.id)}
                            disabled={savingId === route.id}
                            className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 disabled:opacity-40"
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
    </div>
  );
}
