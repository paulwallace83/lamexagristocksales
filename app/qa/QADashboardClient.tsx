"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import type { ProductDocStatus } from "@/lib/documents";

type StatusCategory = "all" | "missing" | "partial" | "complete";

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

export default function QADashboardClient({ statuses }: { statuses: ProductDocStatus[] }) {
  const [filter, setFilter] = useState<StatusCategory>("all");

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
                      <td className="px-4 py-3 font-medium text-gray-900">{s.product}</td>
                      <td className="px-4 py-3 text-center">
                        <CoverageBadge have={s.lotsWithCOA} total={s.lotCount} />
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
                        <td colSpan={7} className="px-4 py-2 bg-gray-50/60">
                          <div className="flex flex-wrap gap-1.5">
                            {s.lots.map((lot) => {
                              const pillColor = !lot.hasCOA
                                ? "bg-red-50 text-red-700 border border-red-200"
                                : s.complete
                                  ? "bg-green-50 text-green-700 border border-green-200"
                                  : "bg-amber-50 text-amber-700 border border-amber-200";
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
                                  {lot.hasCOA ? " \u2713" : " \u2717"}
                                </span>
                              );
                            })}
                          </div>
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
