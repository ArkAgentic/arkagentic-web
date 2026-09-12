export type UpstreamProvider = "openai" | "azure-openai" | "moonshot";

export type ModelRegistryEntry = {
  provider: UpstreamProvider;
  apiKey?: string;
  endpoint: string;
  targetModel: string | null;
  pricePer1kInput: number;
  pricePer1kOutput: number;
};

const openAiEndpoint = "https://api.openai.com/v1/chat/completions";
const moonshotEndpoint = "https://api.moonshot.cn/v1/chat/completions";
const azureOpenAiBase = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, "") || "";

export const MODEL_REGISTRY: Record<string, ModelRegistryEntry> = {
  "gpt-5.6-sona": {
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY,
    endpoint: openAiEndpoint,
    targetModel: "gpt-5.6-sona",
    pricePer1kInput: 0.005,
    pricePer1kOutput: 0.015,
  },
  "gpt-5.3-code": {
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY,
    endpoint: openAiEndpoint,
    targetModel: "gpt-4o-mini",
    pricePer1kInput: 0.0005,
    pricePer1kOutput: 0.0015,
  },
  "azure-gpt-4o": {
    provider: "azure-openai",
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: `${azureOpenAiBase}/openai/deployments/gpt-4o-prod/chat/completions?api-version=2024-02-15-preview`,
    targetModel: null,
    pricePer1kInput: 0.002,
    pricePer1kOutput: 0.006,
  },
  "ark-kimi-k2": {
    provider: "moonshot",
    apiKey: process.env.MOONSHOT_API_KEY,
    endpoint: moonshotEndpoint,
    targetModel: "moonshot-v1-8k",
    pricePer1kInput: 0.0017,
    pricePer1kOutput: 0.0017,
  },
};

export function getModelRegistryEntry(model: string): ModelRegistryEntry | null {
  return MODEL_REGISTRY[model] ?? null;
}
