"use client";

import { useState } from "react";

interface BackfillStatus {
  totalDocuments: number;
  totalLots: number;
  productCount: number;
  products: Array<{
    product: string;
    documents: Array<{ filename: string; lots: Array<{ lotNumber: string }> }>;
  }>;
}

interface BackfillResult {
  message: string;
  processed: number;
  succeeded: number;
  failed: number;
  lotsUpdated: number;
  results?: Array<{ filename: string; status: string; lots?: number; error?: string }>;
}

export default function BackfillClient() {
  const [status, setStatus] = useState<BackfillStatus | null>(null);
  const [result, setResult] = useState<BackfillResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkStatus() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/backfill-coa");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check status");
    } finally {
      setLoading(false);
    }
  }

  async function runBackfill() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/backfill-coa", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResult(data);
      setStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backfill failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">COA Data Backfill</h1>
      <p className="text-sm text-gray-500 mb-6">
        Re-extract key aspects (brix, acidity, color, etc.) from COA documents that were uploaded
        before auto-extraction was enabled, or where extraction failed.
      </p>

      <div className="space-y-4">
        {/* Step 1: Check Status */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="font-semibold text-gray-900 mb-2">Step 1: Check Status</h2>
          <button
            onClick={checkStatus}
            disabled={loading}
            className="bg-[#1a2b5f] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#4a90c4] transition-colors disabled:opacity-50"
          >
            {loading && !result ? "Checking..." : "Check for Missing COA Data"}
          </button>

          {status && (
            <div className="mt-3 bg-gray-50 rounded p-3 text-sm">
              <p><strong>Documents needing extraction:</strong> {status.totalDocuments}</p>
              <p><strong>Lots missing COA data:</strong> {status.totalLots}</p>
              <p><strong>Products affected:</strong> {status.productCount}</p>
              {status.products.length > 0 && (
                <ul className="mt-2 space-y-1 text-gray-600">
                  {status.products.map((p) => (
                    <li key={p.product}>
                      {p.product} — {p.documents.length} doc(s),{" "}
                      {p.documents.reduce((n, d) => n + d.lots.length, 0)} lot(s)
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Step 2: Run Backfill */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="font-semibold text-gray-900 mb-2">Step 2: Run Backfill</h2>
          <p className="text-xs text-gray-400 mb-3">
            Extracts data from each COA document using Claude AI vision. May take a minute.
          </p>
          <button
            onClick={runBackfill}
            disabled={loading}
            className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {loading && !status ? "Running Backfill..." : "Run Backfill Now"}
          </button>

          {result && (
            <div className="mt-3 bg-gray-50 rounded p-3 text-sm">
              <p className="font-medium text-gray-900 mb-1">{result.message}</p>
              {result.results && result.results.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {result.results.map((r, i) => (
                    <li key={i} className={r.status === "ok" ? "text-emerald-700" : "text-red-600"}>
                      {r.filename}: {r.status}
                      {r.lots ? ` (${r.lots} lots updated)` : ""}
                      {r.error ? ` — ${r.error}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
