"use client";

import { useState, useCallback, Fragment } from "react";

interface ProductSummary {
  id: string;
  product: string;
  commodity: string;
  format: string;
  organic: boolean;
  packSize: string;
  unitType: string;
  origins: string[];
  totalQuantity: number;
  totalWeightLbs: number;
}

interface FlagMap {
  [productId: string]: { newArrival: boolean; featured: boolean };
}

interface Props {
  products: ProductSummary[];
  initialFlags: FlagMap;
}

type FlagType = "new_arrival" | "featured";

function formatWeight(lbs: number): string {
  if (lbs >= 1_000_000) return `${(lbs / 1_000_000).toFixed(1)}M lbs`;
  if (lbs >= 1_000) return `${Math.round(lbs / 1_000).toLocaleString()}K lbs`;
  return `${lbs.toLocaleString()} lbs`;
}

export default function EmailComposerClient({ products, initialFlags }: Props) {
  const [flags, setFlags] = useState<FlagMap>(initialFlags);
  const [subject, setSubject] = useState("Lamex Agri Foods — Weekly Inventory Update");
  const [recipients, setRecipients] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [activeTab, setActiveTab] = useState<"compose" | "preview">("compose");

  const newArrivalCount = products.filter((p) => flags[p.id]?.newArrival).length;
  const featuredCount = products.filter((p) => flags[p.id]?.featured).length;

  const toggleFlag = useCallback(async (productId: string, flag: FlagType) => {
    try {
      const res = await fetch("/api/email/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, flag }),
      });
      if (!res.ok) return;
      const data = await res.json();

      setFlags((prev) => {
        const current = prev[productId] ?? { newArrival: false, featured: false };
        return {
          ...prev,
          [productId]: {
            ...current,
            ...(flag === "new_arrival" ? { newArrival: data.active } : { featured: data.active }),
          },
        };
      });
      // Refresh preview
      setPreviewKey((k) => k + 1);
    } catch {
      // Silently fail — UI stays in sync on next page load
    }
  }, []);

  const handleSend = async () => {
    if (!recipients.trim()) {
      setSendResult({ success: false, message: "Please enter at least one recipient email." });
      return;
    }

    setSending(true);
    setSendResult(null);

    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients, subject }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSendResult({
          success: true,
          message: `Email sent to ${data.recipientCount} recipient${data.recipientCount !== 1 ? "s" : ""}.`,
        });
      } else {
        setSendResult({ success: false, message: data.error || "Failed to send email." });
      }
    } catch {
      setSendResult({ success: false, message: "Network error — could not send email." });
    } finally {
      setSending(false);
    }
  };

  // Group products by format
  const formatOrder = ["IQF", "Juice Concentrate", "Puree"];
  const grouped = new Map<string, ProductSummary[]>();
  for (const p of products) {
    const arr = grouped.get(p.format) ?? [];
    arr.push(p);
    grouped.set(p.format, arr);
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Marketing Email Composer</h1>
        <p className="mt-1 text-sm text-gray-500">
          Toggle product badges, preview the email, and send to your buyer list.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-[#1a2b5f]">{products.length}</div>
          <div className="text-xs text-gray-500 uppercase">Products</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{newArrivalCount}</div>
          <div className="text-xs text-gray-500 uppercase">New Arrivals</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{featuredCount}</div>
          <div className="text-xs text-gray-500 uppercase">Featured</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-[#1a2b5f]">
            {formatWeight(products.reduce((sum, p) => sum + p.totalWeightLbs, 0))}
          </div>
          <div className="text-xs text-gray-500 uppercase">Total Weight</div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab("compose")}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            activeTab === "compose"
              ? "border-[#1a2b5f] text-[#1a2b5f]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Compose
        </button>
        <button
          onClick={() => { setActiveTab("preview"); setPreviewKey((k) => k + 1); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            activeTab === "preview"
              ? "border-[#1a2b5f] text-[#1a2b5f]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Preview
        </button>
      </div>

      {activeTab === "compose" && (
        <div className="space-y-6">
          {/* Product selection table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-700">
                Product Badges — click to toggle
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-2 font-medium text-gray-500">Product</th>
                    <th className="px-4 py-2 font-medium text-gray-500">Format</th>
                    <th className="px-4 py-2 font-medium text-gray-500">Type</th>
                    <th className="px-4 py-2 font-medium text-gray-500">Origin</th>
                    <th className="px-4 py-2 font-medium text-gray-500 text-right">Weight</th>
                    <th className="px-4 py-2 font-medium text-gray-500 text-center">New</th>
                    <th className="px-4 py-2 font-medium text-gray-500 text-center">Featured</th>
                  </tr>
                </thead>
                <tbody>
                  {formatOrder.map((format) => {
                    const items = grouped.get(format);
                    if (!items || items.length === 0) return null;
                    return (
                      <Fragment key={format}>
                        <tr className="bg-[#1a2b5f]/5">
                          <td colSpan={7} className="px-4 py-2 font-semibold text-[#1a2b5f] text-xs uppercase tracking-wide">
                            {format} ({items.length})
                          </td>
                        </tr>
                        {items.map((p, i) => {
                          const pFlags = flags[p.id] ?? { newArrival: false, featured: false };
                          return (
                            <tr key={p.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                              <td className="px-4 py-2 font-medium text-gray-900">{p.product}</td>
                              <td className="px-4 py-2 text-gray-600">{p.format}</td>
                              <td className="px-4 py-2">
                                {p.organic ? (
                                  <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                                    Organic
                                  </span>
                                ) : (
                                  <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
                                    Conventional
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-gray-600">{p.origins.join(", ")}</td>
                              <td className="px-4 py-2 text-gray-600 text-right">{formatWeight(p.totalWeightLbs)}</td>
                              <td className="px-4 py-2 text-center">
                                <button
                                  onClick={() => toggleFlag(p.id, "new_arrival")}
                                  className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                                    pFlags.newArrival
                                      ? "bg-green-100 text-green-800 ring-1 ring-green-300"
                                      : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                                  }`}
                                >
                                  New
                                </button>
                              </td>
                              <td className="px-4 py-2 text-center">
                                <button
                                  onClick={() => toggleFlag(p.id, "featured")}
                                  className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                                    pFlags.featured
                                      ? "bg-blue-100 text-blue-800 ring-1 ring-blue-300"
                                      : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                                  }`}
                                >
                                  Featured
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Send panel */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Send Email</h2>

            <div>
              <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
                Subject
              </label>
              <input
                id="subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b5f]/30 focus:border-[#1a2b5f]"
              />
            </div>

            <div>
              <label htmlFor="recipients" className="block text-sm font-medium text-gray-700 mb-1">
                Recipients
                <span className="font-normal text-gray-400 ml-1">(comma or newline separated)</span>
              </label>
              <textarea
                id="recipients"
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                rows={4}
                placeholder={"buyer1@example.com\nbuyer2@example.com"}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b5f]/30 focus:border-[#1a2b5f] font-mono"
              />
              <p className="mt-1 text-xs text-gray-400">
                {recipients.split(/[,\n]+/).filter((e) => e.trim()).length} recipient(s) entered
              </p>
            </div>

            {sendResult && (
              <div
                className={`rounded-md p-3 text-sm ${
                  sendResult.success
                    ? "bg-green-50 text-green-800 border border-green-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {sendResult.message}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleSend}
                disabled={sending || !recipients.trim()}
                className="px-5 py-2.5 bg-[#1a2b5f] text-white text-sm font-semibold rounded-md hover:bg-[#243f75] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sending ? "Sending..." : "Send Email"}
              </button>
              <button
                onClick={() => { setActiveTab("preview"); setPreviewKey((k) => k + 1); }}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 transition-colors"
              >
                Preview Email
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "preview" && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Email Preview</h2>
            <button
              onClick={() => setPreviewKey((k) => k + 1)}
              className="text-xs text-[#1a2b5f] hover:text-[#4a90c4] font-medium"
            >
              Refresh Preview
            </button>
          </div>
          <div className="flex justify-center bg-gray-100 p-6">
            <iframe
              key={previewKey}
              src="/api/email/preview"
              title="Email Preview"
              className="w-full max-w-[620px] bg-white border border-gray-200 rounded"
              style={{ minHeight: 800 }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

