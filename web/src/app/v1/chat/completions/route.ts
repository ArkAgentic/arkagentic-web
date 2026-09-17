import { NextRequest, NextResponse } from "next/server";
import { chargeUsage, getApiKeyUsageGuard, getCurrentUserBalance, releaseQuotaHold, reserveQuotaHold, resolveApiKey } from "@/lib/server-store";
import { acquireApiKeyConcurrencySlot, acquireUpstreamQueueSlot, enforceSlidingWindowRateLimit } from "@/lib/rate-limit";
import { getRuntimePricing } from "@/lib/model-pricing-store";
import { ensureGlobalHttpDispatcher } from "@/lib/http-dispatcher";
import { getUpstreamCandidatesForModel, type UpstreamCandidate } from "@/lib/upstream-store";
import { fetchViaResponsesAdapter, shouldUseResponsesAdapter } from "@/lib/upstream-adapters/azure-responses";

type ChatCompletionBody = {
  model?: string;
  stream?: boolean;
  messages?: Array<{ role?: string; content?: string }>;
  [key: string]: unknown;
};

type AttemptResult = {
  response: Response;
  candidate: UpstreamCandidate;
  attempts: number;
  actualModel: string;
  fallbackApplied: boolean;
};

const MODEL_FALLBACKS: Record<string, string[]> = {
  "ark-gpt-4o": ["ark-gpt-4o-mini", "gpt-4o-mini", "ark-gpt-5.6-luna", "ark-gpt-5.6-sol", "ark-gpt-5.6-terra"],
  "gpt-4o": ["gpt-4o-mini", "ark-gpt-4o-mini", "ark-gpt-5.6-luna", "ark-gpt-5.6-sol", "ark-gpt-5.6-terra"],
  "ark-claude-sonnet-5": ["ark-claude-haiku-4-5", "claude-haiku-4-5"],
  "claude-sonnet-5": ["claude-haiku-4-5", "ark-claude-haiku-4-5"],
};

const MIN_PREPAID_BALANCE_USD = 0.005;
const INSUFFICIENT_BALANCE_MESSAGE = "Insufficient balance. Please recharge your account at /pricing";

function parseBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isMissingAzureDeploymentError(status: number, bodyText: string): boolean {
  if (status !== 404) return false;
  return /api deployment for this resource does not exist/i.test(bodyText);
}

function resolveAzureApiVersion(candidate: UpstreamCandidate): string {
  const metadata = candidate.metadata || {};
  const configured = metadata.apiVersion ?? metadata.api_version;
  if (typeof configured === "string" && configured.trim()) return configured.trim();
  if (candidate.baseUrl.includes("/api/projects/")) return "2024-05-01-preview";
  return "2024-02-01";
}

function buildAzureRequest(candidate: UpstreamCandidate, upstreamPayload: Record<string, unknown>, apiVersion: string) {
  const base = candidate.baseUrl.replace(/\/$/, "");
  const isProjectEndpoint = /\/api\/projects\//i.test(base);

  if (isProjectEndpoint) {
    upstreamPayload.model = candidate.upstreamModel;
    return `${base}/models/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
  }

  delete upstreamPayload.model;
  return `${base}/openai/deployments/${encodeURIComponent(candidate.upstreamModel)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
}

function buildUpstreamRequest(candidate: UpstreamCandidate, body: ChatCompletionBody) {
  const upstreamPayload: Record<string, unknown> = { ...body };

  let endpoint = "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (candidate.channelType === "azure_openai") {
    const apiVersion = resolveAzureApiVersion(candidate);
    endpoint = buildAzureRequest(candidate, upstreamPayload, apiVersion);
    headers["api-key"] = candidate.apiKey;
  } else {
    endpoint = `${candidate.baseUrl}/chat/completions`;
    headers.Authorization = `Bearer ${candidate.apiKey}`;
    upstreamPayload.model = candidate.upstreamModel;
  }

  return {
    endpoint,
    headers,
    body: JSON.stringify(upstreamPayload),
  };
}

function estimateTokensFromText(text: string): number {
  const clean = String(text || "");
  if (!clean) return 0;
  return Math.max(1, Math.ceil(clean.length / 4));
}

function estimatePromptTokensFromMessages(messages: Array<{ role?: string; content?: string }> | undefined): number {
  if (!messages || !Array.isArray(messages)) return 0;
  let chars = 0;
  for (const m of messages) {
    const role = String(m.role || "");
    const content = String(m.content || "");
    chars += role.length + content.length + 6;
  }
  return estimateTokensFromText("x".repeat(chars));
}

function resolveRequestedMaxTokens(body: ChatCompletionBody): number {
  const direct = Number((body as { max_tokens?: number }).max_tokens ?? 0);
  const completion = Number((body as { max_completion_tokens?: number }).max_completion_tokens ?? 0);
  const candidate = Math.max(0, direct, completion);
  if (!Number.isFinite(candidate) || candidate <= 0) return 512;
  return Math.min(8192, Math.round(candidate));
}

function estimateReservationCostUsd(params: {
  promptMessages?: Array<{ role?: string; content?: string }>;
  maxTokens: number;
  inputPricePer1k: number;
  outputPricePer1k: number;
}): number {
  const promptEstimate = Math.max(1, estimatePromptTokensFromMessages(params.promptMessages));
  const completionEstimate = Math.max(1, params.maxTokens);
  const usd =
    ((promptEstimate * params.inputPricePer1k) + (completionEstimate * params.outputPricePer1k)) / 1000;
  return Math.max(MIN_PREPAID_BALANCE_USD, Number(usd.toFixed(6)));
}

async function parseUsageFromSseChunk(
  chunk: string,
  usageRef: { prompt: number; completion: number },
  completionTextRef: { text: string },
) {
  const lines = chunk.split("\n").map((line) => line.trim());
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;

    try {
      const json = JSON.parse(payload) as {
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        choices?: Array<{ delta?: { content?: string } }>;
      };

      if (json.usage) {
        usageRef.prompt = Math.max(usageRef.prompt, Number(json.usage.prompt_tokens ?? 0));
        usageRef.completion = Math.max(usageRef.completion, Number(json.usage.completion_tokens ?? 0));
      }

      const deltaContent = json.choices?.[0]?.delta?.content;
      if (typeof deltaContent === "string" && deltaContent) {
        completionTextRef.text += deltaContent;
      }
    } catch {
      // ignore partial chunks / non-json lines
    }
  }
}

async function relayStreamAndBill(params: {
  upstreamResponse: Response;
  modelId: string;
  userId: string;
  apiKeyId: string;
  inputPricePer1k: number;
  outputPricePer1k: number;
  promptMessages?: Array<{ role?: string; content?: string }>;
  streamBudgetUsd: number;
  reservationId?: string;
}): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const usage = { prompt: 0, completion: 0 };
  const completionTextRef = { text: "" };

  const source = params.upstreamResponse.body;
  if (!source) throw new Error("Missing upstream stream body");

  const reader = source.getReader();
  let budgetExceeded = false;
  const promptEstimate = Math.max(0, estimatePromptTokensFromMessages(params.promptMessages));

  const estimatedCost = () => {
    const promptTokens = Math.max(usage.prompt, promptEstimate);
    const completionTokens = Math.max(usage.completion, estimateTokensFromText(completionTextRef.text));
    return ((promptTokens * params.inputPricePer1k) + (completionTokens * params.outputPricePer1k)) / 1000;
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();

        if (done) {
          let promptTokens = usage.prompt;
          let completionTokens = usage.completion;

          if (promptTokens <= 0 && completionTokens <= 0) {
            promptTokens = estimatePromptTokensFromMessages(params.promptMessages);
            completionTokens = estimateTokensFromText(completionTextRef.text);
          }

          if (promptTokens > 0 || completionTokens > 0) {
            await chargeUsage({
              userId: params.userId,
              apiKeyId: params.apiKeyId,
              modelId: params.modelId,
              promptTokens,
              completionTokens,
              statusCode: params.upstreamResponse.status,
              inputPricePer1k: params.inputPricePer1k,
              outputPricePer1k: params.outputPricePer1k,
              reservationId: params.reservationId,
            });
          }

          if (budgetExceeded) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  error: {
                    message: INSUFFICIENT_BALANCE_MESSAGE,
                    type: "insufficient_balance",
                    code: "balance_depleted",
                  },
                })}\n\n`,
              ),
            );
          }

          controller.close();
          return;
        }

        const text = decoder.decode(value, { stream: true });
        await parseUsageFromSseChunk(text, usage, completionTextRef);
        const costSoFar = estimatedCost();
        if (costSoFar >= params.streamBudgetUsd) {
          budgetExceeded = true;
          const promptTokens = Math.max(usage.prompt, promptEstimate);
          const completionTokens = Math.max(usage.completion, estimateTokensFromText(completionTextRef.text));
          try {
            if (promptTokens > 0 || completionTokens > 0) {
              await chargeUsage({
                userId: params.userId,
                apiKeyId: params.apiKeyId,
                modelId: params.modelId,
                promptTokens,
                completionTokens,
                statusCode: 402,
                inputPricePer1k: params.inputPricePer1k,
                outputPricePer1k: params.outputPricePer1k,
                reservationId: params.reservationId,
              });
            }
          } catch {
            // best effort charge path for cutoff
          }
          try {
            await reader.cancel();
          } catch {
            // ignore
          }
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                error: {
                  message: INSUFFICIENT_BALANCE_MESSAGE,
                  type: "insufficient_balance",
                  code: "balance_depleted",
                },
              })}\n\n`,
            ),
          );
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(text));
      } catch (error) {
        console.error("stream_reader_failed", {
          model: params.modelId,
          status: params.upstreamResponse.status,
          message: error instanceof Error ? error.message : String(error),
        });
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              error: {
                message: "Upstream stream transport failed.",
                type: "stream_transport_error",
              },
            })}\n\n`,
          ),
        );
        controller.close();
      }
    },
    cancel() {
      void reader.cancel();
    },
  });
}

async function fetchOneCandidate(
  candidate: UpstreamCandidate,
  body: ChatCompletionBody,
  requestedModel: string,
): Promise<Response> {
  if (shouldUseResponsesAdapter(candidate, requestedModel)) {
    return fetchViaResponsesAdapter(candidate, body, requestedModel);
  }

  const upstreamRequest = buildUpstreamRequest(candidate, body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, candidate.timeoutMs || 45000));

  try {
    return await fetch(upstreamRequest.endpoint, {
      method: "POST",
      headers: upstreamRequest.headers,
      body: upstreamRequest.body,
      signal: controller.signal,
    });
  } catch (error) {
    console.error("upstream_fetch_failed", {
      requested_model: requestedModel,
      channel_id: candidate.channelId,
      channel_type: candidate.channelType,
      endpoint: upstreamRequest.endpoint,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function resolveFallbackModels(requestedModel: string): string[] {
  const exact = MODEL_FALLBACKS[requestedModel] ?? [];
  if (exact.length) return exact;
  const lowered = requestedModel.toLowerCase();
  return MODEL_FALLBACKS[lowered] ?? [];
}

async function fetchWithFailover(
  candidates: UpstreamCandidate[],
  body: ChatCompletionBody,
  requestedModel: string,
  opts?: { skipPrimary?: boolean },
): Promise<AttemptResult> {
  const maxAttempts = Math.min(3, candidates.length);
  if (!opts?.skipPrimary && maxAttempts === 0) throw new Error("No upstream channels available for this model");

  let attempts = 0;
  let lastError: Error | null = null;
  let sawRetryableFailure = Boolean(opts?.skipPrimary);
  let lastPrimaryFailure: { response: Response; candidate: UpstreamCandidate } | null = null;

  if (!opts?.skipPrimary) {
    for (const candidate of candidates.slice(0, maxAttempts)) {
      attempts += 1;
      try {
        const response = await fetchOneCandidate(candidate, body, requestedModel);
        if (response.ok) {
          return { response, candidate, attempts, actualModel: requestedModel, fallbackApplied: false };
        }

        const responseText = await response.clone().text();
        const retryable = isRetryableStatus(response.status) || isMissingAzureDeploymentError(response.status, responseText);
        if (retryable) sawRetryableFailure = true;
        lastPrimaryFailure = { response, candidate };

        if (attempts < maxAttempts && retryable) {
          const backoffMs = attempts === 1 ? 100 : 250;
          console.info("channel_switched", {
            channel_switched: true,
            from_channel_id: candidate.channelId,
            status: response.status,
            reason: isMissingAzureDeploymentError(response.status, responseText) ? "missing_deployment" : "retryable_status",
            attempt: attempts,
            backoff_ms: backoffMs,
          });
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        // If we've already seen retryable failures, still give model-level fallback a chance
        if (!retryable && sawRetryableFailure) {
          console.warn("primary_non_retryable_after_retryable", {
            requested_model: requestedModel,
            channel_id: candidate.channelId,
            status: response.status,
            attempt: attempts,
          });
          break;
        }

        return { response, candidate, attempts, actualModel: requestedModel, fallbackApplied: false };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        sawRetryableFailure = true;
        if (attempts < maxAttempts) {
          const backoffMs = attempts === 1 ? 100 : 250;
          console.info("channel_switched", {
            channel_switched: true,
            from_channel_id: candidate.channelId,
            status: "fetch_error",
            attempt: attempts,
            backoff_ms: backoffMs,
          });
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
        if (attempts >= maxAttempts) break;
      }
    }
  }

  const fallbackModels = resolveFallbackModels(requestedModel);
  let lastFallbackFailure: { response: Response; candidate: UpstreamCandidate; model: string } | null = null;
  if (sawRetryableFailure && !fallbackModels.length) {
    console.warn("model_fallback_mapping_missing", {
      requested_model: requestedModel,
      reason: "no_fallback_mapping",
    });
  }
  if (sawRetryableFailure && fallbackModels.length) {
    for (const fallbackModel of fallbackModels) {
      const fallbackCandidates = await getUpstreamCandidatesForModel(fallbackModel);
      if (!fallbackCandidates.length) continue;

      const fallbackBody: ChatCompletionBody = { ...body, model: fallbackModel };
      const fallbackAttempts = Math.min(3, fallbackCandidates.length);
      for (const candidate of fallbackCandidates.slice(0, fallbackAttempts)) {
        try {
          const response = await fetchOneCandidate(candidate, fallbackBody, fallbackModel);
          if (response.ok) {
            console.info("model_fallback_triggered", {
              requested_model: requestedModel,
              actual_model: fallbackModel,
              channel_id: candidate.channelId,
              attempt: attempts + 1,
              status: response.status,
            });
            return {
              response,
              candidate,
              attempts: attempts + 1,
              actualModel: fallbackModel,
              fallbackApplied: true,
            };
          }

          lastFallbackFailure = { response, candidate, model: fallbackModel };
          if (!isRetryableStatus(response.status)) {
            console.warn("model_fallback_non_retryable", {
              requested_model: requestedModel,
              actual_model: fallbackModel,
              channel_id: candidate.channelId,
              status: response.status,
            });
            return {
              response,
              candidate,
              attempts: attempts + 1,
              actualModel: fallbackModel,
              fallbackApplied: true,
            };
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
      }
    }

    if (lastFallbackFailure) {
      return {
        response: lastFallbackFailure.response,
        candidate: lastFallbackFailure.candidate,
        attempts: attempts + 1,
        actualModel: lastFallbackFailure.model,
        fallbackApplied: true,
      };
    }
  }

  if (lastPrimaryFailure) {
    return {
      response: lastPrimaryFailure.response,
      candidate: lastPrimaryFailure.candidate,
      attempts,
      actualModel: requestedModel,
      fallbackApplied: false,
    };
  }

  throw new Error(lastError?.message || "All upstream channels failed");
}

export async function POST(request: NextRequest) {
  const bearer = parseBearerToken(request.headers.get("authorization"));
  if (!bearer || !bearer.startsWith("sk-ark-")) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const keyInfo = await resolveApiKey(bearer);
  if (!keyInfo) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  let body: ChatCompletionBody;
  try {
    body = (await request.json()) as ChatCompletionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const requestedModel = String(body.model || "").trim();
  if (!requestedModel) {
    return NextResponse.json({ error: "Model not supported" }, { status: 400 });
  }

  const pricing = await getRuntimePricing(requestedModel);
  if (!pricing) {
    return NextResponse.json({
      error: {
        message: "Model pricing not configured in DB",
        type: "pricing_not_configured",
      },
    }, { status: 503 });
  }

  const candidates = await getUpstreamCandidatesForModel(requestedModel);
  if (!candidates.length) {
    return NextResponse.json({ error: "No active upstream channel for requested model" }, { status: 503 });
  }

  // Guard #1 (highest priority): prepaid wallet balance (fresh read)
  const liveBalance = await getCurrentUserBalance(keyInfo.user.id);
  if (liveBalance.gatewayLocked) {
    return NextResponse.json(
      {
        error: {
          message: INSUFFICIENT_BALANCE_MESSAGE,
          type: "insufficient_balance",
          code: "balance_depleted",
        },
      },
      { status: 402 },
    );
  }

  if (liveBalance.balanceUsd <= 0 || liveBalance.balanceUsd < MIN_PREPAID_BALANCE_USD) {
    return NextResponse.json(
      {
        error: {
          message: INSUFFICIENT_BALANCE_MESSAGE,
          type: "insufficient_balance",
          code: "balance_depleted",
        },
      },
      { status: 402 },
    );
  }

  // Guard #2 (optional per-key budget fences)
  const guard = await getApiKeyUsageGuard(keyInfo.apiKeyId, keyInfo.user.id);
  if (!guard) {
    return NextResponse.json({ error: "Invalid API key state" }, { status: 401 });
  }

  if (guard.quotaLimit > 0 && guard.monthTokens >= guard.quotaLimit) {
    return NextResponse.json(
      {
        error: {
          message: "Key limit exceeded: monthly token quota reached.",
          type: "key_limit_exceeded",
          code: "quota_limit_exceeded",
        },
      },
      { status: 429 },
    );
  }

  if (guard.spendLimitUsd != null && guard.spendLimitUsd > 0 && guard.monthSpendUsd >= guard.spendLimitUsd) {
    return NextResponse.json(
      {
        error: {
          message: "Key limit exceeded: monthly spend limit reached.",
          type: "key_limit_exceeded",
          code: "spend_limit_exceeded",
        },
      },
      { status: 402 },
    );
  }

  const rl = await enforceSlidingWindowRateLimit({
    apiKeyId: keyInfo.apiKeyId,
  });

  if (!rl.allowed) {
    return new NextResponse(JSON.stringify({ error: "Too Many Requests" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(rl.retryAfterSeconds),
        "X-RateLimit-Limit": String(rl.limit),
        "X-RateLimit-Remaining": String(rl.remaining),
        "X-RateLimit-Reset": String(rl.resetAtEpochSeconds),
      },
    });
  }

  await ensureGlobalHttpDispatcher();

  const concurrencySlot = await acquireApiKeyConcurrencySlot({
    apiKeyId: keyInfo.apiKeyId,
  });

  if (!concurrencySlot.allowed) {
    return NextResponse.json(
      {
        error: {
          message: "Concurrent request limit exceeded.",
          type: "concurrency_limit_error",
        },
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(concurrencySlot.retryAfterSeconds),
        },
      },
    );
  }

  const primaryProvider: "azure" | "openai" | "generic" = candidates.some((c) => c.channelType === "azure_openai")
    ? "azure"
    : candidates.some((c) => c.channelType === "openai_standard")
      ? "openai"
      : "generic";

  const azureMaxInflight = Math.max(1, Number(process.env.AZURE_UPSTREAM_MAX_INFLIGHT ?? 120));
  const otherMaxInflight = Math.max(1, Number(process.env.OTHER_UPSTREAM_MAX_INFLIGHT ?? 180));
  const queueSlot = await acquireUpstreamQueueSlot({
    provider: primaryProvider,
    maxInflight: primaryProvider === "azure" ? azureMaxInflight : otherMaxInflight,
    waitTimeoutMs: 3000,
    pollIntervalMs: 60,
  });

  if (queueSlot.timedOut) {
    const fallbackModels = resolveFallbackModels(requestedModel);
    if (!fallbackModels.length) {
      await Promise.allSettled([concurrencySlot.release(), queueSlot.release()]);
      return NextResponse.json(
        {
          error: {
            message: "Concurrent request limit exceeded.",
            type: "concurrency_limit_error",
          },
        },
        { status: 429 },
      );
    }
  }

  let finalized = false;
  const finalizeInflight = async () => {
    if (finalized) return;
    finalized = true;
    await Promise.allSettled([concurrencySlot.release(), queueSlot.release()]);
  };

  let reservationId: string | null = null;
  try {
    const maxTokens = resolveRequestedMaxTokens(body);
    const reservedCostUsd = estimateReservationCostUsd({
      promptMessages: body.messages,
      maxTokens,
      inputPricePer1k: pricing.inputPricePer1k,
      outputPricePer1k: pricing.outputPricePer1k,
    });

    const reservation = await reserveQuotaHold({
      userId: keyInfo.user.id,
      apiKeyId: keyInfo.apiKeyId,
      modelId: requestedModel,
      reservedUsd: reservedCostUsd,
    });
    reservationId = reservation.reservationId;

    let routed: AttemptResult;
    try {
      if (queueSlot.timedOut) {
        routed = await fetchWithFailover(candidates, body, requestedModel, { skipPrimary: true });
      } else {
        routed = await fetchWithFailover(candidates, body, requestedModel);
      }
    } catch (error) {
      if (reservationId) {
        try {
          await releaseQuotaHold({ reservationId, settledUsd: 0 });
        } catch {
          // noop: reservation release is best effort on upstream failure
        }
      }
      return NextResponse.json({ error: error instanceof Error ? error.message : "Upstream request failed" }, { status: 503 });
    }

    const upstreamResp = routed.response;
    const effectiveModel = routed.actualModel || requestedModel;
    const fallbackHeaders: Record<string, string> = {};
    if (routed.fallbackApplied) {
      fallbackHeaders["X-Ark-Fallback"] = "true";
      fallbackHeaders["X-Ark-Actual-Model"] = effectiveModel;
    }

    if (body.stream) {
      if (!upstreamResp.ok) {
        console.error("stream_upstream_error", {
          requested_model: requestedModel,
          actual_model: effectiveModel,
          status: upstreamResp.status,
          fallback_applied: routed.fallbackApplied,
        });
        if (reservationId) {
          try {
            await releaseQuotaHold({ reservationId, settledUsd: 0 });
          } catch {
            // noop: reservation release is best effort when upstream returns error
          }
        }
        const errorBody = await upstreamResp.text();
        return new NextResponse(errorBody, {
          status: upstreamResp.status,
          headers: {
            "Content-Type": upstreamResp.headers.get("content-type") ?? "application/json",
            ...fallbackHeaders,
          },
        });
      }

      let relay: ReadableStream<Uint8Array>;
      try {
        relay = await relayStreamAndBill({
          upstreamResponse: upstreamResp,
          modelId: effectiveModel,
          userId: keyInfo.user.id,
          apiKeyId: keyInfo.apiKeyId,
          inputPricePer1k: pricing.inputPricePer1k,
          outputPricePer1k: pricing.outputPricePer1k,
          promptMessages: body.messages,
          streamBudgetUsd: Math.max(0, liveBalance.balanceUsd),
          reservationId: reservationId || undefined,
        });
      } catch (error) {
        console.error("stream_relay_failed", {
          requested_model: requestedModel,
          actual_model: effectiveModel,
          fallback_applied: routed.fallbackApplied,
          message: error instanceof Error ? error.message : String(error),
        });
        if (reservationId) {
          try {
            await releaseQuotaHold({ reservationId, settledUsd: 0 });
          } catch {
            // noop
          }
        }
        return NextResponse.json(
          {
            error: {
              message: "Stream relay failed",
              type: "stream_transport_error",
            },
          },
          {
            status: 500,
            headers: fallbackHeaders,
          },
        );
      }

      return new NextResponse(relay, {
        status: upstreamResp.status,
        headers: {
          "Content-Type": upstreamResp.headers.get("content-type") ?? "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          ...fallbackHeaders,
        },
      });
    }

    const responseText = await upstreamResp.text();
    let responseJson: unknown;
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = { raw: responseText };
    }

    if (responseJson && typeof responseJson === "object") {
      (responseJson as Record<string, unknown>).model = effectiveModel;
    }

    const usage = (responseJson as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
    let promptTokens = Number(usage?.prompt_tokens ?? 0);
    let completionTokens = Number(usage?.completion_tokens ?? 0);

    if (upstreamResp.ok && promptTokens <= 0 && completionTokens <= 0) {
      promptTokens = estimatePromptTokensFromMessages(body.messages);
      const completionText =
        ((responseJson as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content as string | undefined) || "";
      completionTokens = estimateTokensFromText(completionText);
    }

    if (upstreamResp.ok && (promptTokens > 0 || completionTokens > 0)) {
      try {
        await chargeUsage({
          userId: keyInfo.user.id,
          apiKeyId: keyInfo.apiKeyId,
          modelId: effectiveModel,
          promptTokens,
          completionTokens,
          statusCode: upstreamResp.status,
          inputPricePer1k: pricing.inputPricePer1k,
          outputPricePer1k: pricing.outputPricePer1k,
          reservationId: reservationId || undefined,
        });
      } catch (error) {
        const latest = await getCurrentUserBalance(keyInfo.user.id);
        if ((error as { code?: string })?.code === "balance_depleted" || latest.gatewayLocked) {
          return NextResponse.json(
            {
              error: {
                message: INSUFFICIENT_BALANCE_MESSAGE,
                type: "insufficient_balance",
                code: "balance_depleted",
              },
            },
            { status: 402 },
          );
        }
        throw error;
      }
    } else if (reservationId) {
      try {
        await releaseQuotaHold({ reservationId, settledUsd: 0 });
      } catch {
        // noop: release reservation when no usage is billable
      }
    }

    return NextResponse.json(responseJson, { status: upstreamResp.status, headers: fallbackHeaders });
  } catch (error) {
    const latest = await getCurrentUserBalance(keyInfo.user.id);
    if ((error as { code?: string })?.code === "balance_depleted" || latest.gatewayLocked) {
      return NextResponse.json(
        {
          error: {
            message: INSUFFICIENT_BALANCE_MESSAGE,
            type: "insufficient_balance",
            code: "balance_depleted",
          },
        },
        { status: 402 },
      );
    }

    console.error("chat_completions_unexpected_error", {
      model: requestedModel,
      userId: keyInfo.user.id,
      apiKeyId: keyInfo.apiKeyId,
      message: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : "Internal server error",
          type: "internal_error",
          code: "internal_error",
        },
      },
      { status: 500 },
    );
  } finally {
    await finalizeInflight();
  }
}
