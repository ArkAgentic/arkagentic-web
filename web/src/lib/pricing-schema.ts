export interface ModelPricingConfig {
  modelId: string;
  upstreamModelId: string;
  provider: "openai" | "anthropic" | "deepseek" | "siliconflow" | "qwen" | "moonshot";
  costPer1kInputToken: number;
  costPer1kOutputToken: number;
  markupPercentage: number;
  fixedFeePerRequestUsd: number;
}

export const modelPricingTable: ModelPricingConfig[] = [
  {
    modelId: "ark-gpt-4o",
    upstreamModelId: "gpt-4o",
    provider: "openai",
    costPer1kInputToken: 0.005,
    costPer1kOutputToken: 0.015,
    markupPercentage: 0.25,
    fixedFeePerRequestUsd: 0,
  },
  {
    modelId: "ark-gpt-5.3-codex",
    upstreamModelId: "gpt-5.3-codex",
    provider: "openai",
    costPer1kInputToken: 0.015,
    costPer1kOutputToken: 0.06,
    markupPercentage: 0.25,
    fixedFeePerRequestUsd: 0,
  },
  {
    modelId: "ark-claude-sonnet-5",
    upstreamModelId: "claude-sonnet-5",
    provider: "anthropic",
    costPer1kInputToken: 0.003,
    costPer1kOutputToken: 0.015,
    markupPercentage: 0.25,
    fixedFeePerRequestUsd: 0,
  },
  {
    modelId: "ark-claude-opus-5",
    upstreamModelId: "claude-opus-5",
    provider: "anthropic",
    costPer1kInputToken: 0.015,
    costPer1kOutputToken: 0.075,
    markupPercentage: 0.25,
    fixedFeePerRequestUsd: 0,
  },
  {
    modelId: "ark-deepseek-v4-pro",
    upstreamModelId: "DeepSeek-V4-Pro",
    provider: "deepseek",
    costPer1kInputToken: 0.0012,
    costPer1kOutputToken: 0.0048,
    markupPercentage: 0.25,
    fixedFeePerRequestUsd: 0,
  },
  {
    modelId: "ark-deepseek-v4-flash",
    upstreamModelId: "DeepSeek-V4-Flash",
    provider: "deepseek",
    costPer1kInputToken: 0.0006,
    costPer1kOutputToken: 0.0024,
    markupPercentage: 0.25,
    fixedFeePerRequestUsd: 0,
  },
  {
    modelId: "ark-mai-thinking-1",
    upstreamModelId: "MAI-Thinking-1",
    provider: "openai",
    costPer1kInputToken: 0.004,
    costPer1kOutputToken: 0.016,
    markupPercentage: 0.25,
    fixedFeePerRequestUsd: 0,
  },
  {
    modelId: "ark-cohere-embed-v3",
    upstreamModelId: "Cohere-embed-v3-multilingual",
    provider: "openai",
    costPer1kInputToken: 0.0002,
    costPer1kOutputToken: 0,
    markupPercentage: 0.25,
    fixedFeePerRequestUsd: 0,
  },
  {
    modelId: "ark-cohere-rerank-v4-pro",
    upstreamModelId: "Cohere-rerank-v4.0-pro",
    provider: "openai",
    costPer1kInputToken: 0.0005,
    costPer1kOutputToken: 0,
    markupPercentage: 0.25,
    fixedFeePerRequestUsd: 0,
  },
  {
    modelId: "ark-cohere-rerank-v4-fast",
    upstreamModelId: "Cohere-rerank-v4.0-fast",
    provider: "openai",
    costPer1kInputToken: 0.00025,
    costPer1kOutputToken: 0,
    markupPercentage: 0.25,
    fixedFeePerRequestUsd: 0,
  },
  {
    modelId: "ark-mai-image-2.5-pro",
    upstreamModelId: "MAI-Image-2.5-Pro",
    provider: "openai",
    costPer1kInputToken: 0.001,
    costPer1kOutputToken: 0,
    markupPercentage: 0.25,
    fixedFeePerRequestUsd: 0,
  },
  {
    modelId: "ark-mai-transcribe-1.5",
    upstreamModelId: "MAI-Transcribe-1.5",
    provider: "openai",
    costPer1kInputToken: 0.0008,
    costPer1kOutputToken: 0,
    markupPercentage: 0.25,
    fixedFeePerRequestUsd: 0,
  },
  {
    modelId: "ark-mai-voice-2",
    upstreamModelId: "MAI-Voice-2",
    provider: "openai",
    costPer1kInputToken: 0.001,
    costPer1kOutputToken: 0,
    markupPercentage: 0.25,
    fixedFeePerRequestUsd: 0,
  },
  // legacy models kept for backward compatibility
  {
    modelId: "ark-claude-3-5-sonnet",
    upstreamModelId: "claude-3-5-sonnet",
    provider: "anthropic",
    costPer1kInputToken: 0.003,
    costPer1kOutputToken: 0.015,
    markupPercentage: 0.25,
    fixedFeePerRequestUsd: 0,
  },
  {
    modelId: "ark-gemini-1.5-pro",
    upstreamModelId: "gemini-1.5-pro",
    provider: "openai",
    costPer1kInputToken: 0.0035,
    costPer1kOutputToken: 0.0105,
    markupPercentage: 0.25,
    fixedFeePerRequestUsd: 0,
  },
  {
    modelId: "ark-deepseek-r1",
    upstreamModelId: "deepseek-reasoner",
    provider: "deepseek",
    costPer1kInputToken: 0.00055,
    costPer1kOutputToken: 0.00219,
    markupPercentage: 0.25,
    fixedFeePerRequestUsd: 0,
  },
  {
    modelId: "ark-qwen-2.5-max",
    upstreamModelId: "qwen-2.5-max",
    provider: "qwen",
    costPer1kInputToken: 0.0009,
    costPer1kOutputToken: 0.0032,
    markupPercentage: 0.25,
    fixedFeePerRequestUsd: 0,
  },
  {
    modelId: "ark-kimi-k2",
    upstreamModelId: "moonshot-v1-8k",
    provider: "moonshot",
    costPer1kInputToken: 0.0017,
    costPer1kOutputToken: 0.0017,
    markupPercentage: 0.25,
    fixedFeePerRequestUsd: 0,
  },
  {
    modelId: "ark-glm-4",
    upstreamModelId: "glm-4",
    provider: "siliconflow",
    costPer1kInputToken: 0.00085,
    costPer1kOutputToken: 0.0031,
    markupPercentage: 0.25,
    fixedFeePerRequestUsd: 0,
  },
];

export const tierMultipliers = {
  tier_1: 1,
  tier_2: 1,
  tier_3: 1,
} as const;

export function getPricingConfig(modelId: string): ModelPricingConfig | undefined {
  return modelPricingTable.find((item) => item.modelId === modelId);
}
