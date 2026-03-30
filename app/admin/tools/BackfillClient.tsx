"use client";

import { useState } from "react";

/* ─── COA Backfill types ─────────────────────────────────────────── */
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

/* ─── Rename Uploads types ───────────────────────────────────────── */
interface RenamePreview {
  id: string;
  productId: string;
  category: string;
  currentFilename: string;
  newFilename: string;
  foundOnDisk: boolean;
}

interface RenameStatus {
  total: number;
  alreadyRenamed: number;
  toRename: number;
  previews: RenamePreview[];
}

interface RenameResult {
  message: string;
  renamed: number;
  skipped: number;
  failed: number;
  results: Array<{ filename: string; newFilename: string; status: string; error?: string }>;
}

/* ─── Component ──────────────────────────────────────────────────── */
export default function BackfillClient() {
  // COA backfill state
  const [backfillStatus, setBackfillStatus] = useState<BackfillStatus | null>(null);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillError, setBackfillError] = useState<string | null>(null);

  // Rename uploads state
  const [renameStatus, setRenameStatus] = useState<RenameStatus | null>(null);
  const [renameResult, setRenameResult] = useState<RenameResult | null>(null);
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  /* ── COA Backfill handlers ── */
  async function checkBackfillStatus() {
    setBackfillLoading(true);
    setBackfillError(null);
    try {
      const res = await fetch("/api/backfill-coa");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setBackfillStatus(await res.json());
    } catch (err) {
      setBackfillError(err instanceof Error ? err.message : "Failed to check status");
    } finally {
      setBackfillLoading(false);
    }
  }

  async function runBackfill() {
    setBackfillLoading(true);
    setBackfillError(null);
    setBackfillResult(null);
    try {
      const res = await fetch("/api/backfill-coa", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setBackfillResult(await res.json());
      setBackfillStatus(null);
    } catch (err) {
      setBackfillError(err instanceof Error ? err.message : "Backfill failed");
    } finally {
      setBackfillLoading(false);
    }
  }

  /* ── Rename Uploads handlers ── */
  async function checkRenameStatus() {
    setRenameLoading(true);
    setRenameError(null);
    try {
      const res = await fetch("/api/rename-uploads");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRenameStatus(await res.json());
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Failed to check status");
    } finally {
      setRenameLoading(false);
    }
  }

  async function runRename() {
    setRenameLoading(true);
    setRenameError(null);
    setRenameResult(null);
    try {
      const res = await fetch("/api/rename-uploads", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRenameResult(await res.json());
      setRenameStatus(null);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setRenameLoading(false);
    }
  }

  /* ── Render ── */
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-10">

      {/* ── COA Data Backfill ── */}
      <section>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">COA Data Backfill</h1>
        <p className="text-sm text-gray-500 mb-6">
          Re-extract key aspects (brix, acidity, color, etc.) from COA documents that were uploaded
          before auto-extraction was enabled, or where extraction failed.
        </p>
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="font-semibold text-gray-900 mb-2">Step 1: Check Status</h2>
            <button
              onClick={checkBackfillStatus}
              disabled={backfillLoading}
              className="bg-[#1a2b5f] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#4a90c4] transition-colors disabled:opacity-50"
            >
              {backfillLoading && !backfillResult ? "Checking..." : "Check for Missing COA Data"}
            </button>
            {backfillStatus && (
              <div className="mt-3 bg-gray-50 rounded p-3 text-sm">
                <p><strong>Documents needing extraction:</strong> {backfillStatus.totalDocuments}</p>
                <p><strong>Lots missing COA data:</strong> {backfillStatus.totalLots}</p>
                <p><strong>Products affected:</strong> {backfillStatus.productCount}</p>
                {backfillStatus.products.length > 0 && (
                  <ul className="mt-2 space-y-1 text-gray-600">
                    {backfillStatus.products.map((p) => (
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

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="font-semibold text-gray-900 mb-2">Step 2: Run Backfill</h2>
            <p className="text-xs text-gray-400 mb-3">
              Extracts data from each COA document using Claude AI vision. May take a minute.
            </p>
            <button
              onClick={runBackfill}
              disabled={backfillLoading}
              className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {backfillLoading && !backfillStatus ? "Running Backfill..." : "Run Backfill Now"}
            </button>
            {backfillResult && (
              <div className="mt-3 bg-gray-50 rounded p-3 text-sm">
                <p className="font-medium text-gray-900 mb-1">{backfillResult.message}</p>
                {backfillResult.results && backfillResult.results.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {backfillResult.results.map((r, i) => (
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
          {backfillError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {backfillError}
            </div>
          )}
        </div>
      </section>

      <hr className="border-gray-200" />

      {/* ── Rename Uploads ── */}
      <section>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Rename Uploaded Files</h1>
        <p className="text-sm text-gray-500 mb-6">
          Renames files still using the old timestamp prefix (e.g.{" "}
          <code className="bg-gray-100 px-1 rounded text-xs">1774670705540-file.pdf</code>) to the
          descriptive format:{" "}
          <code className="bg-gray-100 px-1 rounded text-xs">
            YYYY-MM-DD. Product - Type - LotNumber.pdf
          </code>
          . Safe to run multiple times — skips already-renamed files.
        </p>
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="font-semibold text-gray-900 mb-2">Step 1: Preview</h2>
            <button
              onClick={checkRenameStatus}
              disabled={renameLoading}
              className="bg-[#1a2b5f] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#4a90c4] transition-colors disabled:opacity-50"
            >
              {renameLoading && !renameResult ? "Checking..." : "Preview Files to Rename"}
            </button>
            {renameStatus && (
              <div className="mt-3 bg-gray-50 rounded p-3 text-sm">
                <p><strong>Total documents:</strong> {renameStatus.total}</p>
                <p><strong>Already renamed:</strong> {renameStatus.alreadyRenamed}</p>
                <p><strong>To rename:</strong> {renameStatus.toRename}</p>
                {renameStatus.previews.length > 0 && (
                  <ul className="mt-3 space-y-2 text-gray-600 text-xs">
                    {renameStatus.previews.map((p) => (
                      <li key={p.id}>
                        <span className={p.foundOnDisk ? "text-gray-500" : "text-red-500"}>
                          {p.currentFilename}
                        </span>
                        <br />
                        <span className="text-emerald-700">→ {p.newFilename}</span>
                        {!p.foundOnDisk && (
                          <span className="ml-2 text-red-500">(file not found on disk)</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {renameStatus.toRename === 0 && (
                  <p className="text-emerald-700 mt-2">✓ All files already use descriptive names.</p>
                )}
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="font-semibold text-gray-900 mb-2">Step 2: Run Rename</h2>
            <p className="text-xs text-gray-400 mb-3">
              Renames files on disk and updates the database in one operation.
            </p>
            <button
              onClick={runRename}
              disabled={renameLoading}
              className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {renameLoading && !renameStatus ? "Renaming..." : "Rename Now"}
            </button>
            {renameResult && (
              <div className="mt-3 bg-gray-50 rounded p-3 text-sm">
                <p className="font-medium text-gray-900 mb-1">{renameResult.message}</p>
                {renameResult.results.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {renameResult.results.map((r, i) => (
                      <li key={i} className={r.status === "ok" ? "text-emerald-700" : r.status === "skipped" ? "text-amber-600" : "text-red-600"}>
                        {r.status === "ok" ? "✓" : r.status === "skipped" ? "–" : "✗"}{" "}
                        {r.newFilename}
                        {r.error ? ` — ${r.error}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {renameError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {renameError}
            </div>
          )}
        </div>
      </section>

    </div>
  );
}
