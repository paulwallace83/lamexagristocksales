"use client";

import { useState } from "react";
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
}

export default function InventoryTable({ products, lastUpdated }: InventoryTableProps) {
  const [filters, setFilters] = useState({
    commodity: "",
    format: "",
    origin: "",
    state: "",
    search: "",
    type: "",
  });

  const { commodities, formats, origins, states } = getFilterOptions(products);

  const handleFilterChange = (key: string, value: string | boolean) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
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

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          Showing {filtered.length} of {products.length} products
          {" | "}Last updated: {lastUpdated}
        </p>
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b-2 border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Format</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Spec</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Origin</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pack Size</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Quantity</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Weight</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Warehouse</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Price</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/product/${p.id}`} className="text-[#1a2b5f] font-semibold hover:underline">
                    {p.product}
                  </Link>
                </td>
                <td className="px-4 py-3 text-center">
                  {p.organic ? (
                    <span className="inline-block bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded">
                      Organic
                    </span>
                  ) : (
                    <span className="inline-block bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-0.5 rounded">
                      Conventional
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{p.format}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{p.specification || "—"}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{getUniqueCOOs(p).join(", ")}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{p.packSize}</td>
                <td className="px-4 py-3 text-sm text-gray-700 text-right">{formatQuantity(getTotalQuantity(p), p.unitType)}</td>
                <td className="px-4 py-3 text-sm text-gray-700 text-right">{formatWeight(getTotalWeight(p))}</td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {getUniqueWarehouses(p).map((w, i) => (
                    <div key={i} className="text-xs">{w}</div>
                  ))}
                </td>
                <td className="px-4 py-3 text-center">
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
      <div className="lg:hidden space-y-4">
        {filtered.map((p) => (
          <Link key={p.id} href={`/product/${p.id}`} className="block bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-[#1a2b5f] font-semibold">{p.product}</h3>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
              <div>
                <span className="font-medium text-gray-500">Type:</span>{" "}
                {p.organic ? (
                  <span className="bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded">Organic</span>
                ) : (
                  <span className="bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-0.5 rounded">Conventional</span>
                )}
              </div>
              <div><span className="font-medium text-gray-500">Format:</span> {p.format}</div>
              <div><span className="font-medium text-gray-500">Origin:</span> {getUniqueCOOs(p).join(", ")}</div>
              <div><span className="font-medium text-gray-500">Qty:</span> {formatQuantity(getTotalQuantity(p), p.unitType)}</div>
              <div><span className="font-medium text-gray-500">Weight:</span> {formatWeight(getTotalWeight(p))}</div>
              <div><span className="font-medium text-gray-500">Pack:</span> {p.packSize}</div>
              <div className="col-span-2">
                <span className="font-medium text-gray-500">Warehouse:</span>{" "}
                {getUniqueWarehouses(p).join(" | ")}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400">
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
