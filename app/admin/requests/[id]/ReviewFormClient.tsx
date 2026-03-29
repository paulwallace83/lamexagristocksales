"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReviewFormClient({ requestId }: { requestId: number }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; status?: string; warning?: string; error?: string } | null>(null);

  const handleAction = async (status: "approved" | "rejected") => {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/document-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes: notes.trim() || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult({ success: false, error: data.error || "Failed to update" });
        return;
      }

      setResult(data);

      // Refresh the page after a brief delay to show the result
      setTimeout(() => router.refresh(), 1500);
    } catch {
      setResult({ success: false, error: "Network error" });
    } finally {
      setLoading(false);
    }
  };

  if (result?.success) {
    return (
      <div className={`rounded-lg p-4 border ${
        result.status === "sent"
          ? "bg-emerald-50 border-emerald-200"
          : result.status === "rejected"
          ? "bg-red-50 border-red-200"
          : "bg-blue-50 border-blue-200"
      }`}>
        <p className={`text-sm font-semibold ${
          result.status === "sent" ? "text-emerald-700" : result.status === "rejected" ? "text-red-700" : "text-blue-700"
        }`}>
          {result.status === "sent"
            ? "Documents sent to customer"
            : result.status === "rejected"
            ? "Request rejected"
            : "Request approved"}
        </p>
        {result.warning && (
          <p className="text-xs text-amber-600 mt-1">{result.warning}</p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h2 className="text-sm font-bold text-gray-900 mb-3">Review</h2>

      <textarea
        rows={3}
        maxLength={2000}
        placeholder="Notes (optional — included in customer email if approved)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b5f] mb-3"
      />

      {result?.error && (
        <p className="text-xs text-red-600 mb-3">{result.error}</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => handleAction("approved")}
          disabled={loading}
          className="flex-1 bg-emerald-600 text-white text-sm font-semibold py-2 rounded-md hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          {loading ? "..." : "Approve & Send"}
        </button>
        <button
          onClick={() => handleAction("rejected")}
          disabled={loading}
          className="flex-1 bg-white text-red-600 text-sm font-semibold py-2 rounded-md border border-red-300 hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {loading ? "..." : "Reject"}
        </button>
      </div>
    </div>
  );
}
