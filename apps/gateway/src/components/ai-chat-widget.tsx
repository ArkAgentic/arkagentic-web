"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

type Msg = { role: "assistant" | "user"; text: string };

const CHAT_ASSISTANT_API = "/api/chat/assistant";

export function AiChatWidget() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", text: t("chat.widget.welcome") }]);

  useEffect(() => {
    setMessages([{ role: "assistant", text: t("chat.widget.welcome") }]);
    setInput("");
  }, [t]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setSending(true);
    try {
      const res = await fetch(CHAT_ASSISTANT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // RAG extension point: backend can use message + context to retrieve KB/doc snippets.
        body: JSON.stringify({ message: text, context: { channel: "floating_widget", source: "landing_live_chat" } }),
      });
      const data = await res.json().catch(() => ({}));
      const reply = res.ok ? (data.answer as string) : t("chat.widget.error");
      setMessages((prev) => [...prev, { role: "assistant", text: reply || t("chat.widget.error") }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: t("chat.widget.error") }]);
    } finally {
      setSending(false);
    }
  };

  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-800 shadow-[0_8px_24px_rgba(123,75,28,0.2)]"
        >
          <MessageCircle className="h-4 w-4 text-amber-700" />
          {t("chat.widget.trigger")}
        </button>
      )}

      {open && (
        <div className="h-[520px] w-[380px] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.24)]">
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
            <p className="text-sm font-semibold text-stone-900">{t("chat.widget.title")}</p>
            <button
              type="button"
              aria-label={t("chat.widget.close")}
              onClick={() => setOpen(false)}
              className="rounded-md border border-stone-200 p-1.5 text-stone-500 hover:text-stone-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="h-[392px] space-y-3 overflow-y-auto bg-stone-50/40 px-4 py-3">
            {messages.map((m, i) => (
              <div key={`${m.role}-${i}`} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[82%] rounded-xl px-3 py-2 text-sm leading-6 ${
                    m.role === "user" ? "bg-amber-500 text-white" : "border border-stone-200 bg-white text-stone-700"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-stone-200 bg-white px-3 py-3">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onEnter}
                placeholder={t("chat.widget.placeholder")}
                className="h-10 flex-1 rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-800 outline-none focus:border-amber-300"
              />
              <button
                type="button"
                aria-label={t("chat.widget.send")}
                onClick={() => void send()}
                disabled={sending}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500 text-white disabled:opacity-70"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
