"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import FilterBar from "./FilterBar";
import {
  Product,
  getTotalQuantity,
  getTotalWeight,
  getUniqueCOOs,
  getUniqueWarehouses,
  formatWeight,
  formatQuantity,
} from "@/lib/inventory";
import { countryWithFlag } from "@/lib/country-flags";

interface InventoryTableProps {
  products: Product[];
  lastUpdated: string;
  productIdsWithDocs?: string[];
}

const FORMAT_ORDER = ["IQF", "Juice Concentrate", "Puree"];

function groupByFormat(products: Product[]): [string, Product[]][] {
  const groups = new Map<string, Product[]>();
  for (const p of products) {
    const list = groups.get(p.format) || [];
    list.push(p);
    groups.set(p.format, list);
  }
  return FORMAT_ORDER.filter((f) => groups.has(f)).map((f) => [f, groups.get(f)!]);
}

function GroupHeader({
  format,
  count,
  totalWeight,
  expanded,
  onToggle,
}: {
  format: string;
  count: number;
  totalWeight: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3 bg-[#1a2b5f]/[0.04] border border-gray-200 rounded-lg hover:bg-[#1a2b5f]/[0.07] transition-colors group"
    >
      <div className="flex items-center gap-3">
        <div className="w-1 h-6 rounded-full bg-[#1a2b5f]" />
        <h3 className="text-[#1a2b5f] font-semibold text-sm sm:text-base">{format}</h3>
        <span className="text-xs text-gray-500 font-medium">
          {count} product{count !== 1 ? "s" : ""}
        </span>
        <span className="hidden sm:inline text-xs text-gray-400">
          {formatWeight(totalWeight)}
        </span>
      </div>
      <svg
        className={`w-5 h-5 text-gray-400 group-hover:text-[#1a2b5f] transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );
}

export default function InventoryTable({ products, lastUpdated, productIdsWithDocs = [] }: InventoryTableProps) {
  const router = useRouter();
  const [filters, setFilters] = useState({
    commodity: "",
    format: "",
    origin: "",
    state: "",
    search: "",
    type: "",
  });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const docsSet = useMemo(() => new Set(productIdsWithDocs), [productIdsWithDocs]);

  const handleFilterChange = (key: string, value: string | boolean) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilter = (key: string) => {
    setFilters((prev) => ({ ...prev, [key]: "" }));
  };

  // Individual filter predicates keyed by filter name
  const predicates: Record<string, (p: Product) => boolean> = useMemo(() => {
    const searchQ = filters.search?.toLowerCase();
    return {
      commodity: (p) => !filters.commodity || p.commodity === filters.commodity,
      format: (p) => !filters.format || p.format === filters.format,
      origin: (p) => !filters.origin || p.listings.some((l) => l.countryOfOrigin === filters.origin),
      state: (p) => !filters.state || p.listings.some((l) => l.state === filters.state),
      type: (p) => {
        if (filters.type === "Organic") return p.organic;
        if (filters.type === "Conventional") return !p.organic;
        return true;
      },
      search: (p) => {
        if (!searchQ) return true;
        return [p.product, p.commodity, p.format, p.specification, p.variety, p.processType, ...p.certifications]
          .filter(Boolean).join(" ").toLowerCase().includes(searchQ);
      },
    };
  }, [filters]);

  const filtered = products.filter((p) => Object.values(predicates).every((fn) => fn(p)));

  // Cascading options: each dropdown shows only values available given the other active filters
  const { commodities, formats, origins, states, types } = useMemo(() => {
    const excluding = (exclude: string) =>
      products.filter((p) => Object.entries(predicates).every(([k, fn]) => k === exclude || fn(p)));
    const forCommodity = excluding("commodity");
    const forFormat = excluding("format");
    const forOrigin = excluding("origin");
    const forState = excluding("state");
    const forType = excluding("type");
    const availableTypes: string[] = [];
    if (forType.some((p) => p.organic)) availableTypes.push("Organic");
    if (forType.some((p) => !p.organic)) availableTypes.push("Conventional");
    return {
      commodities: [...new Set(forCommodity.map((p) => p.commodity))].sort(),
      formats: [...new Set(forFormat.map((p) => p.format))].sort(),
      origins: [...new Set(forOrigin.flatMap((p) => p.listings.map((l) => l.countryOfOrigin)))].sort(),
      states: [...new Set(forState.flatMap((p) => p.listings.map((l) => l.state)))].sort(),
      types: availableTypes,
    };
  }, [predicates, products]);

  const groups = useMemo(() => groupByFormat(filtered), [filtered]);

  const toggleGroup = (format: string) => {
    setCollapsed((prev) => ({ ...prev, [format]: !prev[format] }));
  };

  const activeFilters = Object.entries(filters).filter(([, v]) => v !== "");
  const hasFilters = activeFilters.length > 0;

  return (
    <div>
      <FilterBar
        commodities={commodities}
        formats={formats}
        origins={origins}
        states={states}
        types={types}
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
      <div className="hidden lg:block space-y-4">
        {groups.map(([format, groupProducts]) => {
          const isExpanded = !collapsed[format];
          const groupWeight = groupProducts.reduce((sum, p) => sum + getTotalWeight(p), 0);
          return (
            <div key={format}>
              <GroupHeader
                format={format}
                count={groupProducts.length}
                totalWeight={groupWeight}
                expanded={isExpanded}
                onToggle={() => toggleGroup(format)}
              />
              {isExpanded && (
                <div className="bg-white border border-t-0 border-gray-200 rounded-b-lg shadow-sm overflow-hidden">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Spec</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Origin</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pack Size</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Quantity</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Weight</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Warehouse</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupProducts.map((p, i) => (
                        <tr
                          key={p.id}
                          onClick={() => router.push(`/product/${p.id}`)}
                          className={`group border-b border-gray-100 hover:bg-blue-50/50 transition-colors cursor-pointer ${i % 2 === 1 ? "bg-gray-50/50" : ""}`}
                        >
                          <td className="px-4 py-3">
                            <Link href={`/product/${p.id}`} onClick={(e) => e.stopPropagation()} className="text-[#1a2b5f] font-semibold hover:underline">
                              {p.product}
                            </Link>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {p.certifications.filter((c) => c !== "Organic").map((c) => (
                                <span key={c} className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{c}</span>
                              ))}
                              {(() => { const lc = p.listings.reduce((s, l) => s + l.lots.length, 0); return lc > 0 ? (
                                <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">{lc} lot{lc > 1 ? "s" : ""}</span>
                              ) : null; })()}
                              {docsSet.has(p.id) && (
                                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium" title="Documents available">
                                  Docs
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            {p.organic ? (
                              <span className="inline-block bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded">
                                Organic
                              </span>
                            ) : (
                              <span className="inline-block bg-gray-100 text-gray-500 text-xs font-medium px-2 py-0.5 rounded">
                                Conventional
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-700">{p.specification || "—"}</td>
                          <td className="px-3 py-3 text-sm text-gray-700">{getUniqueCOOs(p).map(countryWithFlag).join(", ")}</td>
                          <td className="px-3 py-3 text-sm text-gray-700">{p.packSize}</td>
                          <td className="px-3 py-3 text-sm text-gray-700 text-right font-medium">{formatQuantity(getTotalQuantity(p), p.unitType)}</td>
                          <td className="px-3 py-3 text-sm text-gray-700 text-right font-medium">{formatWeight(getTotalWeight(p))}</td>
                          <td className="px-3 py-3 text-sm text-gray-600">
                            {getUniqueWarehouses(p).map((w, i) => (
                              <div key={i} className="text-xs leading-tight">{w}</div>
                            ))}
                          </td>
                          <td className="px-2 py-3 text-center text-gray-300 group-hover:text-[#4a90c4] transition-colors">
                            <svg className="w-4 h-4 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-5">
        {groups.map(([format, groupProducts]) => {
          const isExpanded = !collapsed[format];
          const groupWeight = groupProducts.reduce((sum, p) => sum + getTotalWeight(p), 0);
          return (
            <div key={format}>
              <GroupHeader
                format={format}
                count={groupProducts.length}
                totalWeight={groupWeight}
                expanded={isExpanded}
                onToggle={() => toggleGroup(format)}
              />
              {isExpanded && (
                <div className="space-y-3 pt-3">
                  {groupProducts.map((p) => (
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
                            Conventional
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-gray-600">
                        <div><span className="text-gray-400 text-xs">Origin</span><br/>{getUniqueCOOs(p).map(countryWithFlag).join(", ")}</div>
                        <div><span className="text-gray-400 text-xs">Qty</span><br/>{formatQuantity(getTotalQuantity(p), p.unitType)}</div>
                        <div><span className="text-gray-400 text-xs">Weight</span><br/>{formatWeight(getTotalWeight(p))}</div>
                        <div><span className="text-gray-400 text-xs">Warehouse</span><br/>{getUniqueWarehouses(p).join(" | ")}</div>
                      </div>
                      {(() => {
                        const lc = p.listings.reduce((s, l) => s + l.lots.length, 0);
                        const nonOrganicCerts = p.certifications.filter((c) => c !== "Organic");
                        const showBadges = nonOrganicCerts.length > 0 || lc > 0 || docsSet.has(p.id);
                        return showBadges ? (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {nonOrganicCerts.map((c) => (
                              <span key={c} className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{c}</span>
                            ))}
                            {lc > 0 && (
                              <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">{lc} lot{lc > 1 ? "s" : ""}</span>
                            )}
                            {docsSet.has(p.id) && (
                              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">Docs</span>
                            )}
                          </div>
                        ) : null;
                      })()}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
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
