"use client";

import { useState, useMemo } from "react";
import type { DiscountItem, DiscountReason, DiscountStatus } from "@/lib/discount";

// ─── Types ─────────────────────────────────────────────────────

interface LotOption {
  lotNumber: string;
  quantity: number;
  weightLbs: number;
  bbd: string;
  contracts: string[];
}

interface ListingOption {
  id: number;
  warehouse: string;
  city: string;
  state: string;
  supplier: string;
  countryOfOrigin: string;
  lots: LotOption[];
}

interface ProductOption {
  id: string;
  product: string;
  commodity: string;
  category: string;
  format: string;
  organic: boolean;
  packSize: string;
  unitType: string;
  listings: ListingOption[];
}

interface Props {
  existingItems: DiscountItem[];
  productOptions: ProductOption[];
}

interface LotOverride {
  reason?: DiscountReason;
  notes?: string;
  askingPrice?: string;
}

// ─── Constants ─────────────────────────────────────────────────

const REASON_OPTIONS: { value: DiscountReason; label: string }[] = [
  { value: "insurance-claim", label: "Insurance Claim" },
  { value: "expired", label: "Expired" },
  { value: "overstock", label: "Overstock" },
  { value: "damaged", label: "Damaged" },
  { value: "other", label: "Other" },
];

const REASON_COLORS: Record<DiscountReason, string> = {
  "insurance-claim": "bg-blue-100 text-blue-800",
  expired: "bg-amber-100 text-amber-800",
  overstock: "bg-gray-200 text-gray-700",
  damaged: "bg-red-100 text-red-800",
  other: "bg-purple-100 text-purple-800",
};

const STATUS_COLORS: Record<DiscountStatus, string> = {
  active: "bg-green-100 text-green-800",
  sold: "bg-gray-100 text-gray-500",
  missing: "bg-red-100 text-red-800",
};

// ─── Component ─────────────────────────────────────────────────

export default function DiscountFormClient({ existingItems, productOptions }: Props) {
  const [items, setItems] = useState(existingItems);

  // Lot picker state
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedLots, setSelectedLots] = useState<Set<string>>(new Set());
  const [expandedOverrides, setExpandedOverrides] = useState<Set<string>>(new Set());
  const [lotOverrides, setLotOverrides] = useState<Map<string, LotOverride>>(new Map());

  // Shared defaults
  const [defaultReason, setDefaultReason] = useState<DiscountReason>("expired");
  const [defaultNotes, setDefaultNotes] = useState("");
  const [defaultAskingPrice, setDefaultAskingPrice] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Get selected product's data
  const selectedProduct = useMemo(
    () => productOptions.find((p) => p.id === selectedProductId),
    [selectedProductId, productOptions],
  );

  // Build a flat list of all lots for the selected product with listing context
  const allLots = useMemo(() => {
    if (!selectedProduct) return [];
    return selectedProduct.listings.flatMap((l) =>
      l.lots.map((lot) => ({
        key: `${l.id}-${lot.lotNumber}`,
        ...lot,
        listing: l,
      })),
    );
  }, [selectedProduct]);

  // Selection totals
  const selectionStats = useMemo(() => {
    let qty = 0;
    let weight = 0;
    for (const lot of allLots) {
      if (selectedLots.has(lot.key)) {
        qty += lot.quantity;
        weight += lot.weightLbs;
      }
    }
    return { count: selectedLots.size, qty, weight };
  }, [allLots, selectedLots]);

  // ─── Handlers ──────────────────────────────────────────────

  function handleProductChange(productId: string) {
    setSelectedProductId(productId);
    setSelectedLots(new Set());
    setExpandedOverrides(new Set());
    setLotOverrides(new Map());
  }

  function toggleLot(key: string) {
    const next = new Set(selectedLots);
    if (next.has(key)) {
      next.delete(key);
      // Also collapse override
      const eo = new Set(expandedOverrides);
      eo.delete(key);
      setExpandedOverrides(eo);
    } else {
      next.add(key);
    }
    setSelectedLots(next);
  }

  function toggleAllLots() {
    if (selectedLots.size === allLots.length) {
      setSelectedLots(new Set());
      setExpandedOverrides(new Set());
    } else {
      setSelectedLots(new Set(allLots.map((l) => l.key)));
    }
  }

  function toggleOverride(key: string) {
    const next = new Set(expandedOverrides);
    if (next.has(key)) {
      next.delete(key);
      // Remove override data
      const om = new Map(lotOverrides);
      om.delete(key);
      setLotOverrides(om);
    } else {
      next.add(key);
    }
    setExpandedOverrides(next);
  }

  function setOverride(key: string, field: keyof LotOverride, value: string) {
    const om = new Map(lotOverrides);
    const current = om.get(key) || {};
    om.set(key, { ...current, [field]: value });
    setLotOverrides(om);
  }

  async function handleSubmit() {
    if (selectedLots.size === 0 || !selectedProduct) return;
    setSubmitting(true);
    setMessage(null);

    const batchItems = allLots
      .filter((lot) => selectedLots.has(lot.key))
      .map((lot) => {
        const override = lotOverrides.get(lot.key);
        return {
          productId: selectedProduct.id,
          lotNumber: lot.lotNumber,
          reason: override?.reason || defaultReason,
          notes: (override?.notes ?? defaultNotes) || null,
          askingPrice: (override?.askingPrice ?? defaultAskingPrice) || null,
        };
      });

    try {
      const res = await fetch("/api/discount/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: batchItems }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to create discount items" });
      } else {
        setMessage({
          type: "success",
          text: `Moved ${data.items.length} lot(s) to discount. Run sync or seed to deduct from regular inventory.`,
        });
        setItems([...data.items, ...items]);
        setSelectedLots(new Set());
        setExpandedOverrides(new Set());
        setLotOverrides(new Map());
        setSelectedProductId("");
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMarkSold(id: string) {
    try {
      const res = await fetch(`/api/discount/${id}`, { method: "DELETE" });
      if (res.ok) {
        setItems(items.map((i) => (i.id === id ? { ...i, status: "sold" as DiscountStatus } : i)));
      }
    } catch { /* ignore */ }
  }

  async function handleReactivate(id: string) {
    try {
      const res = await fetch(`/api/discount/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      if (res.ok) {
        setItems(items.map((i) => (i.id === id ? { ...i, status: "active" as DiscountStatus } : i)));
      }
    } catch { /* ignore */ }
  }

  async function handleRestore(id: string) {
    if (!confirm("Restore this item to regular inventory? The discount entry will be permanently deleted and the lot will reappear in regular inventory on next sync/seed.")) {
      return;
    }
    try {
      const res = await fetch(`/api/discount/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      if (res.ok) {
        setItems(items.filter((i) => i.id !== id));
        setMessage({ type: "success", text: "Item restored. Run sync or seed to return the lot to regular inventory." });
      }
    } catch { /* ignore */ }
  }

  const activeItems = items.filter((i) => i.status === "active");
  const inactiveItems = items.filter((i) => i.status !== "active");

  // ─── Render ────────────────────────────────────────────────

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Discount & Clearance Inventory</h1>
        <p className="text-gray-500 mt-1">
          Select lots from existing inventory to move to discount.
        </p>
      </div>

      {message && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* ─── Lot Picker ────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-8">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Move Lots to Discount</h2>
        </div>

        <div className="p-6">
          {/* Product selector */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Product</label>
            <select
              value={selectedProductId}
              onChange={(e) => handleProductChange(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b5f]/30"
            >
              <option value="">-- Choose a product --</option>
              {productOptions.map((p) => {
                const totalLots = p.listings.reduce((sum, l) => sum + l.lots.length, 0);
                return (
                  <option key={p.id} value={p.id}>
                    {p.product} ({p.organic ? "Organic" : "Conv"}) — {totalLots} lot{totalLots !== 1 ? "s" : ""}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Lot list */}
          {selectedProduct && allLots.length > 0 && (
            <>
              {/* Select all toggle */}
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={toggleAllLots}
                  className="text-xs font-medium text-[#1a2b5f] hover:underline"
                >
                  {selectedLots.size === allLots.length ? "Deselect All" : "Select All"}
                </button>
                <span className="text-xs text-gray-400">
                  {allLots.length} lot{allLots.length !== 1 ? "s" : ""} available
                </span>
              </div>

              {/* Group by listing */}
              {selectedProduct.listings.map((listing) => (
                <div key={listing.id} className="mb-4">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                    <span>{listing.warehouse}, {listing.city}, {listing.state}</span>
                    <span className="text-gray-300">|</span>
                    <span>{listing.supplier}</span>
                    <span className="text-gray-300">|</span>
                    <span>{listing.countryOfOrigin}</span>
                  </div>

                  <div className="space-y-2">
                    {listing.lots.map((lot) => {
                      const key = `${listing.id}-${lot.lotNumber}`;
                      const isSelected = selectedLots.has(key);
                      const isOverrideOpen = expandedOverrides.has(key);
                      const override = lotOverrides.get(key);

                      return (
                        <div
                          key={key}
                          className={`border rounded-lg transition-colors ${
                            isSelected
                              ? "border-amber-300 bg-amber-50/50"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          {/* Lot row */}
                          <div className="flex items-center gap-3 px-4 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleLot(key)}
                              className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                            />
                            <span className="font-mono text-sm font-medium text-gray-800 min-w-[120px]">
                              {lot.lotNumber}
                            </span>
                            <span className="text-sm text-gray-600">
                              {lot.quantity.toLocaleString()} {selectedProduct.unitType}
                            </span>
                            <span className="text-sm text-gray-600">
                              {lot.weightLbs.toLocaleString()} lbs
                            </span>
                            {lot.bbd && (
                              <span className="text-xs text-gray-400">
                                BBD {lot.bbd}
                              </span>
                            )}
                            <div className="flex-1 flex items-center gap-1 justify-end">
                              {lot.contracts.map((c) => (
                                <span key={c} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                                  {c}
                                </span>
                              ))}
                            </div>
                            {isSelected && (
                              <button
                                type="button"
                                onClick={() => toggleOverride(key)}
                                className={`text-xs px-2 py-1 rounded transition-colors ${
                                  isOverrideOpen
                                    ? "bg-amber-200 text-amber-800"
                                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                                }`}
                                title="Customize reason/notes/price for this lot"
                              >
                                {isOverrideOpen ? "Close" : "Edit"}
                              </button>
                            )}
                          </div>

                          {/* Per-lot override panel */}
                          {isSelected && isOverrideOpen && (
                            <div className="px-4 pb-3 pt-1 border-t border-amber-200/50">
                              <div className="grid grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Reason</label>
                                  <select
                                    value={override?.reason || ""}
                                    onChange={(e) =>
                                      setOverride(key, "reason", e.target.value)
                                    }
                                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                                  >
                                    <option value="">Use default</option>
                                    {REASON_OPTIONS.map((r) => (
                                      <option key={r.value} value={r.value}>
                                        {r.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Notes</label>
                                  <input
                                    type="text"
                                    value={override?.notes || ""}
                                    onChange={(e) =>
                                      setOverride(key, "notes", e.target.value)
                                    }
                                    placeholder="Override notes..."
                                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Asking Price</label>
                                  <input
                                    type="text"
                                    value={override?.askingPrice || ""}
                                    onChange={(e) =>
                                      setOverride(key, "askingPrice", e.target.value)
                                    }
                                    placeholder="e.g. $0.40/lb"
                                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Shared defaults */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                  Defaults (applied to lots without overrides)
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                    <select
                      value={defaultReason}
                      onChange={(e) => setDefaultReason(e.target.value as DiscountReason)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b5f]/30"
                    >
                      {REASON_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <input
                      type="text"
                      value={defaultNotes}
                      onChange={(e) => setDefaultNotes(e.target.value)}
                      placeholder="Context for all selected lots..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b5f]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Asking Price</label>
                    <input
                      type="text"
                      value={defaultAskingPrice}
                      onChange={(e) => setDefaultAskingPrice(e.target.value)}
                      placeholder="e.g. $0.30/lb"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b5f]/30"
                    />
                  </div>
                </div>
              </div>

              {/* Footer with totals + submit */}
              {selectedLots.size > 0 && (
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between">
                  <div className="text-sm text-amber-900">
                    <span className="font-semibold">{selectionStats.count}</span> lot{selectionStats.count !== 1 ? "s" : ""} selected
                    <span className="mx-2 text-amber-300">|</span>
                    {selectionStats.qty.toLocaleString()} {selectedProduct.unitType}
                    <span className="mx-2 text-amber-300">|</span>
                    {selectionStats.weight.toLocaleString()} lbs
                  </div>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium text-sm disabled:opacity-50 transition-colors"
                  >
                    {submitting
                      ? "Moving..."
                      : `Move ${selectionStats.count} Lot${selectionStats.count !== 1 ? "s" : ""} to Discount`}
                  </button>
                </div>
              )}
            </>
          )}

          {selectedProduct && allLots.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              No lots found for this product.
            </div>
          )}

          {!selectedProductId && (
            <div className="text-center text-gray-400 py-8">
              Select a product above to see available lots.
            </div>
          )}
        </div>
      </div>

      {/* ─── Active Discount Items ─────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-amber-50">
          <h2 className="text-lg font-semibold text-amber-900">
            Active Discount Items
            <span className="ml-2 text-sm font-normal text-amber-700">({activeItems.length})</span>
          </h2>
        </div>

        {activeItems.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            No active discount items.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-600">ID</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Product</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Reason</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Warehouse</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Qty</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Weight</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Price</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Added</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activeItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.id}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{item.product}</div>
                      {item.lotNumber && (
                        <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1 py-0.5 rounded">
                          {item.lotNumber}
                        </span>
                      )}
                      {item.notes && <div className="text-xs text-gray-500 mt-0.5">{item.notes}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${REASON_COLORS[item.reason]}`}>
                        {REASON_OPTIONS.find((r) => r.value === item.reason)?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{item.warehouse}, {item.state}</td>
                    <td className="px-4 py-3 text-gray-600">{item.quantity.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-600">{item.weightLbs.toLocaleString()} lbs</td>
                    <td className="px-4 py-3 text-gray-600">{item.askingPrice || "Inquire"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{item.addedDate}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleMarkSold(item.id)}
                          className="text-xs text-red-600 hover:text-red-800 font-medium"
                        >
                          Mark Sold
                        </button>
                        <button
                          onClick={() => handleRestore(item.id)}
                          className="text-xs text-green-600 hover:text-green-800 font-medium"
                        >
                          Restore
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Inactive Items ────────────────────────────────────── */}
      {inactiveItems.length > 0 && (
        <div className="mt-6 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-600">
              Sold / Missing Items
              <span className="ml-2 text-sm font-normal text-gray-400">({inactiveItems.length})</span>
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-600">ID</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Product</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Reason</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Weight</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {inactiveItems.map((item) => (
                  <tr key={item.id} className="opacity-60">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.id}</td>
                    <td className="px-4 py-3 text-gray-600">{item.product}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[item.status]}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${REASON_COLORS[item.reason]}`}>
                        {REASON_OPTIONS.find((r) => r.value === item.reason)?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{item.weightLbs.toLocaleString()} lbs</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleReactivate(item.id)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Reactivate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
