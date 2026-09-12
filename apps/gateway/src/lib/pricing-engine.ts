import type { PricingTier } from "./db-schema";
import type { ModelPricingConfig } from "./pricing-schema";

export function resolvePricingTier(totalDepositedUsd: number): PricingTier {
  if (totalDepositedUsd >= 200) return "tier_3";
  if (totalDepositedUsd >= 50) return "tier_2";
  return "tier_1";
}

export function calculateRequestCost(
  config: ModelPricingConfig,
  promptTokens: number,
  completionTokens: number,
): { totalCostUsd: number; upstreamCostUsd: number; netProfitUsd: number } {
  const totalCost =
    (promptTokens / 1000) * config.costPer1kInputToken +
    (completionTokens / 1000) * config.costPer1kOutputToken +
    config.fixedFeePerRequestUsd;

  return {
    totalCostUsd: Number(totalCost.toFixed(6)),
    upstreamCostUsd: Number(totalCost.toFixed(6)),
    netProfitUsd: 0,
  };
}

export function calculateTieredCost(args: {
  promptTokens: number;
  completionTokens: number;
  totalDepositedUsd: number;
  inputCostPer1k?: number;
  outputCostPer1k?: number;
}): {
  tier: PricingTier;
  multiplier: number;
  upstreamCostUsd: number;
  userChargeUsd: number;
  netProfitUsd: number;
} {
  const inputPer1k = args.inputCostPer1k ?? 0.0017;
  const outputPer1k = args.outputCostPer1k ?? 0.0017;

  const tier = resolvePricingTier(args.totalDepositedUsd);
  const multiplier = 1;

  const upstreamCost =
    ((args.promptTokens * inputPer1k) + (args.completionTokens * outputPer1k)) / 1000;
  const userCharge = upstreamCost;
  const netProfit = 0;

  return {
    tier,
    multiplier,
    upstreamCostUsd: Number(upstreamCost.toFixed(6)),
    userChargeUsd: Number(userCharge.toFixed(6)),
    netProfitUsd: Number(netProfit.toFixed(6)),
  };
}

export function getUserPricePer1k(config: ModelPricingConfig): { input: number; output: number } {
  return {
    input: Number(config.costPer1kInputToken.toFixed(6)),
    output: Number(config.costPer1kOutputToken.toFixed(6)),
  };
}

export function formatPricePer1M(valuePer1k: number): string {
  return `$${(valuePer1k * 1000).toFixed(2)} / 1M`;
}
