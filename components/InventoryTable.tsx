"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import FilterBar from "./FilterBar";
import {
  Product,
  getTotalQuantity,
  getTotalWeight,
  getUniqueCOOs,
  getUniqueWarehouses,
  formatWeight,
  formatQuantity,
  getFilterOptions,
} from "@/lib/inventory";

interface InventoryTableProps {
  products: Product[];
  lastUpdated: string;
  productIdsWithDocs?: string[];
}

export default function InventoryTable({ products, lastUpdated, productIdsWithDocs = [] }: InventoryTableProps) {
  const [filters, setFilters] = useState({
    commodity: "",
    format: "",
    origin: "",
    state: "",
    search: "",
    type: "",
  });

  const docsSet = useMemo(() => new Set(productIdsWithDocs), [productIdsWithDocs]);
  const { commodities, formats, origins, states } = getFilterOptions(products);

  const handleFilterChange = (key: string, value: string | boolean) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilter = (key: string) => {
    setFilters((prev) => ({ ...prev, [key]: "" }));
  };

  const filtered = products.filter((p) => {
    if (filters.commodity && p.commodity !== filters.commodity) return false;
    if (filters.format && p.format !== filters.format) return false;
    if (filters.origin && !p.listings.some((l) => l.countryOfOrigin === filters.origin)) return false;
    if (filters.state && !p.listings.some((l) => l.state === filters.state)) return false;
    if (filters.type === "Organic" && !p.organic) return false;
    if (filters.type === "Conventional" && p.organic) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const searchable = [
        p.product,
        p.commodity,
        p.format,
        p.specification,
        p.variety,
        p.processType,
        ...p.certifications,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });

  const activeFilters = Object.entries(filters).filter(([, v]) => v !== "");
  const hasFilters = activeFilters.length > 0;

  return (
    <div>
      <FilterBar
        commodities={commodities}
        formats={formats}
        origins={origins}
        states={states}
        filters={filters}
        onFilterChange={handleFilterChange}
      />

      {/* Active filters & count */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-gray-500">
            {filtered.length} of {products.length} products
            <span className="hidden sm:inline"> | Updated {lastUpdated}</span>
          </p>
          {hasFilters && activeFilters.map(([key, value]) => (
            <button
              key={key}
              onClick={() => clearFilter(key)}
              className="inline-flex items-center gap-1 bg-[#1a2b5f]/10 text-[#1a2b5f] text-xs font-medium px-2.5 py-1 rounded-full hover:bg-[#1a2b5f]/20 transition-colors"
            >
              {key === "search" ? `"${value}"` : value}
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ))}
        </div>
        {hasFilters && (
          <button
            onClick={() => setFilters({ commodity: "", format: "", origin: "", state: "", search: "", type: "" })}
            className="text-xs text-gray-500 hover:text-[#1a2b5f] transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
              <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Format</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Spec</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Origin</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pack Size</th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Quantity</th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Weight</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Warehouse</th>
              <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Price</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <tr
                key={p.id}
                className={`border-b border-gray-100 hover:bg-blue-50/50 transition-colors ${i % 2 === 1 ? "bg-gray-50/50" : ""}`}
              >
                <td className="px-4 py-3">
                  <Link href={`/product/${p.id}`} className="text-[#1a2b5f] font-semibold hover:underline">
                    {p.product}
                  </Link>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {p.certifications.map((c) => (
                      <span key={c} className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{c}</span>
                    ))}
                    {docsSet.has(p.id) && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium" title="Documents available">
                        Docs
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 text-center">
                  {p.organic ? (
                    <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded">
                      <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.5 17a4.5 4.5 0 01-1.44-8.765 4.5 4.5 0 018.302-3.046 3.5 3.5 0 014.504 4.272A4 4 0 0115 17H5.5zm3.75-2.75a.75.75 0 001.5 0V9.66l1.95 2.1a.75.75 0 101.1-1.02l-3.25-3.5a.75.75 0 00-1.1 0l-3.25 3.5a.75.75 0 101.1 1.02l1.95-2.1v4.59z" clipRule="evenodd" /></svg>
                      Organic
                    </span>
                  ) : (
                    <span className="inline-block bg-gray-100 text-gray-500 text-xs font-medium px-2 py-0.5 rounded">
                      Conv.
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-sm text-gray-700">{p.format}</td>
                <td className="px-3 py-3 text-sm text-gray-700">{p.specification || "—"}</td>
                <td className="px-3 py-3 text-sm text-gray-700">{getUniqueCOOs(p).join(", ")}</td>
                <td className="px-3 py-3 text-sm text-gray-700">{p.packSize}</td>
                <td className="px-3 py-3 text-sm text-gray-700 text-right font-medium">{formatQuantity(getTotalQuantity(p), p.unitType)}</td>
                <td className="px-3 py-3 text-sm text-gray-700 text-right font-medium">{formatWeight(getTotalWeight(p))}</td>
                <td className="px-3 py-3 text-sm text-gray-600">
                  {getUniqueWarehouses(p).map((w, i) => (
                    <div key={i} className="text-xs leading-tight">{w}</div>
                  ))}
                </td>
                <td className="px-3 py-3 text-center">
                  <Link
                    href={`/contact?product=${encodeURIComponent(p.product)}`}
                    className="inline-block bg-[#1a2b5f] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#4a90c4] transition-colors"
                  >
                    Inquire
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-3">
        {filtered.map((p) => (
          <Link
            key={p.id}
            href={`/product/${p.id}`}
            className="block bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md hover:border-[#4a90c4]/30 transition-all"
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-[#1a2b5f] font-semibold text-sm">{p.product}</h3>
              {p.organic ? (
                <span className="shrink-0 bg-green-100 text-green-800 text-[10px] font-semibold px-2 py-0.5 rounded">
                  Organic
                </span>
              ) : (
                <span className="shrink-0 bg-gray-100 text-gray-500 text-[10px] font-medium px-2 py-0.5 rounded">
                  Conv.
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-gray-600">
              <div><span className="text-gray-400 text-xs">Format</span><br/>{p.format}</div>
              <div><span className="text-gray-400 text-xs">Origin</span><br/>{getUniqueCOOs(p).join(", ")}</div>
              <div><span className="text-gray-400 text-xs">Qty</span><br/>{formatQuantity(getTotalQuantity(p), p.unitType)}</div>
              <div><span className="text-gray-400 text-xs">Weight</span><br/>{formatWeight(getTotalWeight(p))}</div>
              <div className="col-span-2"><span className="text-gray-400 text-xs">Warehouse</span><br/>{getUniqueWarehouses(p).join(" | ")}</div>
            </div>
            {(p.certifications.length > 0 || docsSet.has(p.id)) && (
              <div className="flex gap-1.5 mt-2">
                {p.certifications.map((c) => (
                  <span key={c} className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{c}</span>
                ))}
                {docsSet.has(p.id) && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">Docs</span>
                )}
              </div>
            )}
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No products match your filters.</p>
          <button
            onClick={() => setFilters({ commodity: "", format: "", origin: "", state: "", search: "", type: "" })}
            className="mt-2 text-[#4a90c4] hover:underline text-sm"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}
