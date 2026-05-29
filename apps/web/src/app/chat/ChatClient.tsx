"use client";

import { useEffect, useRef, useState } from "react";
import { dict, type Locale } from "@/lib/i18n";
import { buttonClass, cn } from "@/components/ui";
import { Icon } from "@/components/Icon";

type Msg = { role: "user" | "assistant"; text: string; used_chunks?: number; error?: boolean };

// Client chat surface. Posts to /api/chat, which derives the asker from the
// session (never a client-supplied id) and proxies to the n8n RAG webhook.
export function ChatClient({ locale }: { locale: Locale }) {
  const t = dict[locale];
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send() {
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: question }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.answer) {
        setMessages((m) => [
          ...m,
          { role: "assistant", text: (data && data.error) || t.chatError, error: true },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          { role: "assistant", text: data.answer, used_chunks: data.used_chunks },
        ]);
      }
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: t.chatError, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem-8rem)] min-h-[24rem] flex-col rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.06]">
      {/* message list */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {messages.length === 0 && !busy && (
          <div className="grid h-full place-items-center text-center">
            <div className="max-w-sm">
              <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-aqua/10 text-aqua">
                <Icon name="sparkles" size={24} />
              </span>
              <p className="text-sm font-medium text-ink">{t.chatEmptyTitle}</p>
              <p className="mt-1 text-xs text-ink-600">{t.chatEmptyHint}</p>
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm",
                m.role === "user"
                  ? "bg-aqua text-white"
                  : m.error
                    ? "bg-red-50 text-red-700 ring-1 ring-red-200"
                    : "bg-canvas text-ink ring-1 ring-black/[0.05]",
              )}
            >
              {m.text}
              {m.role === "assistant" && !m.error && typeof m.used_chunks === "number" && (
                <div className="mt-1.5 text-[10px] text-ink-600/70">
                  {m.used_chunks} {t.chatSources}
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl bg-canvas px-4 py-2.5 text-sm text-ink-600 ring-1 ring-black/[0.05]">
              <Icon name="sparkles" size={14} className="animate-pulse" />
              {t.chatThinking}
            </div>
          </div>
        )}
      </div>

      {/* input */}
      <div className="border-t border-black/[0.06] p-3 sm:p-4">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={t.chatPlaceholder}
            disabled={busy}
            className="max-h-40 min-h-[2.75rem] flex-1 resize-none rounded-xl bg-canvas px-3 py-2.5 text-sm text-ink ring-1 ring-black/10 placeholder:text-ink-600/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua disabled:opacity-60"
          />
          <button
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            className={buttonClass("primary", "h-[2.75rem]")}
            aria-label={t.chatSend}
          >
            <Icon name="chevronRight" size={18} />
            <span className="hidden sm:inline">{t.chatSend}</span>
          </button>
        </div>
        <p className="mt-2 px-1 text-[11px] leading-snug text-ink-600/70">{t.chatDisclaimer}</p>
      </div>
    </div>
  );
}
