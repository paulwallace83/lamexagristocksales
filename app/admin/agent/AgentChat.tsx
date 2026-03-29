"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import MarkdownMessage from "./MarkdownMessage";
import UsageStatsBar from "./UsageStatsBar";

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
  fileNames?: string[];
}

interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
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

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function apiToMessages(msgs: ApiMessage[]): Message[] {
  return msgs.map((m) => ({
    id: crypto.randomUUID(),
    role: m.role,
    text: m.content,
    files: m.fileNames,
  }));
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
  const [isDragging, setIsDragging] = useState(false);

  // Conversation persistence state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);

  // API usage tracking
  const [usageRefreshKey, setUsageRefreshKey] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

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

  // Close history dropdown on outside click
  useEffect(() => {
    if (!showHistory) return;
    function handleClick(e: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showHistory]);

  // Load conversation list on mount
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch {
      // Silent fail — non-critical
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Auto-save conversation after assistant response
  const saveConversation = useCallback(
    async (history: ApiMessage[]) => {
      if (history.length === 0) return;

      try {
        let id = conversationId;

        if (!id) {
          // Create new conversation
          const firstUserMsg = history.find((m) => m.role === "user");
          const title = firstUserMsg?.content || "New conversation";
          const res = await fetch("/api/agent/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title }),
          });
          if (!res.ok) return;
          const created = await res.json();
          id = created.id;
          setConversationId(id);
        }

        // Save messages
        await fetch(`/api/agent/conversations/${id}/messages`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.map((m) => ({
              role: m.role,
              content: m.content,
              ...(m.fileNames ? { fileNames: m.fileNames } : {}),
            })),
          }),
        });

        // Refresh list
        fetchConversations();
      } catch {
        console.error("Failed to save conversation");
      }
    },
    [conversationId, fetchConversations]
  );

  const loadConversation = async (id: string) => {
    setLoadingConversation(true);
    setShowHistory(false);
    try {
      const res = await fetch(`/api/agent/conversations/${id}`);
      if (!res.ok) return;
      const data = await res.json();

      const loaded: ApiMessage[] = data.messages.map(
        (m: { role: string; content: string; fileNames?: string[] }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
          ...(m.fileNames ? { fileNames: m.fileNames } : {}),
        })
      );

      setConversationId(id);
      setApiHistory(loaded);
      setMessages(apiToMessages(loaded));
      setInput("");
      setPendingFiles([]);
    } catch {
      console.error("Failed to load conversation");
    } finally {
      setLoadingConversation(false);
    }
  };

  const newConversation = () => {
    setConversationId(null);
    setMessages([]);
    setApiHistory([]);
    setInput("");
    setPendingFiles([]);
    setShowHistory(false);
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/agent/conversations/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) return;
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (conversationId === id) {
        newConversation();
      }
    } catch {
      console.error("Failed to delete conversation");
    }
  };

  const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp"]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (isLoading) return;
    const droppedFiles = Array.from(e.dataTransfer.files).filter((f) => ALLOWED_TYPES.has(f.type));
    if (droppedFiles.length > 0) {
      setPendingFiles((prev) => [...prev, ...droppedFiles]);
    }
  };

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
      {
        role: "user",
        content: text || "(attached file)",
        ...(fileNames.length > 0 ? { fileNames } : {}),
      },
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
          } else if (event.type === "warning") {
            fullText += `\n\n---\n> **Note:** ${event.message ?? "The response may be incomplete."}`;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, text: fullText } : m,
              ),
            );
          } else if (event.type === "usage") {
            // Refresh the stats bar after usage is recorded
            setUsageRefreshKey((k) => k + 1);
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

      const finalHistory: ApiMessage[] = [
        ...newHistory,
        { role: "assistant", content: fullText },
      ];
      setApiHistory(finalHistory);

      // Auto-save (fire-and-forget)
      saveConversation(finalHistory);
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

  const currentTitle = conversations.find((c) => c.id === conversationId)?.title;

  return (
    <div
      className="max-w-3xl mx-auto px-4 flex flex-col h-full relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-indigo-50/90 border-2 border-dashed border-indigo-400 rounded-2xl flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <svg className="w-10 h-10 text-indigo-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16v-8m0 0l-3 3m3-3l3 3M3 16.5V18a2.25 2.25 0 002.25 2.25h13.5A2.25 2.25 0 0021 18v-1.5m-18 0V7.875c0-.621.504-1.125 1.125-1.125h3.026a1.125 1.125 0 01.79.327l1.697 1.697a1.125 1.125 0 00.79.327h5.597c.621 0 1.125.504 1.125 1.125V16.5" />
            </svg>
            <p className="text-sm font-medium text-indigo-600">Drop files here</p>
            <p className="text-xs text-indigo-400 mt-0.5">PDF or image files</p>
          </div>
        </div>
      )}

      {/* Conversation header bar */}
      <div className="flex items-center justify-between pt-3 pb-1 gap-2">
        <div className="text-xs text-gray-500 truncate min-w-0">
          {currentTitle || (messages.length > 0 ? "Unsaved conversation" : "")}
        </div>
        <div className="flex items-center gap-1 shrink-0 relative" ref={historyRef}>
          {/* New chat button */}
          <button
            onClick={newConversation}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="New conversation"
            aria-label="New conversation"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          {/* History toggle button */}
          <button
            onClick={() => setShowHistory((v) => !v)}
            className={`p-1.5 rounded-lg transition-colors ${
              showHistory
                ? "text-[#1a2b5f] bg-[#1a2b5f]/10"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            }`}
            title="Conversation history"
            aria-label="Conversation history"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          {/* History dropdown */}
          {showHistory && (
            <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg z-40 overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">Recent conversations</span>
                <span className="text-xs text-gray-400">{conversations.length}</span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {conversations.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-gray-400 text-center">
                    No saved conversations
                  </div>
                ) : (
                  conversations.slice(0, 20).map((c) => (
                    <div
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => loadConversation(c.id)}
                      onKeyDown={(e) => { if (e.key === "Enter") loadConversation(c.id); }}
                      className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-gray-50 transition-colors group cursor-pointer ${
                        c.id === conversationId ? "bg-[#1a2b5f]/5" : ""
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-700 truncate">{c.title}</div>
                        <div className="text-[10px] text-gray-400">{relativeTime(c.updatedAt)}</div>
                      </div>
                      <button
                        onClick={(e) => deleteConversation(c.id, e)}
                        className="shrink-0 p-1 rounded text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete conversation"
                        aria-label={`Delete "${c.title}"`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Loading overlay for conversation switch */}
      {loadingConversation && (
        <div className="absolute inset-0 z-30 bg-white/60 flex items-center justify-center">
          <span className="w-5 h-5 border-2 border-gray-300 border-t-[#1a2b5f] rounded-full animate-spin" />
        </div>
      )}

      {/* API usage stats */}
      <UsageStatsBar refreshKey={usageRefreshKey} />

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto py-4 space-y-5">
        {messages.length === 0 && (
          <div className="text-center py-14">
            <Image
              src="/assets/top-dog-avatar.png"
              alt="Top Dog Paul's AI Brain"
              width={80}
              height={80}
              className="rounded-2xl mx-auto mb-4 shadow-md"
            />
            <p className="text-base font-semibold text-gray-700">
              <abbr title="Top Dog Paul's AI Brain" className="no-underline cursor-default">
                TDPAIB
              </abbr>
            </p>
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
            {msg.role === "user" ? (
              <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5 bg-[#1a2b5f] text-white">
                P
              </div>
            ) : (
              <Image
                src="/assets/top-dog-avatar.png"
                alt="TDPAIB"
                width={28}
                height={28}
                className="shrink-0 w-7 h-7 rounded-full mt-0.5 object-cover"
              />
            )}

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
                  ) : msg.role === "assistant" ? (
                    <MarkdownMessage content={msg.text} />
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
          <abbr title="Top Dog Paul's AI Brain" className="no-underline cursor-default">TDPAIB</abbr> · Internal use only
        </p>
      </div>
    </div>
  );
}
