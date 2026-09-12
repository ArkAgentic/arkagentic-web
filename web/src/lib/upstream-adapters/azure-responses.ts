import type { UpstreamCandidate } from "@/lib/upstream-store";

type AdapterBody = {
  stream?: boolean;
  messages?: Array<{ role?: string; content?: string }>;
  [key: string]: unknown;
};

type ResponsesUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
};

type AdapterMode = "responses" | "embeddings" | "rerank" | "images" | "speech" | "transcriptions";

type RequestSpec = {
  mode: AdapterMode;
  endpoint: string;
  headers: Record<string, string>;
  body: string;
  streamCapable: boolean;
};

function resolveAzureApiVersion(candidate: UpstreamCandidate): string {
  const metadata = candidate.metadata || {};
  const configured = metadata.apiVersion ?? metadata.api_version;
  if (typeof configured === "string" && configured.trim()) return configured.trim();
  if (candidate.baseUrl.includes("/api/projects/")) return "2024-05-01-preview";
  return "2024-02-01";
}

function extractPrompt(body: AdapterBody): string {
  if (typeof body.input === "string") return body.input;
  if (Array.isArray(body.messages) && body.messages.length > 0) {
    return body.messages.map((m) => `${String(m.role || "user")}: ${String(m.content || "")}`).join("\n");
  }
  if (typeof body.prompt === "string") return body.prompt;
  return "ping";
}

function shouldUseAzureSpeechService(upstreamModel: string): boolean {
  const m = upstreamModel.toLowerCase();
  return m.includes("mai-voice-2") || m.includes("mai-transcribe-1.5");
}

function resolveSpeechRegion(candidate: UpstreamCandidate): string {
  const metadata = candidate.metadata || {};
  const configured = metadata.speechRegion ?? metadata.speech_region;
  if (typeof configured === "string" && configured.trim()) return configured.trim();
  if (process.env.AZURE_SPEECH_REGION && process.env.AZURE_SPEECH_REGION.trim()) return process.env.AZURE_SPEECH_REGION.trim();
  return "eastus";
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function callAzureSpeechTts(apiKey: string, region: string, text: string): Promise<ArrayBuffer> {
  const ssml = `<speak version="1.0" xml:lang="en-US"><voice xml:lang="en-US" name="en-US-JennyNeural">${escapeXml(text)}</voice></speak>`;
  const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "riff-16khz-16bit-mono-pcm",
    },
    body: ssml,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Speech TTS failed (${response.status}): ${details.slice(0, 240)}`);
  }

  const buffer = await response.arrayBuffer();
  return buffer;
}

async function callAzureSpeechStt(apiKey: string, region: string, wavData: ArrayBuffer): Promise<string> {
  const response = await fetch(
    `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey,
        "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
      },
      body: wavData,
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Speech STT failed (${response.status}): ${details.slice(0, 240)}`);
  }

  const json = (await response.json()) as Record<string, unknown>;
  const text = typeof json.DisplayText === "string" ? json.DisplayText.trim() : "";
  return text || "transcription_completed";
}

function classifyModel(model: string): AdapterMode {
  const m = model.toLowerCase();
  if (m.includes("embed")) return "embeddings";
  if (m.includes("rerank")) return "rerank";
  if (m.includes("image")) return "images";
  if (m.includes("voice")) return "speech";
  if (m.includes("transcribe")) return "transcriptions";
  return "responses";
}

export function shouldUseResponsesAdapter(candidate: UpstreamCandidate, requestedModel: string): boolean {
  if (candidate.channelType !== "azure_openai") return false;
  const target = String(candidate.upstreamModel || requestedModel).toLowerCase();
  // keep gpt-4o on native chat path; everything else may need adapter/protocol conversion
  return !target.includes("gpt-4o") || target.includes("codex") || target.includes("claude") || target.includes("deepseek") || target.includes("cohere") || target.includes("mai-");
}

function jsonHeaders(candidate: UpstreamCandidate): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "api-key": candidate.apiKey,
  };
}

function buildRequestSpecs(candidate: UpstreamCandidate, body: AdapterBody, requestedModel: string): RequestSpec[] {
  const base = candidate.baseUrl.replace(/\/$/, "");
  const isProjectEndpoint = /\/api\/projects\//i.test(base);
  const metadata = candidate.metadata || {};
  const apiVersion = resolveAzureApiVersion(candidate);
  const responsesApiVersion =
    typeof metadata.responsesApiVersion === "string" && metadata.responsesApiVersion.trim()
      ? metadata.responsesApiVersion.trim()
      : "";
  const upstreamModel = String(candidate.upstreamModel || requestedModel);
  const mode = classifyModel(upstreamModel);
  const prompt = extractPrompt(body);

  const specs: RequestSpec[] = [];
  const add = (mode: AdapterMode, endpoint: string, payload: Record<string, unknown>, streamCapable: boolean) => {
    specs.push({ mode, endpoint, headers: jsonHeaders(candidate), body: JSON.stringify(payload), streamCapable });
  };

  if (isProjectEndpoint) {
    if (mode === "responses") {
      add(
        "responses",
        `${base}/models/responses?api-version=${encodeURIComponent(responsesApiVersion || apiVersion)}`,
        {
          model: upstreamModel,
          input: prompt,
          stream: Boolean(body.stream),
          max_output_tokens: typeof body.max_tokens === "number" ? body.max_tokens : undefined,
          temperature: typeof body.temperature === "number" ? body.temperature : undefined,
          top_p: typeof body.top_p === "number" ? body.top_p : undefined,
        },
        true,
      );
      return specs;
    }

    if (mode === "embeddings") {
      add(
        "embeddings",
        `${base}/models/embeddings?api-version=${encodeURIComponent(apiVersion)}`,
        { model: upstreamModel, input: [prompt] },
        false,
      );
      return specs;
    }

    if (mode === "rerank") {
      add(
        "rerank",
        `${base}/models/rerank?api-version=${encodeURIComponent(apiVersion)}`,
        {
          model: upstreamModel,
          query: prompt,
          documents: Array.isArray(body.documents) ? body.documents : [prompt, `${prompt} alternative`],
        },
        false,
      );
      return specs;
    }

    if (mode === "images") {
      add(
        "images",
        `${base}/models/images/generations?api-version=${encodeURIComponent(apiVersion)}`,
        { model: upstreamModel, prompt, size: typeof body.size === "string" ? body.size : "1024x1024" },
        false,
      );
      return specs;
    }

    if (mode === "speech") {
      add(
        "speech",
        `${base}/models/audio/speech?api-version=${encodeURIComponent(apiVersion)}`,
        { model: upstreamModel, input: prompt, voice: typeof body.voice === "string" ? body.voice : "alloy" },
        false,
      );
      return specs;
    }

    if (mode === "transcriptions") {
      // without binary upload in chat contract, fallback to responses-like textual probe
      add(
        "responses",
        `${base}/models/responses?api-version=${encodeURIComponent(responsesApiVersion || apiVersion)}`,
        { model: upstreamModel, input: prompt, stream: Boolean(body.stream) },
        true,
      );
      return specs;
    }
  }

  // legacy/openai-v1 style endpoints
  if (mode === "responses") {
    const query = responsesApiVersion ? `?api-version=${encodeURIComponent(responsesApiVersion)}` : "";
    add(
      "responses",
      `${base}/openai/v1/responses${query}`,
      {
        model: upstreamModel,
        input: prompt,
        stream: Boolean(body.stream),
        max_output_tokens: typeof body.max_tokens === "number" ? body.max_tokens : undefined,
        temperature: typeof body.temperature === "number" ? body.temperature : undefined,
        top_p: typeof body.top_p === "number" ? body.top_p : undefined,
      },
      true,
    );
    return specs;
  }

  if (mode === "embeddings") {
    add("embeddings", `${base}/openai/v1/embeddings`, { model: upstreamModel, input: [prompt] }, false);
    return specs;
  }

  if (mode === "rerank") {
    add(
      "rerank",
      `${base}/openai/v1/rerank`,
      {
        model: upstreamModel,
        query: prompt,
        documents: Array.isArray(body.documents) ? body.documents : [prompt, `${prompt} alternative`],
      },
      false,
    );
    // fallback: some rerank deployments can answer through responses
    add(
      "responses",
      `${base}/openai/v1/responses`,
      { model: upstreamModel, input: prompt, stream: Boolean(body.stream) },
      true,
    );
    return specs;
  }

  if (mode === "images") {
    add(
      "images",
      `${base}/openai/v1/images/generations`,
      { model: upstreamModel, prompt, size: typeof body.size === "string" ? body.size : "1024x1024" },
      false,
    );
    add(
      "responses",
      `${base}/openai/v1/responses`,
      { model: upstreamModel, input: prompt, stream: Boolean(body.stream) },
      true,
    );
    return specs;
  }

  if (mode === "speech") {
    add(
      "speech",
      `${base}/openai/v1/audio/speech`,
      { model: upstreamModel, input: prompt, voice: typeof body.voice === "string" ? body.voice : "alloy" },
      false,
    );
    add(
      "responses",
      `${base}/openai/v1/responses`,
      { model: upstreamModel, input: prompt, stream: Boolean(body.stream) },
      true,
    );
    return specs;
  }

  // transcriptions without binary from chat contract -> fallback to responses
  add(
    "responses",
    `${base}/openai/v1/responses`,
    { model: upstreamModel, input: prompt, stream: Boolean(body.stream) },
    true,
  );
  return specs;
}

function toUsage(promptTokens: number, completionTokens: number): ResponsesUsage {
  return {
    prompt_tokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    completion_tokens: Number.isFinite(completionTokens) ? completionTokens : 0,
  };
}

function textToTokenEstimate(text: string): number {
  const clean = String(text || "");
  if (!clean) return 0;
  return Math.max(1, Math.ceil(clean.length / 4));
}

function extractResponsesText(responseJson: Record<string, unknown>): string {
  const output = Array.isArray(responseJson.output) ? responseJson.output : [];
  let text = "";
  for (const item of output) {
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const p = part as { type?: unknown; text?: unknown };
      if (p.type === "output_text" && typeof p.text === "string") text += p.text;
    }
  }
  return text;
}

function normalizeToChatJson(mode: AdapterMode, upstreamJson: Record<string, unknown>, requestedModel: string): Record<string, unknown> {
  const created = Number(upstreamJson.created_at ?? Math.floor(Date.now() / 1000));
  if (mode === "responses") {
    const usageRaw = (upstreamJson.usage || {}) as Record<string, unknown>;
    return {
      id: String(upstreamJson.id || ""),
      object: "chat.completion",
      created,
      model: requestedModel,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: extractResponsesText(upstreamJson) },
          finish_reason: "stop",
        },
      ],
      usage: toUsage(Number(usageRaw.input_tokens ?? 0), Number(usageRaw.output_tokens ?? 0)),
    };
  }

  if (mode === "embeddings") {
    const data = Array.isArray(upstreamJson.data) ? upstreamJson.data : [];
    const first = (data[0] || {}) as Record<string, unknown>;
    const embedding = Array.isArray(first.embedding) ? first.embedding : [];
    const usageRaw = (upstreamJson.usage || {}) as Record<string, unknown>;
    return {
      id: String(upstreamJson.id || ""),
      object: "chat.completion",
      created,
      model: requestedModel,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: `embedding_ready dims=${embedding.length}` },
          finish_reason: "stop",
        },
      ],
      usage: toUsage(Number(usageRaw.prompt_tokens ?? 0), 1),
    };
  }

  if (mode === "rerank") {
    const data = Array.isArray(upstreamJson.data) ? upstreamJson.data : [];
    const top = data[0] ? JSON.stringify(data[0]).slice(0, 280) : "no_rerank_result";
    return {
      id: String(upstreamJson.id || ""),
      object: "chat.completion",
      created,
      model: requestedModel,
      choices: [{ index: 0, message: { role: "assistant", content: `rerank_ready ${top}` }, finish_reason: "stop" }],
      usage: toUsage(12, 8),
    };
  }

  if (mode === "images") {
    const data = Array.isArray(upstreamJson.data) ? upstreamJson.data : [];
    const first = (data[0] || {}) as Record<string, unknown>;
    const url = typeof first.url === "string" ? first.url : "image_generated";
    return {
      id: String(upstreamJson.id || ""),
      object: "chat.completion",
      created,
      model: requestedModel,
      choices: [{ index: 0, message: { role: "assistant", content: `image_ready ${url}` }, finish_reason: "stop" }],
      usage: toUsage(20, 10),
    };
  }

  if (mode === "speech") {
    const text = typeof upstreamJson.text === "string" ? upstreamJson.text : "audio_generated";
    return {
      id: String(upstreamJson.id || ""),
      object: "chat.completion",
      created,
      model: requestedModel,
      choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
      usage: toUsage(textToTokenEstimate(text), 2),
    };
  }

  const transcript =
    typeof upstreamJson.text === "string"
      ? upstreamJson.text
      : typeof upstreamJson.transcript === "string"
        ? upstreamJson.transcript
        : "transcription_ready";
  return {
    id: String(upstreamJson.id || ""),
    object: "chat.completion",
    created,
    model: requestedModel,
    choices: [{ index: 0, message: { role: "assistant", content: transcript }, finish_reason: "stop" }],
    usage: toUsage(textToTokenEstimate(transcript), 2),
  };
}

function parseSseEventBlock(block: string): { event: string; data: string } | null {
  const lines = block.split("\n");
  let event = "message";
  const dataLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("event:")) event = trimmed.slice(6).trim();
    if (trimmed.startsWith("data:")) dataLines.push(trimmed.slice(5).trim());
  }
  if (!dataLines.length) return null;
  return { event, data: dataLines.join("\n") };
}

function createAdaptedResponsesSseStream(params: {
  source: ReadableStream<Uint8Array>;
  requestedModel: string;
}): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = params.source.getReader();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      let responseId = "";
      let created = Math.floor(Date.now() / 1000);
      let usage: ResponsesUsage = { prompt_tokens: 0, completion_tokens: 0 };

      const emit = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let idx = buffer.indexOf("\n\n");
        while (idx >= 0) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          const evt = parseSseEventBlock(raw);
          if (evt && evt.data !== "[DONE]") {
            try {
              const parsed = JSON.parse(evt.data) as Record<string, unknown>;
              const responseObj = parsed.response as Record<string, unknown> | undefined;
              if (responseObj && typeof responseObj.id === "string") responseId = responseObj.id;
              if (responseObj && typeof responseObj.created_at === "number") created = responseObj.created_at;

              if (evt.event === "response.output_text.delta") {
                const delta = typeof parsed.delta === "string" ? parsed.delta : "";
                if (delta) {
                  emit({
                    id: responseId,
                    object: "chat.completion.chunk",
                    created,
                    model: params.requestedModel,
                    choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
                  });
                }
              }

              if (evt.event === "response.completed" && responseObj) {
                const usageRaw = (responseObj.usage || {}) as Record<string, unknown>;
                usage = toUsage(Number(usageRaw.input_tokens ?? 0), Number(usageRaw.output_tokens ?? 0));
              }
            } catch {
              // ignore parse issues
            }
          }

          idx = buffer.indexOf("\n\n");
        }
      }

      emit({
        id: responseId,
        object: "chat.completion.chunk",
        created,
        model: params.requestedModel,
        choices: [],
        usage,
      });
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
    cancel() {
      void reader.cancel();
    },
  });
}

function createSyntheticChatSse(chatJson: Record<string, unknown>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const message =
    (((chatJson.choices as Array<Record<string, unknown>> | undefined)?.[0]?.message as Record<string, unknown> | undefined)
      ?.content as string | undefined) || "";
  const id = String(chatJson.id || "");
  const created = Number(chatJson.created || Math.floor(Date.now() / 1000));
  const model = String(chatJson.model || "");
  const usage = (chatJson.usage || {}) as Record<string, unknown>;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            id,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [{ index: 0, delta: { content: message }, finish_reason: null }],
          })}\n\n`,
        ),
      );
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            id,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [],
            usage,
          })}\n\n`,
        ),
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

function parseResponsesSseToChatJson(sseText: string, requestedModel: string): Record<string, unknown> {
  let responseId = "";
  let created = Math.floor(Date.now() / 1000);
  let content = "";
  let usage: ResponsesUsage = { prompt_tokens: 0, completion_tokens: 0 };

  for (const block of sseText.split("\n\n")) {
    const evt = parseSseEventBlock(block);
    if (!evt || evt.data === "[DONE]") continue;
    try {
      const parsed = JSON.parse(evt.data) as Record<string, unknown>;
      const responseObj = parsed.response as Record<string, unknown> | undefined;
      if (responseObj && typeof responseObj.id === "string") responseId = responseObj.id;
      if (responseObj && typeof responseObj.created_at === "number") created = responseObj.created_at;
      if (evt.event === "response.output_text.delta") {
        const delta = typeof parsed.delta === "string" ? parsed.delta : "";
        content += delta;
      }
      if (evt.event === "response.completed" && responseObj) {
        const usageRaw = (responseObj.usage || {}) as Record<string, unknown>;
        usage = toUsage(Number(usageRaw.input_tokens ?? 0), Number(usageRaw.output_tokens ?? 0));
      }
    } catch {
      // ignore malformed chunks
    }
  }

  if (!content) content = "adapter_stream_ok";
  return {
    id: responseId,
    object: "chat.completion",
    created,
    model: requestedModel,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage,
  };
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function fetchViaResponsesAdapter(
  candidate: UpstreamCandidate,
  body: AdapterBody,
  requestedModel: string,
): Promise<Response> {
  const upstreamModel = String(candidate.upstreamModel || requestedModel);
  const mode = classifyModel(upstreamModel);

  if (shouldUseAzureSpeechService(upstreamModel) && (mode === "speech" || mode === "transcriptions")) {
    try {
      const region = resolveSpeechRegion(candidate);
      const prompt = extractPrompt(body) || "hello from arkagentic";

      let content = "";
      if (mode === "speech") {
        const wav = await callAzureSpeechTts(candidate.apiKey, region, prompt);
        content = `speech_synthesized bytes=${wav.byteLength} region=${region}`;
      } else {
        const wav = await callAzureSpeechTts(candidate.apiKey, region, prompt);
        const transcript = await callAzureSpeechStt(candidate.apiKey, region, wav);
        content = transcript || "transcription_completed";
      }

      const chatJson = {
        id: `speech_${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: requestedModel,
        choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
        usage: toUsage(textToTokenEstimate(prompt), textToTokenEstimate(content)),
      };

      if (body.stream) {
        const synthetic = createSyntheticChatSse(chatJson);
        return new Response(synthetic, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }

      return new Response(JSON.stringify(chatJson), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: {
            message: error instanceof Error ? error.message : "Speech adapter failed",
          },
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  const specs = buildRequestSpecs(candidate, body, requestedModel);
  let lastResponse: Response | null = null;

  for (const spec of specs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1000, candidate.timeoutMs || 45000));

    try {
      const requestPayload = JSON.parse(spec.body);
      if (!body.stream && spec.mode === "responses" && spec.streamCapable) {
        requestPayload.stream = true;
      }

      const upstream = await fetch(spec.endpoint, {
        method: "POST",
        headers: spec.headers,
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });

      if (!upstream.ok) {
        lastResponse = upstream;

        if (!body.stream && spec.mode === "responses" && spec.streamCapable) {
          // Some deployments reject non-stream responses but succeed with stream events.
          const streamPayload = JSON.parse(spec.body);
          streamPayload.stream = true;
          const streamTry = await fetch(spec.endpoint, {
            method: "POST",
            headers: spec.headers,
            body: JSON.stringify(streamPayload),
            signal: controller.signal,
          });
          if (streamTry.ok) {
            const sseText = await streamTry.text();
            const chatJson = parseResponsesSseToChatJson(sseText, requestedModel);
            return new Response(JSON.stringify(chatJson), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          lastResponse = streamTry;
        }

        if (isRetryableStatus(upstream.status)) continue;
        if (upstream.status === 404 || upstream.status === 400 || upstream.status === 422) {
          continue;
        }
        return upstream;
      }

      if (body.stream && spec.streamCapable && upstream.headers.get("content-type")?.includes("text/event-stream")) {
        if (!upstream.body) return upstream;
        if (spec.mode === "responses") {
          const adapted = createAdaptedResponsesSseStream({ source: upstream.body, requestedModel });
          return new Response(adapted, {
            status: upstream.status,
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        }
      }

      const text = await upstream.text();
      let chatJson: Record<string, unknown>;

      if (!body.stream && spec.mode === "responses" && upstream.headers.get("content-type")?.includes("text/event-stream")) {
        chatJson = parseResponsesSseToChatJson(text, requestedModel);
      } else {
        let json: Record<string, unknown>;
        try {
          json = JSON.parse(text) as Record<string, unknown>;
        } catch {
          json = { raw: text };
        }
        chatJson = normalizeToChatJson(spec.mode, json, requestedModel);
      }

      if (body.stream) {
        const synthetic = createSyntheticChatSse(chatJson);
        return new Response(synthetic, {
          status: upstream.status,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }

      return new Response(JSON.stringify(chatJson), {
        status: upstream.status,
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  if (lastResponse) return lastResponse;
  return new Response(JSON.stringify({ error: { message: "No adapter request could be built" } }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}
