"use client";

import React, { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import type { ProductDocStatus } from "@/lib/documents";

type StatusCategory = "all" | "missing" | "partial" | "complete";

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

const CATEGORY_LABELS: Record<string, string> = {
  coa: "COA",
  "test-results": "Test Results",
  specs: "Specification Sheets",
  labels: "Label Photos",
  photos: "Product Photos",
};

const CATEGORY_ORDER = ["coa", "test-results", "specs", "labels", "photos"];

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
];

export default function QADashboardClient({ statuses, today }: { statuses: ProductDocStatus[]; today: string }) {
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

  const counts = useMemo(() => {
    const c = { all: statuses.length, missing: 0, partial: 0, complete: 0 };
    for (const s of statuses) {
      c[getCategory(s)]++;
    }
    return c;
  }, [statuses]);

  const filtered = filter === "all" ? statuses : statuses.filter((s) => getCategory(s) === filter);

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
                              const pillColor = lot.hasCOA
                                ? "bg-green-50 text-green-700 border border-green-200"
                                : "bg-red-50 text-red-700 border border-red-200";
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
                                  {lot.hasCOA ? " \u2713" : " \u2717"}
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
                          <DocumentsPanel
                            productId={s.productId}
                            docs={docsCache[s.productId]}
                            loading={loadingDocs === s.productId}
                            lots={s.lots}
                            today={today}
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
}: {
  productId: string;
  docs: DocEntry[] | undefined;
  loading: boolean;
  lots: Array<{ lotNumber: string; bbd: string }>;
  today: string;
}) {
  const bbdByLot = useMemo(() => {
    const m: Record<string, string> = {};
    for (const lot of lots) {
      if (lot.bbd) m[lot.lotNumber] = lot.bbd;
    }
    return m;
  }, [lots]);
  if (loading || !docs) {
    return <p className="text-sm text-gray-400 py-1">Loading documents...</p>;
  }

  if (docs.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-1">
        No documents uploaded.{" "}
        <Link href={`/qa/upload/${productId}`} className="text-blue-600 hover:underline">
          Upload documents
        </Link>
      </p>
    );
  }

  const grouped: Record<string, DocEntry[]> = {};
  for (const d of docs) {
    (grouped[d.category] ??= []).push(d);
  }

  return (
    <div className="space-y-3">
      {CATEGORY_ORDER.filter((cat) => grouped[cat]).map((cat) => (
        <div key={cat}>
          <h4 className="text-sm font-semibold text-gray-600 mb-1">
            {CATEGORY_LABELS[cat] ?? cat}
          </h4>
          <div className="space-y-1 pl-3">
            {grouped[cat].map((d) => (
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
              </div>
            ))}
          </div>
        </div>
      ))}
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
