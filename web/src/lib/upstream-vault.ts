export interface UpstreamKeyRecord {
  provider: string;
  apiKey: string;
  weight: number;
  status: "active" | "rate_limited" | "disabled";
  monthlyBudgetCapUsd: number;
  currentMonthSpentUsd: number;
}

const upstreamKeyVault: UpstreamKeyRecord[] = [
  {
    provider: "openai",
    apiKey: "[REDACTED]",
    weight: 5,
    status: "active",
    monthlyBudgetCapUsd: 3000,
    currentMonthSpentUsd: 642.5,
  },
  {
    provider: "deepseek",
    apiKey: "[REDACTED]",
    weight: 4,
    status: "active",
    monthlyBudgetCapUsd: 2200,
    currentMonthSpentUsd: 411.3,
  },
  {
    provider: "anthropic",
    apiKey: "[REDACTED]",
    weight: 3,
    status: "active",
    monthlyBudgetCapUsd: 2600,
    currentMonthSpentUsd: 733.1,
  },
];

export function listActiveUpstreamKeys(provider?: string): UpstreamKeyRecord[] {
  return upstreamKeyVault.filter((item) => item.status === "active" && (!provider || item.provider === provider));
}

export function pickWeightedUpstreamKey(provider: string): UpstreamKeyRecord | null {
  const candidates = listActiveUpstreamKeys(provider);
  if (!candidates.length) return null;
  const totalWeight = candidates.reduce((sum, item) => sum + item.weight, 0);
  let cursor = Math.random() * totalWeight;
  for (const item of candidates) {
    cursor -= item.weight;
    if (cursor <= 0) return item;
  }
  return candidates[candidates.length - 1] ?? null;
}
