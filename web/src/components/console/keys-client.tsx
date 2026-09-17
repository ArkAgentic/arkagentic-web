"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiClientError, apiClient, formatUsd, type ApiKeyRecord } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";

type CreateForm = {
  name: string;
  spendLimitUsd: string;
};

type EditForm = {
  id: string;
  name: string;
  spendLimitUsd: string;
  usedAmountUsd: number;
};

function toDisplayDate(value: string | null): string {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toISOString().replace("T", " ").slice(0, 19);
}

function toSpendInput(value: number | null): string {
  if (value == null) return "";
  return String(value);
}

function getErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiClientError)) return null;
  const details = error.details as Record<string, unknown> | null;
  if (typeof details?.code === "string") return details.code;
  if (typeof details?.error === "object" && details.error && typeof (details.error as Record<string, unknown>).code === "string") {
    return (details.error as Record<string, unknown>).code as string;
  }
  return null;
}

function parseLimitInput(raw: string): { ok: true; value: number | null } | { ok: false } {
  const text = raw.trim();
  if (!text || text === "0") return { ok: true, value: null };
  if (!/^\d+(\.\d{0,2})?$/.test(text)) return { ok: false };
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false };
  return { ok: true, value: value <= 0 ? null : value };
}

function sanitizeLimitInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (!cleaned) return "";

  let output = "";
  let dotSeen = false;
  for (const ch of cleaned) {
    if (ch === ".") {
      if (dotSeen) continue;
      dotSeen = true;
      output += output === "" ? "0." : ".";
      continue;
    }
    output += ch;
  }
  const dotIndex = output.indexOf(".");
  if (dotIndex === -1) return output;
  const intPart = output.slice(0, dotIndex);
  const decimalPart = output.slice(dotIndex + 1, dotIndex + 3);
  return `${intPart}.${decimalPart}`;
}

function normalizeLimitOnBlur(raw: string): string {
  const sanitized = sanitizeLimitInput(raw).trim();
  if (!sanitized) return "";
  const value = Number(sanitized);
  if (!Number.isFinite(value)) return "";
  if (value <= 0) return "0";
  return value.toFixed(2);
}

export function KeysClientPanel() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateForm>({ name: "", spendLimitUsd: "" });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EditForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string>("");
  const { t } = useI18n();

  const refresh = async () => {
    const next = await apiClient.getKeys();
    setKeys(next);
  };

  useEffect(() => {
    void apiClient.getKeys().then(setKeys);
  }, []);

  const activeCount = useMemo(() => keys.filter((k) => k.active).length, [keys]);
  const maxActiveKeys = 5;
  const totalKeyCount = keys.length;
  const createDisabled = creating || totalKeyCount >= maxActiveKeys;

  const onCopy = async (record: ApiKeyRecord) => {
    if (!record.revealedValue) {
      setFormError(t("console.keys.errors.copyUnavailable"));
      return;
    }
    const value = record.revealedValue;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(record.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setCopiedId(null);
    }
  };

  const onToggle = async (id: string) => {
    setFormError("");
    setTogglingId(id);
    try {
      const next = await apiClient.toggleKey(id);
      setKeys(next);
    } catch {
      setFormError(t("console.keys.errors.operationFailed"));
      await refresh();
    } finally {
      setTogglingId(null);
    }
  };

  const onCreate = async () => {
    setFormError("");
    if (totalKeyCount >= maxActiveKeys) {
      return;
    }

    setCreating(true);
    try {
      const parsedCreateLimit = parseLimitInput(createForm.spendLimitUsd);
      if (!parsedCreateLimit.ok) {
        setFormError(t("console.keys.errors.limitMustBeNumber"));
        return;
      }

      await apiClient.createKey({
        name: createForm.name.trim() || undefined,
        spendLimitUsd: parsedCreateLimit.value,
      });
      setCreateForm({ name: "", spendLimitUsd: "" });
      await refresh();
    } catch (error) {
      const code = getErrorCode(error);
      if (code === "KEY_LIMIT_REACHED") {
        setFormError(t("console.keys.maxPerAccount").replace("{max}", String(maxActiveKeys)));
      } else if (code === "SPEND_LIMIT_INVALID") {
        setFormError(t("console.keys.errors.limitMustBeNumber"));
      } else {
        setFormError(t("console.keys.errors.operationFailed"));
      }
    } finally {
      setCreating(false);
    }
  };

  const onSaveEdit = async () => {
    if (!editing) return;

    setFormError("");
    const parsedLimit = parseLimitInput(editing.spendLimitUsd);
    if (!parsedLimit.ok) {
      setFormError(t("console.keys.errors.limitMustBeNumber"));
      return;
    }
    if (parsedLimit.value != null && parsedLimit.value + 1e-9 < editing.usedAmountUsd) {
      setFormError(t("console.keys.errors.limitBelowUsed"));
      return;
    }

    setSavingEdit(true);
    try {
      const next = await apiClient.updateKey(editing.id, {
        name: editing.name.trim(),
        spendLimitUsd: parsedLimit.value,
      });
      setKeys(next);
      setEditing(null);
    } catch (error) {
      const code = getErrorCode(error);
      if (code === "SPEND_LIMIT_BELOW_USED") {
        setFormError(t("console.keys.errors.limitBelowUsed"));
      } else if (code === "SPEND_LIMIT_INVALID") {
        setFormError(t("console.keys.errors.limitMustBeNumber"));
      } else {
        setFormError(t("console.keys.errors.operationFailed"));
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const onDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const next = await apiClient.deleteKey(id);
      setKeys(next);
      if (editing?.id === id) setEditing(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">{t("console.keys.title")}</h1>
            <p className="mt-1 text-sm text-stone-600">{t("console.keys.subtitle").replace("{count}", String(totalKeyCount))}</p>
            <p className="mt-1 text-xs text-stone-500">{t("console.keys.maxPerAccount").replace("{max}", String(maxActiveKeys))}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[1.2fr_1fr_auto]">
          <label className="text-sm text-stone-700">
            <span className="mb-1 block">{t("console.keys.form.name")}</span>
            <input
              value={createForm.name}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={t("console.keys.form.namePlaceholder")}
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
            />
          </label>
          <label className="text-sm text-stone-700">
            <span className="mb-1 block">{t("console.keys.form.spendLimit")}</span>
            <input
              value={createForm.spendLimitUsd}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, spendLimitUsd: sanitizeLimitInput(e.target.value) }))}
              onBlur={(e) =>
                setCreateForm((prev) => ({
                  ...prev,
                  spendLimitUsd: normalizeLimitOnBlur(e.target.value),
                }))
              }
              placeholder={t("console.keys.form.spendLimitPlaceholder")}
              inputMode="decimal"
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
            />
          </label>
          <button
            onClick={onCreate}
            disabled={createDisabled}
            className="h-10 self-end rounded-xl bg-stone-900 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? t("console.keys.form.creating") : t("console.keys.newKey")}
          </button>
        </div>
        {formError ? <p className="mt-2 text-sm text-rose-700">{formError}</p> : null}
      </article>

      <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-900">{t("console.keys.table.title")}</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500">
                <th className="py-2 pr-3">{t("console.keys.table.name")}</th>
                <th className="py-2 pr-3">{t("console.keys.table.masked")}</th>
                <th className="py-2 pr-3">{t("console.keys.table.usageLimit")}</th>
                <th className="py-2 pr-3">{t("console.keys.table.lastUsed")}</th>
                <th className="py-2 pr-3">{t("console.keys.table.status")}</th>
                <th className="w-[240px] py-2 pr-0 text-right">{t("console.keys.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((record) => {
                const isEditing = editing?.id === record.id;
                return (
                  <tr key={record.id} className="border-b border-stone-100 text-stone-700">
                    <td className="py-3 pr-3">
                      {isEditing ? (
                        <input
                          value={editing.name}
                          onChange={(e) => setEditing((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                          className="w-full rounded-lg border border-stone-300 px-2 py-1 text-sm"
                        />
                      ) : (
                        <p className="font-medium text-stone-900">{record.name}</p>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <code
                          className="inline-block w-[120px] overflow-hidden text-ellipsis whitespace-nowrap rounded bg-stone-100 px-2 py-1 text-xs text-stone-800"
                          title={record.maskedValue}
                        >
                          {record.maskedValue}
                        </code>
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      {isEditing ? (
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <p className="text-xs text-stone-500">{formatUsd(editing.usedAmountUsd)} /</p>
                          <input
                            type="text"
                            value={editing.spendLimitUsd}
                            onChange={(e) =>
                              setEditing((prev) =>
                                prev ? { ...prev, spendLimitUsd: sanitizeLimitInput(e.target.value) } : prev,
                              )
                            }
                            onBlur={(e) =>
                              setEditing((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      spendLimitUsd: normalizeLimitOnBlur(e.target.value),
                                    }
                                  : prev,
                              )
                            }
                            className="w-20 rounded-lg border border-stone-300 px-2 py-1 text-sm"
                            inputMode="decimal"
                            pattern="^\\d+(\\.\\d+)?$"
                            placeholder={t("console.keys.form.spendLimitPlaceholder")}
                          />
                        </div>
                      ) : (
                        <span>
                          {formatUsd(record.usedAmountUsd)} / {record.spendLimitUsd == null ? t("console.keys.unlimited") : formatUsd(record.spendLimitUsd)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-3">{toDisplayDate(record.lastUsedAt)}</td>
                    <td className="py-3 pr-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          record.active ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-700"
                        }`}
                      >
                        {record.active ? t("console.keys.status.active") : t("console.keys.status.disabled")}
                      </span>
                    </td>
                    <td className="py-3 pr-0">
                      <div className="flex items-center justify-end gap-2">
                        {isEditing ? (
                          <>
                            <button
                              onClick={onSaveEdit}
                              disabled={savingEdit}
                              className="rounded border border-stone-300 px-2 py-1 text-xs"
                            >
                              {savingEdit ? t("console.keys.saving") : t("console.keys.save")}
                            </button>
                            <button onClick={() => setEditing(null)} className="rounded border border-stone-300 px-2 py-1 text-xs">
                              {t("console.keys.cancel")}
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => onCopy(record)} className="rounded border border-stone-300 px-2 py-1 text-xs">
                              {copiedId === record.id ? t("console.keys.copied") : t("console.keys.copy")}
                            </button>
                            <button
                              onClick={() => onToggle(record.id)}
                              disabled={togglingId === record.id}
                              className="rounded border border-stone-300 px-2 py-1 text-xs disabled:opacity-60"
                            >
                              {record.active ? t("console.keys.disable") : t("console.keys.enable")}
                            </button>
                            <button
                              onClick={() =>
                                setEditing({
                                  id: record.id,
                                  name: record.name,
                                  spendLimitUsd: toSpendInput(record.spendLimitUsd),
                                  usedAmountUsd: record.usedAmountUsd,
                                })
                              }
                              className="rounded border border-stone-300 px-2 py-1 text-xs"
                            >
                              {t("console.keys.edit")}
                            </button>
                            <button
                              onClick={() => onDelete(record.id)}
                              disabled={deletingId === record.id}
                              className="rounded border border-rose-200 px-2 py-1 text-xs text-rose-700 disabled:opacity-60"
                            >
                              {deletingId === record.id ? t("console.keys.deleting") : t("console.keys.delete")}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>
    </>
  );
}
