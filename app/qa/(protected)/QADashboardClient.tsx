"use client";

import React, { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProductDocStatus } from "@/lib/documents";

type StatusCategory = "all" | "missing" | "partial" | "complete" | "pending-review";

interface DocEntry {
  id: string;
  productId: string;
  category: string;
  filename: string;
  originalName: string;
  uploadedAt: string;
  uploadedBy: string | null;
  url: string;
  baseContract: string | null;
  lotNumbers: string[];
}

// TODO: Extract to shared lib/constants.ts (no server deps) to deduplicate with lib/documents.ts
const CATEGORY_LABELS: Record<string, string> = {
  coa: "COA",
  "test-results": "Test Results",
  specs: "Specification Sheets",
  labels: "Label Photos",
  photos: "Product Photos",
};

const CATEGORY_ORDER = ["coa", "test-results", "specs", "labels", "photos"];
const LOT_LEVEL_CATS = new Set(["coa", "test-results"]);

function getCategory(s: ProductDocStatus): "complete" | "partial" | "missing" {
  if (s.complete) return "complete";
  if (s.lotsWithCOA > 0 || s.contractsWithSpecs > 0 || s.contractsWithLabels > 0 || s.contractsWithPhotos > 0) return "partial";
  return "missing";
}

const FILTER_CONFIG: { key: StatusCategory; label: string; activeClass: string }[] = [
  { key: "all", label: "All", activeClass: "bg-[#1a2b5f] text-white" },
  { key: "missing", label: "Missing", activeClass: "bg-red-100 text-red-800" },
  { key: "partial", label: "Partial", activeClass: "bg-amber-100 text-amber-700" },
  { key: "complete", label: "Complete", activeClass: "bg-green-100 text-green-800" },
  { key: "pending-review", label: "Pending Review", activeClass: "bg-amber-100 text-amber-700" },
];

export default function QADashboardClient({ statuses, today }: { statuses: ProductDocStatus[]; today: string }) {
  const router = useRouter();
  const [filter, setFilter] = useState<StatusCategory>("all");
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [docsCache, setDocsCache] = useState<Record<string, DocEntry[]>>({});
  const [loadingDocs, setLoadingDocs] = useState<string | null>(null);

  const toggleExpand = useCallback(async (productId: string) => {
    if (expandedProductId === productId) {
      setExpandedProductId(null);
      return;
    }
    setExpandedProductId(productId);
    if (docsCache[productId]) return;
    setLoadingDocs(productId);
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(productId)}`);
      if (res.ok) {
        const data = await res.json();
        setDocsCache((prev) => ({ ...prev, [productId]: data.documents ?? [] }));
      } else {
        setDocsCache((prev) => ({ ...prev, [productId]: [] }));
      }
    } catch {
      setDocsCache((prev) => ({ ...prev, [productId]: [] }));
    } finally {
      setLoadingDocs(null);
    }
  }, [expandedProductId, docsCache]);

  const refreshDocs = useCallback(async (productId: string) => {
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(productId)}`);
      if (res.ok) {
        const data = await res.json();
        setDocsCache((prev) => ({ ...prev, [productId]: data.documents ?? [] }));
      } else {
        // Clear cache so re-expand triggers a fresh fetch
        setDocsCache((prev) => { const next = { ...prev }; delete next[productId]; return next; });
      }
    } catch {
      // Clear cache so re-expand triggers a fresh fetch
      setDocsCache((prev) => { const next = { ...prev }; delete next[productId]; return next; });
    }
  }, []);

  const counts = useMemo(() => {
    const c = { all: statuses.length, missing: 0, partial: 0, complete: 0, "pending-review": 0 };
    for (const s of statuses) {
      c[getCategory(s)]++;
      if (s.pendingCoaReviewCount > 0) c["pending-review"]++;
    }
    return c;
  }, [statuses]);

  const filtered = filter === "all"
    ? statuses
    : filter === "pending-review"
      ? statuses.filter((s) => s.pendingCoaReviewCount > 0)
      : statuses.filter((s) => getCategory(s) === filter);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Document Dashboard</h1>
        <p className="text-gray-500 mt-1">
          {counts.complete} of {statuses.length} products have all required documents.
        </p>
      </div>

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTER_CONFIG.map(({ key, label, activeClass }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
              filter === key
                ? activeClass
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {label}
            <span className="ml-1.5 opacity-70">{counts[key]}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>No products match this filter.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white border border-gray-200 rounded-lg shadow-sm">
            <thead>
              <tr className="bg-gray-50 border-b-2 border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Product</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Lot COAs</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Heavy Metals</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Pesticide</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Contract Specs</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Contract Labels</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Contract Photos</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const category = getCategory(s);
                return (
                  <React.Fragment key={s.productId}>
                    <tr className="border-b border-gray-100 hover:bg-blue-50">
                      <td
                        className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap cursor-pointer select-none"
                        onClick={() => toggleExpand(s.productId)}
                      >
                        <span
                          className={`inline-block text-gray-400 text-xs mr-1.5 transition-transform duration-150 ${expandedProductId === s.productId ? "rotate-90" : ""}`}
                        >
                          &#9654;
                        </span>
                        <span>{s.product}</span>
                        {s.organic ? (
                          <span className="ml-2 align-middle inline-block bg-green-100 text-green-700 text-[10px] font-semibold px-1.5 py-0.5 rounded">Organic</span>
                        ) : (
                          <span className="ml-2 align-middle inline-block bg-gray-100 text-gray-500 text-[10px] font-semibold px-1.5 py-0.5 rounded">Conventional</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <CoverageBadge have={s.lotsWithCOA} total={s.lotCount} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {s.expectedTest === "heavy-metals" ? (
                          <CoverageBadge have={s.lotsWithTestResults} total={s.lotCount} />
                        ) : (
                          <span className="text-gray-300 text-sm">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {s.expectedTest === "pesticide" ? (
                          <CoverageBadge have={s.lotsWithTestResults} total={s.lotCount} />
                        ) : (
                          <span className="text-gray-300 text-sm">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <CoverageBadge have={s.contractsWithSpecs} total={s.contractCount} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <CoverageBadge have={s.contractsWithLabels} total={s.contractCount} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {s.requiredDocs.contractLevel.includes("photos") ? (
                          <CoverageBadge have={s.contractsWithPhotos} total={s.contractCount} />
                        ) : (
                          <span className="text-gray-300 text-sm">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {category === "complete" ? (
                          <span className="inline-block bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded">Complete</span>
                        ) : category === "partial" ? (
                          <span className="inline-block bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded">Partial</span>
                        ) : (
                          <span className="inline-block bg-red-100 text-red-800 text-xs font-semibold px-2 py-0.5 rounded">Missing</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          href={`/qa/upload/${s.productId}`}
                          className="inline-block bg-[#1a2b5f] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#4a90c4] transition-colors"
                        >
                          Upload
                        </Link>
                      </td>
                    </tr>
                    {s.lots.length > 0 && (
                      <tr className="border-b border-gray-200">
                        <td colSpan={9} className="px-4 py-2 bg-gray-50/60">
                          <div className="flex flex-wrap gap-1.5">
                            {s.lots.map((lot) => {
                              // Pill color reflects COA coverage AND extraction review status:
                              // - amber  : COA uploaded, extraction pending/rejected review
                              // - green  : COA uploaded, extraction approved (or no extraction)
                              // - red    : no COA document
                              const pendingReview = lot.hasCOA &&
                                (lot.coaReviewStatus === "pending" || lot.coaReviewStatus === "rejected");
                              const pillColor = !lot.hasCOA
                                ? "bg-red-50 text-red-700 border border-red-200"
                                : pendingReview
                                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                                  : "bg-green-50 text-green-700 border border-green-200";
                              const coaGlyph = !lot.hasCOA
                                ? " \u2717"
                                : pendingReview
                                  ? " \u23F3"
                                  : " \u2713";
                              return (
                                <span
                                  key={lot.id}
                                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${pillColor}`}
                                >
                                  <span className="font-mono">{lot.lotNumber}</span>
                                  {lot.contracts.length > 0 && (
                                    <span className="text-[10px] opacity-60">({lot.contracts.join(", ")})</span>
                                  )}
                                  {lot.supplier && (
                                    <span className="text-[10px] opacity-40">{lot.supplier}</span>
                                  )}
                                  {lot.bbd && (
                                    lot.bbd < today ? (
                                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded font-medium">BBD: {lot.bbd}</span>
                                    ) : (
                                      <span className="text-[10px] opacity-50">BBD: {lot.bbd}</span>
                                    )
                                  )}
                                  {coaGlyph}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                    {expandedProductId === s.productId && (
                      <tr className="border-b border-gray-200">
                        <td colSpan={9} className="px-4 py-3 bg-gray-50/60">
                          {s.pendingCoaReviewCount > 0 && (
                            <CoaReviewPanel
                              productId={s.productId}
                              onReviewed={() => router.refresh()}
                            />
                          )}
                          <DocumentsPanel
                            productId={s.productId}
                            docs={docsCache[s.productId]}
                            loading={loadingDocs === s.productId}
                            lots={s.lots}
                            today={today}
                            onRefresh={() => refreshDocs(s.productId)}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DocumentsPanel({
  productId,
  docs,
  loading,
  lots,
  today,
  onRefresh,
}: {
  productId: string;
  docs: DocEntry[] | undefined;
  loading: boolean;
  lots: Array<{ id: number; lotNumber: string; bbd: string; contracts: string[] }>;
  today: string;
  onRefresh: () => void;
}) {
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [uploadCategory, setUploadCategory] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedLots, setSelectedLots] = useState<Set<number>>(new Set());
  const [selectedContract, setSelectedContract] = useState<string>("");

  // Mirrors extractBaseContract() in lib/inventory.ts — must use indexOf (first hyphen)
  // to match server-side logic. Cannot import directly (server-only module).
  const baseContracts = useMemo(() => {
    const set = new Set<string>();
    for (const lot of lots) {
      for (const c of lot.contracts) {
        const dash = c.indexOf("-");
        set.add(dash > 0 ? c.substring(0, dash) : c);
      }
    }
    return Array.from(set);
  }, [lots]);

  const bbdByLot = useMemo(() => {
    const m: Record<string, string> = {};
    for (const lot of lots) {
      if (lot.bbd) m[lot.lotNumber] = lot.bbd;
    }
    return m;
  }, [lots]);

  const handleDelete = async (doc: DocEntry) => {
    if (!window.confirm(`Delete ${doc.originalName}? This cannot be undone.`)) return;
    setDeleting((prev) => new Set(prev).add(doc.id));
    setError(null);
    try {
      const params = new URLSearchParams({
        documentId: doc.id,
        filename: doc.filename,
        category: doc.category,
      });
      if (doc.lotNumbers.length > 0) {
        params.set("lotNumber", doc.lotNumbers[0]);
      } else if (doc.baseContract) {
        params.set("baseContract", doc.baseContract);
      }
      const res = await fetch(
        `/api/documents/${encodeURIComponent(productId)}?${params}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to delete document");
        return;
      }
      onRefresh();
    } catch {
      setError("Failed to delete document");
    } finally {
      setDeleting((prev) => { const next = new Set(prev); next.delete(doc.id); return next; });
    }
  };

  const handleUpload = async (category: string, file: File) => {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("productId", productId);
      formData.append("category", category);

      if (LOT_LEVEL_CATS.has(category)) {
        const lotIds = Array.from(selectedLots);
        if (lotIds.length === 0) {
          setError("Select at least one lot");
          setUploading(false);
          return;
        }
        formData.append("lotIds", lotIds.join(","));
      } else {
        const contract = selectedContract || baseContracts[0];
        if (!contract) {
          setError("No contracts available");
          setUploading(false);
          return;
        }
        formData.append("baseContract", contract);
      }

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Upload failed");
        return;
      }
      setUploadCategory(null);
      setSelectedLots(new Set());
      setSelectedContract("");
      onRefresh();
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (loading || !docs) {
    return <p className="text-sm text-gray-400 py-1">Loading documents...</p>;
  }

  const grouped: Record<string, DocEntry[]> = {};
  for (const d of docs) {
    (grouped[d.category] ??= []).push(d);
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-1.5">
          {error}
        </div>
      )}
      {CATEGORY_ORDER.map((cat) => {
        const catDocs = grouped[cat] ?? [];
        const isLotLevel = LOT_LEVEL_CATS.has(cat);
        return (
          <div key={cat}>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-semibold text-gray-600">
                {CATEGORY_LABELS[cat] ?? cat}
              </h4>
              <button
                type="button"
                onClick={() => {
                  setUploadCategory(uploadCategory === cat ? null : cat);
                  setSelectedLots(new Set());
                  setSelectedContract(baseContracts[0] || "");
                  setError(null);
                }}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                {uploadCategory === cat ? "Cancel" : "+ Upload"}
              </button>
            </div>

            {/* Inline upload form */}
            {uploadCategory === cat && (
              <form
                className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded space-y-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fileInput = e.currentTarget.querySelector(
                    'input[type="file"]'
                  ) as HTMLInputElement;
                  const file = fileInput?.files?.[0];
                  if (!file) return;
                  await handleUpload(cat, file);
                }}
              >
                {isLotLevel ? (
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1">Select lot(s):</p>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                      {lots.map((lot) => (
                        <label
                          key={lot.id}
                          className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded border cursor-pointer transition-colors ${
                            selectedLots.has(lot.id)
                              ? "bg-blue-100 border-blue-400 text-blue-800"
                              : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={selectedLots.has(lot.id)}
                            onChange={() => {
                              setSelectedLots((prev) => {
                                const next = new Set(prev);
                                if (next.has(lot.id)) next.delete(lot.id);
                                else next.add(lot.id);
                                return next;
                              });
                            }}
                          />
                          <span className="font-mono">{lot.lotNumber}</span>
                          {lot.bbd && (
                            lot.bbd < today ? (
                              <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded">
                                BBD: {lot.bbd}
                              </span>
                            ) : (
                              <span className="text-[10px] opacity-50">BBD: {lot.bbd}</span>
                            )
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  baseContracts.length > 1 && (
                    <div>
                      <label className="text-xs font-medium text-gray-600">
                        Contract:
                        <select
                          className="ml-2 text-xs border border-gray-300 rounded px-2 py-1"
                          value={selectedContract}
                          onChange={(e) => setSelectedContract(e.target.value)}
                        >
                          {baseContracts.map((bc) => (
                            <option key={bc} value={bc}>{bc}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                    className="text-xs"
                    required
                  />
                  <button
                    type="submit"
                    disabled={uploading || (isLotLevel && selectedLots.size === 0)}
                    className="text-xs font-semibold px-3 py-1 rounded bg-[#1a2b5f] text-white hover:bg-[#4a90c4] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploading ? "Uploading..." : "Upload"}
                  </button>
                </div>
              </form>
            )}

            {/* Document list */}
            {catDocs.length > 0 ? (
              <div className="space-y-1 pl-3">
                {catDocs.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 text-sm">
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline truncate max-w-sm"
                      title={d.originalName}
                    >
                      {d.originalName}
                    </a>
                    {d.lotNumbers.length > 0 && (
                      <span className="text-gray-400 font-mono text-xs">
                        Lot {d.lotNumbers.join(", ")}
                      </span>
                    )}
                    {d.lotNumbers.length > 0 && (() => {
                      const bbd = bbdByLot[d.lotNumbers[0]];
                      if (!bbd) return null;
                      return bbd < today ? (
                        <span className="text-xs bg-amber-100 text-amber-700 px-1 rounded font-medium">BBD: {bbd}</span>
                      ) : (
                        <span className="text-gray-400 text-xs">BBD: {bbd}</span>
                      );
                    })()}
                    {d.baseContract && (
                      <span className="text-gray-400 font-mono text-xs">
                        Contract {d.baseContract}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(d)}
                      disabled={deleting.has(d.id)}
                      className="text-red-400 hover:text-red-600 transition-colors disabled:opacity-50 flex-shrink-0"
                      title="Delete document"
                    >
                      {deleting.has(d.id) ? (
                        <span className="text-xs">...</span>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 pl-3">No documents uploaded.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CoverageBadge({ have, total }: { have: number; total: number }) {
  if (total === 0) {
    return <span className="text-gray-400 text-sm">No lots</span>;
  }
  const color = have >= total ? "text-green-600" : have > 0 ? "text-amber-600" : "text-red-500";
  return (
    <span className={`${color} font-bold`}>
      {have}/{total}
    </span>
  );
}

// ─── COA Extraction Review ─────────────────────────────────────────────

interface ReviewItem {
  lotId: number;
  lotNumber: string;
  productId: string;
  reviewStatus: "pending" | "approved" | "rejected";
  updatedAt: string;
  updatedBy: string;
  fields: Array<{ label: string; value: string }>;
}

function CoaReviewPanel({
  productId,
  onReviewed,
}: {
  productId: string;
  onReviewed: () => void;
}) {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/coa-review?productId=${encodeURIComponent(productId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load review queue");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  // Load on mount
  React.useEffect(() => { load(); }, [load]);

  const act = async (lotIds: number[], action: "approve" | "reject") => {
    setBusy((prev) => {
      const next = new Set(prev);
      for (const id of lotIds) next.add(id);
      return next;
    });
    setError(null);
    try {
      const res = await fetch("/api/coa-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotIds, action }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Optimistically remove approved items (approved lots drop from pending queue)
      // Rejected items stay visible (reviewStatus = 'rejected').
      setItems((prev) => {
        if (!prev) return prev;
        if (action === "approve") return prev.filter((i) => !lotIds.includes(i.lotId));
        return prev.map((i) => lotIds.includes(i.lotId) ? { ...i, reviewStatus: "rejected" } : i);
      });
      onReviewed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review action failed");
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        for (const id of lotIds) next.delete(id);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-xs text-amber-700">Loading COA review queue…</p>
      </div>
    );
  }

  if (!items || items.length === 0) return null;

  const pendingIds = items.filter((i) => i.reviewStatus === "pending").map((i) => i.lotId);

  return (
    <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-amber-900">COA Extraction Review</h3>
          <p className="text-xs text-amber-700 mt-0.5">
            {pendingIds.length} lot{pendingIds.length === 1 ? "" : "s"} with auto-extracted values awaiting verification.
            These extracted values are not shown publicly until approved.
          </p>
        </div>
        {pendingIds.length > 1 && (
          <button
            onClick={() => act(pendingIds, "approve")}
            disabled={busy.size > 0}
            className="text-xs font-semibold bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 disabled:opacity-50"
          >
            Approve All ({pendingIds.length})
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.lotId} className="bg-white border border-amber-200 rounded px-3 py-2">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono font-bold text-xs text-[#1a2b5f]">Lot {item.lotNumber}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    item.reviewStatus === "rejected"
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                  }`}>
                    {item.reviewStatus === "rejected" ? "Rejected" : "Pending"}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {item.updatedBy} · {item.updatedAt.slice(0, 10)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {item.fields.map((f) => (
                    <span
                      key={f.label}
                      className="text-xs bg-[#1a2b5f]/5 text-[#1a2b5f]/70 px-1.5 py-0.5 rounded"
                    >
                      <span className="font-medium">{f.label}:</span> {f.value}
                    </span>
                  ))}
                  {item.fields.length === 0 && (
                    <span className="text-xs text-gray-400 italic">No displayable fields</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {item.reviewStatus !== "rejected" && (
                  <button
                    onClick={() => act([item.lotId], "reject")}
                    disabled={busy.has(item.lotId)}
                    className="text-xs font-semibold bg-white border border-red-300 text-red-700 px-2.5 py-1 rounded hover:bg-red-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                )}
                <button
                  onClick={() => act([item.lotId], "approve")}
                  disabled={busy.has(item.lotId)}
                  className="text-xs font-semibold bg-green-600 text-white px-2.5 py-1 rounded hover:bg-green-700 disabled:opacity-50"
                >
                  Approve
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
