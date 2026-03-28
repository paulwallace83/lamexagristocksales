"use client";

import { useState } from "react";
import type { DiscountItem, DiscountReason } from "@/lib/discount";
import { formatWeight } from "@/lib/inventory";
import Link from "next/link";

interface DiscountSectionProps {
  items: DiscountItem[];
}

const REASON_LABELS: Record<DiscountReason, string> = {
  "insurance-claim": "Insurance Claim",
  expired: "Expired",
  overstock: "Overstock",
  damaged: "Damaged",
  other: "Other",
};

const REASON_COLORS: Record<DiscountReason, string> = {
  "insurance-claim": "bg-blue-100 text-blue-800",
  expired: "bg-amber-100 text-amber-800",
  overstock: "bg-gray-200 text-gray-700",
  damaged: "bg-red-100 text-red-800",
  other: "bg-purple-100 text-purple-800",
};

function formatPrice(askingPrice: string | null): string {
  if (!askingPrice) return "Inquire";
  const trimmed = askingPrice.trim();
  // If it's already formatted (contains $ or /), return as-is
  if (trimmed.includes("$") || trimmed.includes("/")) return trimmed;
  // If it's a bare number, format as $/lb
  const num = parseFloat(trimmed);
  if (!isNaN(num)) return `$${trimmed}/lb`;
  return trimmed;
}

export default function DiscountSection({ items }: DiscountSectionProps) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  const totalWeight = items.reduce((sum, i) => sum + i.weightLbs, 0);

  return (
    <div className="mt-8">
      {/* Section header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between bg-gradient-to-r from-amber-600 to-amber-700 text-white px-5 py-3 rounded-lg hover:from-amber-700 hover:to-amber-800 transition-colors"
      >
        <div className="flex items-center gap-3">
          <svg
            className={`w-4 h-4 transform transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-semibold text-lg">Discount & Clearance</span>
        </div>
        <div className="flex items-center gap-4 text-amber-100 text-sm">
          <span>{items.length} {items.length === 1 ? "item" : "items"}</span>
          <span>{formatWeight(totalWeight)}</span>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-2 bg-white border border-amber-200 rounded-lg overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-amber-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-amber-900">Product</th>
                  <th className="px-4 py-3 font-medium text-amber-900">Reason</th>
                  <th className="px-4 py-3 font-medium text-amber-900">Origin</th>
                  <th className="px-4 py-3 font-medium text-amber-900">Pack Size</th>
                  <th className="px-4 py-3 font-medium text-amber-900 text-right">Qty</th>
                  <th className="px-4 py-3 font-medium text-amber-900 text-right">Weight</th>
                  <th className="px-4 py-3 font-medium text-amber-900">Warehouse</th>
                  <th className="px-4 py-3 font-medium text-amber-900">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-amber-50/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {item.productId ? (
                          <Link
                            href={`/product/${item.productId}`}
                            className="font-medium text-[#1a2b5f] hover:underline"
                          >
                            {item.product}
                          </Link>
                        ) : (
                          <span className="font-medium text-gray-900">{item.product}</span>
                        )}
                        {item.organic && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-800 font-medium">
                            Organic
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {item.lotNumber && (
                          <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                            Lot {item.lotNumber}
                          </span>
                        )}
                        {item.contracts.map((c) => (
                          <span key={c} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                            {c}
                          </span>
                        ))}
                        {item.bbd && (
                          <span className="text-xs text-gray-400">
                            BBD {item.bbd}
                          </span>
                        )}
                      </div>
                      {item.notes && (
                        <div className="text-xs text-gray-500 mt-0.5">{item.notes}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${REASON_COLORS[item.reason]}`}>
                        {REASON_LABELS[item.reason]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{item.countryOfOrigin}</td>
                    <td className="px-4 py-3 text-gray-600">{item.packSize || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 text-right">
                      {item.quantity.toLocaleString()} {item.unitType}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-right">
                      {formatWeight(item.weightLbs)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {item.warehouse}, {item.state}
                    </td>
                    <td className="px-4 py-3 font-medium text-amber-800">
                      {formatPrice(item.askingPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {items.map((item) => (
              <div key={item.id} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    {item.productId ? (
                      <Link
                        href={`/product/${item.productId}`}
                        className="font-medium text-[#1a2b5f] hover:underline"
                      >
                        {item.product}
                      </Link>
                    ) : (
                      <span className="font-medium text-gray-900">{item.product}</span>
                    )}
                    {item.organic && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-800 font-medium">
                        Organic
                      </span>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${REASON_COLORS[item.reason]}`}>
                    {REASON_LABELS[item.reason]}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 mb-2 flex-wrap">
                  {item.lotNumber && (
                    <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      Lot {item.lotNumber}
                    </span>
                  )}
                  {item.contracts.map((c) => (
                    <span key={c} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                      {c}
                    </span>
                  ))}
                  {item.bbd && (
                    <span className="text-xs text-gray-400">BBD {item.bbd}</span>
                  )}
                </div>
                {item.notes && (
                  <p className="text-xs text-gray-500 mb-2">{item.notes}</p>
                )}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500 text-xs">Origin</span>
                    <p className="text-gray-700">{item.countryOfOrigin}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Warehouse</span>
                    <p className="text-gray-700">{item.warehouse}, {item.state}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Quantity</span>
                    <p className="text-gray-700">{item.quantity.toLocaleString()} {item.unitType}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Weight</span>
                    <p className="text-gray-700">{formatWeight(item.weightLbs)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Price</span>
                    <p className="font-medium text-amber-800">{formatPrice(item.askingPrice)}</p>
                  </div>
                  {item.packSize && (
                    <div>
                      <span className="text-gray-500 text-xs">Pack Size</span>
                      <p className="text-gray-700">{item.packSize}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
