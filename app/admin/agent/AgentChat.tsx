"use client";

import { useState, useRef, useEffect } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ToolEvent {
  id: string;
  name: string;
  status: "pending" | "done" | "error";
  label: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  files?: string[];
  toolEvents?: ToolEvent[];
}

interface ApiMessage {
  role: "user" | "assistant";
  content: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    list_products: "Loading product list",
    get_product_details: "Getting product details",
    search_inventory: "Searching inventory",
    get_lot_by_number: "Looking up lot number",
    get_contract_info: "Looking up contract",
    get_document_status: "Checking document coverage",
    get_discount_items: "Loading discount items",
    get_import_review: "Loading import review queue",
    get_sync_info: "Checking last sync",
    upload_document: "Uploading document",
    create_discount_item: "Moving lot to discount",
    restore_discount_item: "Restoring to inventory",
  };
  return labels[name] ?? name.replace(/_/g, " ");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STARTER_PROMPTS = [
  "What products are missing COAs?",
  "Show me all active discount items",
  "Which lots don't have spec sheets?",
  "Upload this COA to the correct lots",
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AgentChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [apiHistory, setApiHistory] = useState<ApiMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text && pendingFiles.length === 0) return;
    if (isLoading) return;

    const fileNames = pendingFiles.map((f) => f.name);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      files: fileNames.length > 0 ? fileNames : undefined,
    };

    const newHistory: ApiMessage[] = [
      ...apiHistory,
      { role: "user", content: text },
    ];

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setPendingFiles([]);
    setIsLoading(true);

    // Placeholder for streaming assistant response
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", text: "", toolEvents: [] },
    ]);

    const formData = new FormData();
    formData.append("messages", JSON.stringify(newHistory));
    for (const file of pendingFiles) {
      formData.append("files", file);
    }

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, text: `Error: ${res.status} ${res.statusText}` }
              : m,
          ),
        );
        setIsLoading(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          let event: {
            type: string;
            text?: string;
            name?: string;
            input?: unknown;
            result?: unknown;
            message?: string;
          };
          try {
            event = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          if (event.type === "text") {
            fullText += event.text ?? "";
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, text: fullText } : m,
              ),
            );
          } else if (event.type === "tool_start") {
            const toolId = crypto.randomUUID();
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      toolEvents: [
                        ...(m.toolEvents ?? []),
                        {
                          id: toolId,
                          name: event.name!,
                          status: "pending" as const,
                          label: toolLabel(event.name!),
                        },
                      ],
                    }
                  : m,
              ),
            );
          } else if (event.type === "tool_result") {
            const hasError = !!(event.result as { error?: string })?.error;
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                // Mark the last pending event with this name as done/error
                let marked = false;
                const updated = [...(m.toolEvents ?? [])].reverse().map((te) => {
                  if (!marked && te.name === event.name && te.status === "pending") {
                    marked = true;
                    return { ...te, status: hasError ? ("error" as const) : ("done" as const) };
                  }
                  return te;
                });
                return { ...m, toolEvents: updated.reverse() };
              }),
            );
          } else if (event.type === "error") {
            const errText = `Sorry, something went wrong: ${event.message ?? "unknown error"}`;
            fullText = errText;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, text: errText } : m,
              ),
            );
          }
        }
      }

      setApiHistory([
        ...newHistory,
        { role: "assistant", content: fullText },
      ]);
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, text: "Connection error. Please try again." }
            : m,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearConversation = () => {
    setMessages([]);
    setApiHistory([]);
    setInput("");
    setPendingFiles([]);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      {/* Clear button */}
      {messages.length > 0 && (
        <div className="flex justify-end pt-3 pb-1">
          <button
            onClick={clearConversation}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Clear conversation
          </button>
        </div>
      )}

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto py-4 space-y-5">
        {messages.length === 0 && (
          <div className="text-center py-14">
            <div className="w-12 h-12 rounded-2xl bg-[#1a2b5f]/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-[#1a2b5f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19.5 14.5M14.25 3.104c.251.023.501.05.75.082M19.5 14.5l-1.409 1.409a2.25 2.25 0 01-3.182 0l-4.5-4.5a2.25 2.25 0 010-3.182L12 6.75" />
              </svg>
            </div>
            <p className="text-base font-semibold text-gray-700">Lamex AI Assistant</p>
            <p className="text-sm text-gray-400 mt-1">
              Upload documents, query inventory, manage stock — all in plain language.
            </p>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-sm mx-auto text-left">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => setInput(prompt)}
                  className="text-xs text-left px-3 py-2 rounded-lg border border-gray-200 hover:border-[#1a2b5f]/40 hover:bg-[#1a2b5f]/5 text-gray-600 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
          >
            {/* Avatar */}
            <div
              className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5 ${
                msg.role === "user"
                  ? "bg-[#1a2b5f] text-white"
                  : "bg-indigo-100 text-indigo-700"
              }`}
            >
              {msg.role === "user" ? "Y" : "AI"}
            </div>

            <div className="flex-1 min-w-0 max-w-[85%]">
              {/* Tool activity (above assistant bubble) */}
              {msg.role === "assistant" && msg.toolEvents && msg.toolEvents.length > 0 && (
                <div className="mb-2 space-y-1">
                  {msg.toolEvents.map((te) => (
                    <div key={te.id} className="flex items-center gap-2 text-xs text-gray-500">
                      {te.status === "pending" ? (
                        <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin shrink-0" />
                      ) : te.status === "done" ? (
                        <span className="text-green-500 shrink-0">✓</span>
                      ) : (
                        <span className="text-red-400 shrink-0">✗</span>
                      )}
                      <span>{te.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Message bubble */}
              {(msg.text || (msg.role === "assistant" && isLoading)) && (
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[#1a2b5f] text-white rounded-tr-sm"
                      : "bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm"
                  }`}
                >
                  {msg.role === "assistant" && !msg.text && isLoading ? (
                    <span className="flex gap-1 items-center text-gray-400">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                  ) : (
                    <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                  )}
                </div>
              )}

              {/* File chips */}
              {msg.files && msg.files.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1 justify-end">
                  {msg.files.map((f) => (
                    <span
                      key={f}
                      className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full"
                    >
                      📎 {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="py-3">
        <div className="border border-gray-200 rounded-2xl bg-white shadow-sm overflow-hidden focus-within:border-[#1a2b5f]/40 focus-within:shadow-md transition-shadow">
          {/* Pending file chips */}
          {pendingFiles.length > 0 && (
            <div className="px-3 pt-3 flex flex-wrap gap-2">
              {pendingFiles.map((f, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-full"
                >
                  <span>📎</span>
                  <span className="max-w-[160px] truncate">{f.name}</span>
                  <span className="text-blue-400">({formatBytes(f.size)})</span>
                  <button
                    onClick={() => removeFile(i)}
                    className="text-blue-400 hover:text-blue-700 leading-none ml-0.5"
                    aria-label={`Remove ${f.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 px-3 py-2.5">
            {/* Attach button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
              title="Attach file (PDF or image)"
              aria-label="Attach file"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={(e) => {
                const newFiles = Array.from(e.target.files ?? []);
                setPendingFiles((prev) => [...prev, ...newFiles]);
                e.target.value = "";
              }}
            />

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question or describe a task… (Shift+Enter for new line)"
              rows={1}
              disabled={isLoading}
              className="flex-1 resize-none text-sm text-gray-800 placeholder-gray-400 focus:outline-none leading-relaxed disabled:opacity-60 py-0.5"
              style={{ overflowY: "hidden" }}
            />

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={isLoading || (!input.trim() && pendingFiles.length === 0)}
              className="shrink-0 w-8 h-8 rounded-xl bg-[#1a2b5f] text-white flex items-center justify-center hover:bg-[#253d7a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Send"
            >
              {isLoading ? (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
        <p className="text-center text-xs text-gray-400 mt-2">
          Internal use only · Never share access with customers
        </p>
      </div>
    </div>
  );
}
