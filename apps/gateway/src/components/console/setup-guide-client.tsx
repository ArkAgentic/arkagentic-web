"use client";

import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { JetBrains_Mono } from "next/font/google";
import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";

type CodeLang = "curl" | "python" | "node";

const codeFontFamily = "'JetBrains Mono', 'Fira Code', 'Fira Mono', Consolas, Monaco, monospace";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightCode(code: string): string {
  let html = escapeHtml(code);

  html = html.replace(/(https:\/\/arkagentic\.com\/v1\/chat\/completions|https:\/\/arkagentic\.com\/v1)/g, '<span class="text-emerald-300">$1</span>');
  html = html.replace(/(&lt;YOUR_API_KEY&gt;|ARK_API_KEY)/g, '<span class="text-violet-300">$1</span>');
  html = html.replace(/(ark-gpt-4o)/g, '<span class="text-amber-200">$1</span>');
  html = html.replace(/("[a-zA-Z0-9_]+"\s*:)/g, '<span class="text-sky-300">$1</span>');

  return html;
}

export function SetupGuideClientPanel() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<CodeLang>("curl");
  const [copied, setCopied] = useState(false);

  const snippets: Record<CodeLang, string> = useMemo(
    () => ({
      curl: `curl https://gateway.arkagentic.com/v1/chat/completions \\
  -H "Authorization: Bearer <YOUR_API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "ark-gpt-4o",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello"}
    ],
    "stream": false
  }'`,
      python: `from openai import OpenAI
import os

client = OpenAI(
    api_key=os.environ["ARK_API_KEY"],
    base_url="https://gateway.arkagentic.com/v1",
)

resp = client.chat.completions.create(
    model="ark-gpt-4o",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello"},
    ],
    stream=False,
)

print(resp.choices[0].message.content)`,
      node: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.ARK_API_KEY,
  baseURL: "https://gateway.arkagentic.com/v1",
});

const resp = await client.chat.completions.create({
  model: "ark-gpt-4o",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello" },
  ],
  stream: false,
});

console.log(resp.choices[0]?.message?.content);`,
    }),
    [],
  );

  const responseExample = `{
  "id": "chatcmpl-ark12345",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "ark-gpt-4o",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "ArkAgentic API connection successful. Ready to process requests."
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 9,
    "completion_tokens": 11,
    "total_tokens": 20
  }
}`;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippets[activeTab]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-stone-900">{t("console.setupGuide.title")}</h1>
        <p className="mt-2 text-sm text-stone-600">{t("console.setupGuide.subtitle")}</p>

        <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-4">
          <h2 className="text-sm font-semibold text-stone-900">{t("console.setupGuide.flow.title")}</h2>
          <ol className="mt-4 space-y-4">
            {[1, 2, 3, 4].map((step, index) => (
              <li key={step} className="relative pl-8">
                {index < 3 ? <span className="absolute left-[9px] top-6 h-[calc(100%+12px)] w-px bg-stone-300" /> : null}
                <span className="absolute left-0 top-1.5 h-5 w-5 rounded-full border border-stone-300 bg-white text-[10px] font-semibold leading-5 text-stone-600 text-center">{step}</span>
                <h3 className="text-sm font-semibold text-stone-900">{t(`console.setupGuide.flow.step${step}.title`)}</h3>
                {step === 1 ? (
                  <p className="mt-1 text-sm leading-6 text-stone-700">
                    {t("console.setupGuide.flow.step1.pre")}
                    <Link href="/console/api-keys" className="font-medium text-stone-900 underline underline-offset-2">
                      {t("console.setupGuide.flow.step1.link")}
                    </Link>
                    {t("console.setupGuide.flow.step1.post")}
                  </p>
                ) : null}
                {step === 2 ? <p className="mt-1 text-sm leading-6 text-stone-700">{t("console.setupGuide.flow.step2.desc")}</p> : null}
                {step === 3 ? (
                  <p className="mt-1 text-sm leading-6 text-stone-700">
                    {t("console.setupGuide.flow.step3.pre")}
                    <Link href="/console/models" className="font-medium text-stone-900 underline underline-offset-2">
                      {t("console.setupGuide.flow.step3.link")}
                    </Link>
                    {t("console.setupGuide.flow.step3.post")}
                  </p>
                ) : null}
                {step === 4 ? (
                  <p className="mt-1 text-sm leading-6 text-stone-700">
                    {t("console.setupGuide.flow.step4.pre")}
                    <Link href="/console/topup" className="font-medium text-stone-900 underline underline-offset-2">
                      {t("console.setupGuide.flow.step4.link")}
                    </Link>
                    {t("console.setupGuide.flow.step4.post")}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </article>

      <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-900">{t("console.setupGuide.examplesTitle")}</h2>

        <div className="mt-4 overflow-hidden rounded-xl border border-stone-800 bg-[#0f1115] shadow-[0_8px_20px_rgba(0,0,0,0.18)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-700/70 px-3 py-2">
            <div className="inline-flex rounded-lg border border-stone-700 bg-stone-900/60 p-0.5">
              {(["curl", "python", "node"] as CodeLang[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    activeTab === tab ? "bg-stone-700 text-white" : "text-stone-300 hover:bg-stone-800"
                  }`}
                >
                  {tab === "curl" ? "cURL" : tab === "python" ? "Python" : "Node.js"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex items-center gap-1.5 rounded-md border border-stone-600 px-2.5 py-1 text-xs font-medium text-stone-200 hover:bg-stone-800"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? t("console.setupGuide.code.copied") : t("console.setupGuide.code.copy")}
            </button>
          </div>
          <pre
            className={`${jetbrainsMono.className} overflow-x-auto p-3 text-sm leading-[1.65] font-medium text-stone-100`}
            style={{ fontFamily: codeFontFamily }}
            dangerouslySetInnerHTML={{ __html: highlightCode(snippets[activeTab]) }}
          />
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-stone-800 bg-[#0f1115] shadow-[0_8px_20px_rgba(0,0,0,0.18)]">
          <div className="flex items-center justify-between gap-2 border-b border-stone-700/70 px-3 py-2">
            <p className="text-xs font-semibold text-stone-100">Response (200 OK)</p>
            <span
              className={`${jetbrainsMono.className} font-mono text-xs px-2.5 py-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400`}
              style={{ fontFamily: codeFontFamily }}
            >
              ● Status: 200 OK
            </span>
          </div>
          <pre
            className={`${jetbrainsMono.className} overflow-x-auto p-3 text-sm leading-[1.65] font-medium text-stone-100`}
            style={{ fontFamily: codeFontFamily }}
            dangerouslySetInnerHTML={{ __html: highlightCode(responseExample) }}
          />
        </div>
      </article>

      <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-900">{t("console.setupGuide.troubleshootingTitle")}</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500">
                <th className="py-2 pr-3 w-auto min-w-[200px]">{t("console.setupGuide.troubleshooting.columns.error")}</th>
                <th className="py-2 pr-3 w-1/3">{t("console.setupGuide.troubleshooting.columns.cause")}</th>
                <th className="py-2 w-auto">{t("console.setupGuide.troubleshooting.columns.fix")}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-stone-100 text-stone-700 align-top">
                <td className="py-3 pr-3 w-auto min-w-[200px]">
                  <span className={`${jetbrainsMono.className} font-mono text-xs px-2.5 py-1 rounded-md border font-medium whitespace-nowrap inline-block border-red-200 bg-red-50 text-red-700`} style={{ fontFamily: codeFontFamily }}>
                    401 Invalid API key
                  </span>
                </td>
                <td className="py-3 pr-3 w-1/3">{t("console.setupGuide.troubleshooting.rows.invalidKey.cause")}</td>
                <td className="py-3 w-auto">{t("console.setupGuide.troubleshooting.rows.invalidKey.fix")}</td>
              </tr>
              <tr className="border-b border-stone-100 text-stone-700 align-top">
                <td className="py-3 pr-3 w-auto min-w-[200px]">
                  <span className={`${jetbrainsMono.className} font-mono text-xs px-2.5 py-1 rounded-md border font-medium whitespace-nowrap inline-block border-amber-300 bg-amber-50 text-amber-800`} style={{ fontFamily: codeFontFamily }}>
                    400 Model not supported
                  </span>
                </td>
                <td className="py-3 pr-3 w-1/3">{t("console.setupGuide.troubleshooting.rows.modelNotSupported.cause")}</td>
                <td className="py-3 w-auto">{t("console.setupGuide.troubleshooting.rows.modelNotSupported.fix")}</td>
              </tr>
              <tr className="border-b border-stone-100 text-stone-700 align-top">
                <td className="py-3 pr-3 w-auto min-w-[200px]">
                  <span className={`${jetbrainsMono.className} font-mono text-xs px-2.5 py-1 rounded-md border font-medium whitespace-nowrap inline-block border-purple-300 bg-purple-50 text-purple-800`} style={{ fontFamily: codeFontFamily }}>
                    402 Insufficient balance
                  </span>
                </td>
                <td className="py-3 pr-3 w-1/3">{t("console.setupGuide.troubleshooting.rows.insufficientBalance.cause")}</td>
                <td className="py-3 w-auto">{t("console.setupGuide.troubleshooting.rows.insufficientBalance.fix")}</td>
              </tr>
              <tr className="text-stone-700 align-top">
                <td className="py-3 pr-3 w-auto min-w-[200px]">
                  <span className={`${jetbrainsMono.className} font-mono text-xs px-2.5 py-1 rounded-md border font-medium whitespace-nowrap inline-block border-slate-300 bg-slate-100 text-slate-700`} style={{ fontFamily: codeFontFamily }}>
                    429 / 5xx
                  </span>
                </td>
                <td className="py-3 pr-3 w-1/3">{t("console.setupGuide.troubleshooting.rows.retryable.cause")}</td>
                <td className="py-3 w-auto">{t("console.setupGuide.troubleshooting.rows.retryable.fix")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </>
  );
}
